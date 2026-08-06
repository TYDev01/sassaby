import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";

import {
  addTransfer,
  getOrdersByUserId,
  getOpenOrderForUser,
  getTransferById,
  transitionOrder,
  NewOrder,
  Order,
  OrderDirection,
  Currency,
} from "../store";
import { isSupportedAsset, findAsset } from "../lib/assets";
import { getTokenPriceUSD, getDeskRate } from "./rates";
import { sideForDirection } from "../lib/deskRate";
import { notifyPaymentClaimed } from "../lib/notify";
import { userAuth } from "../middleware/userAuth";
import { prisma } from "../lib/prisma";

const router = Router();

const VALID_CURRENCIES: Currency[] = ["NGN", "GHS", "KES"];
const VALID_DIRECTIONS: OrderDirection[] = ["buy", "sell"];

/** Guard against fat-finger and abuse (crypto units). */
const MAX_SEND_AMOUNT = 1_000_000;

/**
 * No separate platform fee.
 *
 * The margin is the spread between the desk's buy-side and sell-side P2P ads —
 * it is already inside the rate. Charging a percentage on top would bill the
 * client twice for the same thing.
 */
const FEE_RATE = 0;

/** Postgres unique-violation code — here, the one-open-order-per-user index. */
const PG_UNIQUE_VIOLATION = "P2002";

// ─── Response shaping ─────────────────────────────────────────────────────────

/**
 * The client's own bank details are theirs to see, but never echo the account
 * number back in list responses — it is the highest-value field in the record
 * and there is no reason a listing needs it.
 */
function publicOrder(order: Order) {
  const { accountNumber: _a, bankCode: _b, ...rest } = order;
  return rest;
}

// ─── POST /api/orders — create ────────────────────────────────────────────────
//
// "sell": the client sends crypto to a desk-controlled address; the chain
//         monitor detects it and notifies the operator to pay fiat out.
// "buy":  the client pays fiat to the desk's bank; the operator verifies the
//         credit in their banking app and releases crypto manually.

router.post("/", userAuth, async (req: Request, res: Response) => {
  const {
    direction,
    sendAmount,
    sendToken,
    chain,
    receiveCurrency,
    bank = "",
    bankCode = "",
    accountNumber = "",
    senderAddress = "",
    destinationAddress = "",
  } = req.body as {
    direction: OrderDirection;
    sendAmount: number;
    sendToken: string;
    chain: string;
    receiveCurrency: Currency;
    bank?: string;
    bankCode?: string;
    accountNumber?: string;
    senderAddress?: string;
    destinationAddress?: string;
  };

  // ── Enum validation ───────────────────────────────────────────────────────
  if (!VALID_DIRECTIONS.includes(direction)) {
    return res.status(400).json({ error: `direction must be one of: ${VALID_DIRECTIONS.join(", ")}.` });
  }
  if (!VALID_CURRENCIES.includes(receiveCurrency)) {
    return res.status(400).json({ error: `receiveCurrency must be one of: ${VALID_CURRENCIES.join(", ")}.` });
  }
  if (!sendToken || !chain || !isSupportedAsset(sendToken, chain)) {
    return res.status(400).json({ error: `${sendToken} on ${chain} is not a supported asset.` });
  }

  // ── Numeric bounds ────────────────────────────────────────────────────────
  if (typeof sendAmount !== "number" || !Number.isFinite(sendAmount) || sendAmount <= 0 || sendAmount > MAX_SEND_AMOUNT) {
    return res.status(400).json({ error: `sendAmount must be a positive number no greater than ${MAX_SEND_AMOUNT}.` });
  }

  // ── Direction-specific requirements ───────────────────────────────────────
  if (direction === "sell") {
    if (!bank || !bankCode || !accountNumber) {
      return res.status(400).json({ error: "Bank, bank code and account number are required to sell." });
    }
    if (accountNumber.length > 20 || bank.length > 100 || bankCode.length > 20) {
      return res.status(400).json({ error: "One or more fields exceed the maximum allowed length." });
    }
  } else {
    if (!destinationAddress || destinationAddress.length > 128) {
      return res.status(400).json({ error: "A destination wallet address is required to buy." });
    }
    // Releasing crypto is irreversible, so the account we will match the fiat
    // credit against has to be on file BEFORE the client sends money.
    if (!req.user!.bankAccountName) {
      return res.status(400).json({
        error: "Add the name on your bank account to your profile before buying.",
      });
    }
  }

  // ── One open order per user ───────────────────────────────────────────────
  // Checked here for a clean error message; enforced for real by the
  // `one_open_order_per_user` partial unique index, which is what actually
  // survives two tabs and refresh-and-retry.
  const existing = await getOpenOrderForUser(req.user!.id);
  if (existing) {
    return res.status(409).json({
      error: "You already have an order in progress. Complete or cancel it first.",
      openOrderId: existing.id,
    });
  }

  // ── Receiving address (sell only) ─────────────────────────────────────────
  let depositAddress = "";
  let depositMemo = "";
  if (direction === "sell") {
    const row = await prisma.depositAddress.findUnique({
      where: { token_chain: { token: sendToken, chain } },
    });
    if (!row || !row.active) {
      return res.status(400).json({
        error: `${sendToken} on ${chain} is not currently accepted. Please choose another asset.`,
      });
    }
    // Snapshotted onto the order: switching the active receiving address must
    // never move an in-flight order's deposit target.
    depositAddress = row.address;
    depositMemo = row.memo;
  }

  // ── Quote ─────────────────────────────────────────────────────────────────
  let usdEquivalent = 0;
  let fee = 0;
  let receiveAmount = 0;
  try {
    // Price the correct half of the desk's book: a client selling crypto is the
    // desk buying, and it pays out at its buy-side ad price. Using one number for
    // both directions gives the spread away.
    const [tokenPrice, desk] = await Promise.all([
      getTokenPriceUSD(sendToken),
      getDeskRate(receiveCurrency, sideForDirection(direction)),
    ]);
    const fiatRate = desk.rate;
    usdEquivalent = Math.round(sendAmount * tokenPrice * 100) / 100;
    fee           = 0;
    // Both directions convert at the desk rate for their side of the book; the
    // margin lives in the difference between those two rates, not in a markup.
    receiveAmount = Math.round(usdEquivalent * fiatRate * 100) / 100;
  } catch (err) {
    console.error("[ORDERS] Failed to fetch live rates:", err);
    return res.status(502).json({ error: "Could not fetch live rates. Please try again." });
  }

  // A quote that rounds to zero is a broken rate, not a cheap trade. Creating the
  // order anyway would put a client in a queue to pay or receive nothing, so
  // refuse it here rather than let an operator discover it at release time.
  if (!(usdEquivalent > 0) || !(receiveAmount > 0)) {
    console.error(
      `[ORDERS] Refusing zero-value quote: ${sendAmount} ${sendToken} → ` +
        `${receiveAmount} ${receiveCurrency} (usd ${usdEquivalent})`
    );
    return res.status(502).json({
      error: "Could not price this order right now. Please try again shortly.",
    });
  }

  const order: NewOrder = {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    userId: req.user!.id,
    direction,
    sendAmount,
    sendToken,
    chain,
    usdEquivalent,
    receiveAmount,
    receiveCurrency,
    fee,
    feeRate: FEE_RATE,
    bank:          direction === "sell" ? bank : "",
    bankCode:      direction === "sell" ? bankCode : "",
    accountNumber: direction === "sell" ? accountNumber : "",
    senderAddress: direction === "sell" ? senderAddress : "",
    depositAddress,
    destinationAddress: direction === "buy" ? destinationAddress.trim() : "",
    claimedTxId: "",
    status: direction === "sell" ? "awaiting_deposit" : "awaiting_payment",
    releasedBy: "",
    evidenceRef: "",
    rejectionReason: "",
  };

  try {
    await addTransfer(order);
  } catch (err) {
    // The partial unique index fired — a concurrent request beat us to it.
    if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
      const open = await getOpenOrderForUser(req.user!.id);
      return res.status(409).json({
        error: "You already have an order in progress. Complete or cancel it first.",
        openOrderId: open?.id,
      });
    }
    throw err;
  }

  console.log(
    `[ORDERS] ${direction} order ${order.id} created by ${req.user!.email} — ` +
      `${sendAmount} ${sendToken} on ${chain}`
  );

  return res.status(201).json({
    success: true,
    id: order.id,
    direction,
    status: order.status,
    sendAmount,
    sendToken,
    chain,
    receiveAmount,
    receiveCurrency,
    // Sell: where to deposit. Buy: the client is shown desk bank details, which
    // are admin config fetched separately.
    depositAddress,
    depositMemo,
    memoRequired: findAsset(sendToken, chain)?.requiresMemo === true,
  });
});

// ─── GET /api/orders — the caller's own orders ────────────────────────────────

router.get("/", userAuth, async (req: Request, res: Response) => {
  const orders = await getOrdersByUserId(req.user!.id);
  return res.json({ orders: orders.map(publicOrder) });
});

// ─── GET /api/orders/open — the caller's live order, if any ───────────────────

router.get("/open", userAuth, async (req: Request, res: Response) => {
  const open = await getOpenOrderForUser(req.user!.id);
  return res.json({ order: open ? publicOrder(open) : null });
});

// ─── GET /api/orders/:id ──────────────────────────────────────────────────────

router.get("/:id", userAuth, async (req: Request, res: Response) => {
  const order = await getTransferById(req.params.id);
  // Same 404 for "missing" and "not yours" — a distinct 403 would confirm the
  // existence of another user's order id.
  if (!order || order.userId !== req.user!.id) {
    return res.status(404).json({ error: "Order not found." });
  }
  return res.json({ order: publicOrder(order) });
});

// ─── POST /api/orders/:id/claim-payment — buy leg ─────────────────────────────
// The client asserts they have paid. This does NOT release anything: it moves
// the order into the operator's verification queue and notifies them.

router.post("/:id/claim-payment", userAuth, async (req: Request, res: Response) => {
  const order = await getTransferById(req.params.id);
  if (!order || order.userId !== req.user!.id) {
    return res.status(404).json({ error: "Order not found." });
  }
  if (order.direction !== "buy") {
    return res.status(400).json({ error: "Only buy orders take a payment claim." });
  }

  const updated = await transitionOrder(order.id, "awaiting_payment", "payment_claimed");
  if (!updated) {
    return res.status(409).json({
      error: "This order is no longer awaiting payment.",
      status: order.status,
    });
  }

  await notifyPaymentClaimed(updated, req.user!.bankAccountName);

  console.log(`[ORDERS] Payment claimed on ${order.id} by ${req.user!.email}`);
  return res.json({ success: true, order: publicOrder(updated) });
});

// ─── POST /api/orders/:id/cancel ──────────────────────────────────────────────
// Only before anything is in flight. Once payment is claimed or a deposit has
// landed, cancellation is the operator's call — otherwise a client could cancel
// while their bank transfer is still settling.

router.post("/:id/cancel", userAuth, async (req: Request, res: Response) => {
  const order = await getTransferById(req.params.id);
  if (!order || order.userId !== req.user!.id) {
    return res.status(404).json({ error: "Order not found." });
  }

  if (order.status !== "awaiting_payment" && order.status !== "awaiting_deposit") {
    return res.status(409).json({
      error:
        "This order can no longer be cancelled here. Contact support if you need it reviewed.",
      status: order.status,
    });
  }

  const updated = await transitionOrder(order.id, order.status, "expired");
  if (!updated) {
    return res.status(409).json({ error: "This order has already moved on." });
  }

  console.log(`[ORDERS] Order ${order.id} cancelled by ${req.user!.email}`);
  return res.json({ success: true, order: publicOrder(updated) });
});

export default router;
