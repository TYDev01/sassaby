import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  addTransfer,
  getTransfersByWalletAddress,
  getTransferById,
  updateTransferStatus,
  Transfer,
  SendToken,
  Currency,
} from "../store";
import { getTokenPriceUSD, getFlwRate } from "./rates";
import { prisma } from "../lib/prisma";

const VALID_TOKENS: SendToken[]   = ["STX", "USDCx", "BTC"];
const VALID_CURRENCIES: Currency[] = ["NGN", "GHS", "KES"];
/** Maximum send amount per-transfer (crypto units) — guard against fat-finger or abuse */
const MAX_SEND_AMOUNT = 1_000_000;

const router = Router();

// ─── Platform fee (all transfers are instant) ────────────────────────────────
const FEE_RATE = 0.015; // 1.5%

// ─── POST /api/transfers — create a new transfer ─────────────────────────────
// The Flutterwave payout is NOT triggered here. The chain monitor
// (src/lib/chainMonitor.ts) polls the blockchain and fires the payout once the
// user's on-chain deposit is confirmed.
router.post("/", async (req: Request, res: Response) => {
  const {
    sendAmount,
    sendToken,
    receiveCurrency,
    bank,
    bankCode,
    accountNumber,
    senderAddress = "",
  } = req.body as {
    sendAmount: number;
    sendToken: SendToken;
    receiveCurrency: Currency;
    bank: string;
    bankCode: string;
    accountNumber: string;
    /** The user's wallet address (STX or BTC).  Used by the chain monitor to
     *  cross-check the on-chain sender.  Optional — if absent the monitor
     *  checks for any matching deposit amount to the admin address. */
    senderAddress?: string;
  };

  // ── Presence check ────────────────────────────────────────────────────────
  if (!sendAmount || !sendToken || !receiveCurrency || !bank || !bankCode || !accountNumber) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  // ── Enum validation ───────────────────────────────────────────────────────
  if (!VALID_TOKENS.includes(sendToken as SendToken)) {
    return res.status(400).json({ error: `sendToken must be one of: ${VALID_TOKENS.join(", ")}.` });
  }
  if (!VALID_CURRENCIES.includes(receiveCurrency as Currency)) {
    return res.status(400).json({ error: `receiveCurrency must be one of: ${VALID_CURRENCIES.join(", ")}.` });
  }

  // ── Numeric bounds ────────────────────────────────────────────────────────
  if (typeof sendAmount !== "number" || sendAmount <= 0 || sendAmount > MAX_SEND_AMOUNT) {
    return res.status(400).json({ error: `sendAmount must be a positive number no greater than ${MAX_SEND_AMOUNT}.` });
  }

  // ── String length guards ──────────────────────────────────────────────────
  if (accountNumber.length > 20 || bank.length > 100 || bankCode.length > 20) {
    return res.status(400).json({ error: "One or more fields exceed the maximum allowed length." });
  }

  // Look up the admin deposit address for this token so the chain monitor
  // knows exactly which blockchain address to watch.
  const depositRow = await prisma.depositAddress.findUnique({
    where: { token: sendToken },
  });
  if (!depositRow) {
    return res.status(400).json({
      error: `No deposit address configured for ${sendToken}. Please contact support.`,
    });
  }
  const depositAddress = depositRow.address;

  let usdEquivalent = 0;
  let fee = 0;
  let receiveAmount = 0;
  try {
    const [tokenPrice, { rate: flwRate }] = await Promise.all([
      getTokenPriceUSD(sendToken),
      getFlwRate(receiveCurrency),
    ]);
    // Round at the boundary to prevent floating-point drift propagating.
    usdEquivalent = Math.round(sendAmount * tokenPrice * 100) / 100;
    fee           = Math.round(usdEquivalent * FEE_RATE * 100) / 100;
    // Store the actual fiat payout amount so the chain monitor can pass it
    // directly to Flutterwave without a second rate lookup.
    receiveAmount = Math.round((usdEquivalent - fee) * flwRate * 100) / 100;
  } catch (err) {
    console.error("[TRANSFERS] Failed to fetch live rates:", err);
    return res
      .status(502)
      .json({ error: "Could not fetch live rates. Please try again." });
  }

  const transfer: Transfer = {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    sendAmount,
    sendToken,
    usdEquivalent,
    receiveAmount,
    receiveCurrency,
    fee,
    feeRate: FEE_RATE,
    bank,
    bankCode,
    accountNumber,
    senderAddress,
    depositAddress,
    claimedTxId: "",
    // Status stays "pending" until the chain monitor detects the on-chain
    // deposit and updates it to "processing".
    status: "pending",
  };

  await addTransfer(transfer);

  console.log(
    `[TRANSFERS] Transfer ${transfer.id} created — awaiting on-chain confirmation ` +
      `at ${depositAddress} for ${sendAmount} ${sendToken}`
  );

  // Do NOT return accountNumber or full banking PII in the response.
  return res.status(201).json({
    success: true,
    id: transfer.id,
    status: transfer.status,
    depositAddress: transfer.depositAddress,
    sendAmount: transfer.sendAmount,
    sendToken: transfer.sendToken,
    receiveAmount: transfer.receiveAmount,
    receiveCurrency: transfer.receiveCurrency,
  });
});

// ─── GET /api/transfers — list transfers by wallet address ──────────────────
// Requires ?walletAddress= query param.  Returns PII-stripped transfer rows
// belonging only to that wallet so no user can read another user's records.
router.get("/", async (req: Request, res: Response) => {
  const { walletAddress } = req.query as { walletAddress?: string };

  if (!walletAddress || typeof walletAddress !== "string" || !walletAddress.trim()) {
    return res.status(400).json({ error: "walletAddress query parameter is required." });
  }

  // Basic format guard — Stacks principal (SP/SM) or Bitcoin address
  const stxRe = /^S[PM][0-9A-Z]{28,41}$/i;
  const btcRe = /^[13][a-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{6,87}$/;
  if (!stxRe.test(walletAddress) && !btcRe.test(walletAddress)) {
    return res.status(400).json({ error: "Invalid wallet address format." });
  }

  const transfers = await getTransfersByWalletAddress(walletAddress);

  // Strip financial PII (bank account number, bank code) from the public response.
  const safeTransfers = transfers.map(
    ({ accountNumber: _a, bankCode: _b, ...rest }) => rest
  );
  return res.json({ transfers: safeTransfers });
});

// ─── GET /api/transfers/:id — single transfer (status polling) ───────────────
// Strip financial PII — callers only need status and public fields.
router.get("/:id", async (req: Request, res: Response) => {
  const transfer = await getTransferById(req.params.id);
  if (!transfer) return res.status(404).json({ error: "Transfer not found." });
  const { accountNumber: _a, bankCode: _b, ...safe } = transfer;
  return res.json({ transfer: safe });
});

// ─── PATCH /api/transfers/:id/status — manual status override ────────────────
router.patch("/:id/status", async (req: Request, res: Response) => {
  const { status } = req.body as { status: string };
  const valid = ["pending", "processing", "completed", "failed"];
  if (!valid.includes(status)) {
    return res.status(400).json({ error: "Invalid status value." });
  }

  const updated = await updateTransferStatus(
    req.params.id,
    status as Transfer["status"],
    status === "completed" ? new Date().toISOString() : undefined
  );

  if (!updated) return res.status(404).json({ error: "Transfer not found." });
  return res.json({ success: true, transfer: updated });
});

export default router;

