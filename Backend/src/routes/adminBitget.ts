/**
 * Operator control of the Bitget P2P ad book (UTA v3).
 *
 * This is where the desk's rate lives. `lib/deskRate.ts` prices every quote off
 * the ads recorded here, so repricing moves the customer-facing rate — published
 * price and quoted price are the same number by construction.
 *
 * Admin-only. Nothing returns credentials; errors carry Bitget's own message and
 * status code only.
 */

import { Router, Request, Response } from "express";

import { adminAuth } from "../middleware/adminAuth";
import {
  isConfigured,
  checkStatus,
  fetchAdList,
  fetchMyAds,
  fetchPendingOrders,
  fetchAllOrders,
  OrderStatusFilter,
  fetchKnownPayMethodIds,
  createAd,
  updateAd,
  PayMethodRef,
  P2P,
} from "../lib/bitget";
import { __resetDeskRateCache } from "../lib/deskRate";
import { prisma } from "../lib/prisma";

const router = Router();

router.use(adminAuth);

const VALID_SIDES = ["buy", "sell"] as const;
type Side = (typeof VALID_SIDES)[number];

const VALID_PRICE_TYPES = ["fixed", "floating"] as const;
type PriceType = (typeof VALID_PRICE_TYPES)[number];

/** Bitget accepts only these payment windows. */
const VALID_PAY_TIME_LIMITS = ["5", "10"];

/** Bitget errors are operational, not bugs — surface the message, keep the 502. */
function fail(res: Response, err: unknown) {
  const message = (err as Error).message ?? "Bitget request failed.";
  console.error("[BITGET]", message);
  return res.status(502).json({ error: message });
}

function requireConfigured(res: Response): boolean {
  if (isConfigured()) return true;
  res.status(503).json({
    error:
      "Bitget API credentials are not configured. Set BITGET_API_KEY, " +
      "BITGET_API_SECRET and BITGET_API_PASSPHRASE.",
  });
  return false;
}

function positive(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Normalise the payMethodIds array Bitget expects. */
function parsePayMethods(raw: unknown, side: Side): PayMethodRef[] | string {
  if (!Array.isArray(raw) || raw.length === 0) {
    return "payMethodIds is required and must be a non-empty array.";
  }
  const out: PayMethodRef[] = [];
  for (const entry of raw) {
    const e = entry as Record<string, unknown>;
    const payMethodId = typeof e?.payMethodId === "string" ? e.payMethodId : "";
    if (!payMethodId) return "Each payMethodIds entry needs a payMethodId.";
    const userPayMethodId =
      typeof e?.userPayMethodId === "string" ? e.userPayMethodId : undefined;
    // Selling means the desk receives fiat, so Bitget needs to know which of the
    // desk's own collection methods to show the buyer.
    if (side === "sell" && !userPayMethodId) {
      return "userPayMethodId is required on every payMethodIds entry for sell-side ads.";
    }
    out.push({ payMethodId, ...(userPayMethodId ? { userPayMethodId } : {}) });
  }
  return out;
}

// ─── GET /status ──────────────────────────────────────────────────────────────
// Uses user-info: read permission only, no parameters, and it proves the key,
// secret, passphrase and permissions work together.

router.get("/status", async (_req: Request, res: Response) => {
  const status = await checkStatus();
  return res.json({ ...status, endpoints: P2P });
});

// ─── GET /market — the public book ────────────────────────────────────────────
// Where the rest of the market is pricing, so the operator can decide where to
// sit. Not the desk's own ads.

router.get("/market", async (req: Request, res: Response) => {
  if (!requireConfigured(res)) return;

  const { token = "USDT", fiat = "NGN", side = "sell", amount } = req.query as Record<string, string>;
  if (!VALID_SIDES.includes(side as Side)) {
    return res.status(400).json({ error: `side must be one of: ${VALID_SIDES.join(", ")}.` });
  }

  try {
    const ads = await fetchAdList({
      token,
      fiat,
      side: side as Side,
      amount: amount ? Number(amount) : undefined,
    });
    return res.json({ ads, count: ads.length });
  } catch (err) {
    return fail(res, err);
  }
});

// ─── GET /ads — the desk's own ads, live from Bitget ──────────────────────────
// Falls back to the local mirror if Bitget is unreachable, so the page still
// renders something rather than going blank.

router.get("/ads", async (_req: Request, res: Response) => {
  if (isConfigured()) {
    try {
      const ads = await fetchMyAds();
      // Merge the local pricing flag onto the live rows. Bitget knows nothing
      // about it, so without this the dashboard cannot show — and the operator
      // cannot clear — an ad the desk has stopped quoting from.
      const mirror = await prisma.deskAd.findMany({
        where: { advId: { in: ads.map((a) => a.advId) } },
        select: { advId: true, active: true },
      });
      const inactive = new Set(
        mirror.filter((m) => !m.active).map((m) => m.advId)
      );
      return res.json({
        ads: ads.map((a) => ({ ...a, active: !inactive.has(a.advId) })),
        count: ads.length,
        source: "bitget",
      });
    } catch (err) {
      console.warn("[BITGET] my-ads failed, serving mirror:", (err as Error).message);
    }
  }
  const mirrored = await prisma.deskAd.findMany({ orderBy: { updatedAt: "desc" } });
  return res.json({
    ads: mirrored.map((a) => ({ ...a, live: a.active, status: a.active ? "mirror" : "inactive" })),
    count: mirrored.length,
    source: "mirror",
  });
});

// ─── GET /orders — incoming P2P orders ────────────────────────────────────────

const VALID_ORDER_STATUSES = [
  "pending_payment",
  "pending_release",
  "completed",
  "cancelled",
  "in_appeal",
] as const;

router.get("/orders", async (req: Request, res: Response) => {
  if (!requireConfigured(res)) return;

  const { side, cursor, status, limit } = req.query as Record<string, string>;
  if (side && !VALID_SIDES.includes(side as Side)) {
    return res.status(400).json({ error: `side must be one of: ${VALID_SIDES.join(", ")}.` });
  }
  if (status && status !== "pending" && !VALID_ORDER_STATUSES.includes(status as OrderStatusFilter)) {
    return res.status(400).json({
      error: `status must be "pending" or one of: ${VALID_ORDER_STATUSES.join(", ")}.`,
    });
  }

  try {
    // "pending" is the live action queue and has its own endpoint, which bundles
    // pending_payment, pending_release and in_appeal. Everything else — including
    // history — comes from all-orders.
    const args = {
      side: side as Side | undefined,
      cursor: cursor || undefined,
      limit: limit ? Number(limit) : undefined,
    };
    const { orders, nextId } =
      status === "pending" || !status
        ? await fetchPendingOrders(args)
        : await fetchAllOrders({ ...args, status: status as OrderStatusFilter });

    return res.json({ orders, count: orders.length, nextId });
  } catch (err) {
    return fail(res, err);
  }
});

// ─── GET /pay-methods — IDs this desk has used before ─────────────────────────
// Bitget exposes no payment-method listing endpoint (all candidates 404), so the
// desk's own ad history is the catalogue.

router.get("/pay-methods", async (_req: Request, res: Response) => {
  if (!requireConfigured(res)) return;
  try {
    return res.json({ payMethodIds: await fetchKnownPayMethodIds() });
  } catch (err) {
    return fail(res, err);
  }
});

// ─── POST /ads — publish an ad ────────────────────────────────────────────────

router.post("/ads", async (req: Request, res: Response) => {
  if (!requireConfigured(res)) return;

  const {
    token,
    fiat,
    side,
    priceType = "fixed",
    price,
    premium,
    quantity,
    minAmount,
    maxAmount,
    payMethodIds,
    payTimeLimit = "10",
    remark,
    tradeTerms,
  } = req.body as Record<string, unknown>;

  if (typeof token !== "string" || !token) {
    return res.status(400).json({ error: "token is required (e.g. USDT)." });
  }
  if (typeof fiat !== "string" || !fiat) {
    return res.status(400).json({ error: "fiat is required (e.g. NGN)." });
  }
  if (!VALID_SIDES.includes(side as Side)) {
    return res.status(400).json({ error: `side must be one of: ${VALID_SIDES.join(", ")}.` });
  }
  if (!VALID_PRICE_TYPES.includes(priceType as PriceType)) {
    return res.status(400).json({ error: `priceType must be one of: ${VALID_PRICE_TYPES.join(", ")}.` });
  }
  if (!VALID_PAY_TIME_LIMITS.includes(String(payTimeLimit))) {
    return res.status(400).json({
      error: `payTimeLimit must be one of: ${VALID_PAY_TIME_LIMITS.join(", ")} (minutes).`,
    });
  }

  const p = priceType === "fixed" ? positive(price) : null;
  const prem = priceType === "floating" ? Number(premium) : null;
  if (priceType === "fixed" && p === null) {
    return res.status(400).json({ error: "price must be a positive number when priceType is fixed." });
  }
  if (priceType === "floating" && !Number.isFinite(prem)) {
    return res.status(400).json({ error: "premium is required when priceType is floating." });
  }

  const q = positive(quantity);
  const min = positive(minAmount);
  const max = positive(maxAmount);
  if (q === null) return res.status(400).json({ error: "quantity must be a positive number." });
  if (min === null || max === null) {
    return res.status(400).json({ error: "minAmount and maxAmount must be positive numbers." });
  }
  if (min > max) return res.status(400).json({ error: "minAmount cannot exceed maxAmount." });

  const methods = parsePayMethods(payMethodIds, side as Side);
  if (typeof methods === "string") return res.status(400).json({ error: methods });

  try {
    const result = await createAd({
      token,
      fiat,
      side: side as Side,
      priceType: priceType as PriceType,
      ...(p !== null ? { price: p } : {}),
      ...(prem !== null && Number.isFinite(prem) ? { premium: prem as number } : {}),
      quantity: q,
      minAmount: min,
      maxAmount: max,
      payMethodIds: methods,
      payTimeLimit: String(payTimeLimit),
      ...(typeof remark === "string" ? { remark } : {}),
      ...(typeof tradeTerms === "string" ? { tradeTerms } : {}),
    });

    // Mirror it locally — quotes price off this, and there is no "my ads" read
    // endpoint to recover it from if we don't record it now.
    if (result?.advId && p !== null) {
      await prisma.deskAd.create({
        data: {
          advId: result.advId,
          token: token.toUpperCase(),
          fiat: fiat.toUpperCase(),
          side: side as string,
          price: p,
          priceType: priceType as string,
          active: true,
        },
      });
    }

    __resetDeskRateCache();
    console.log(`[BITGET] Published ${side} ad ${token}/${fiat} at ${p ?? `+${prem}%`}`);
    return res.status(201).json({ success: true, advId: result?.advId, result });
  } catch (err) {
    return fail(res, err);
  }
});

// ─── PATCH /ads/:advId — reprice / resize ─────────────────────────────────────
// The rate control: quotes read the desk's ad price, so changing it here changes
// what customers are quoted on the next request.

router.patch("/ads/:advId", async (req: Request, res: Response) => {
  if (!requireConfigured(res)) return;

  const { price, premium, priceType, quantity, minAmount, maxAmount, payTimeLimit, remark } =
    req.body as Record<string, unknown>;

  if (payTimeLimit !== undefined && !VALID_PAY_TIME_LIMITS.includes(String(payTimeLimit))) {
    return res.status(400).json({
      error: `payTimeLimit must be one of: ${VALID_PAY_TIME_LIMITS.join(", ")} (minutes).`,
    });
  }

  const patch: Parameters<typeof updateAd>[0] = {
    advId: req.params.advId,
    // Bitget marks payTimeLimit required on update even when unchanged.
    payTimeLimit: String(payTimeLimit ?? "10"),
  };

  let newPrice: number | null = null;
  for (const [key, raw] of [
    ["price", price],
    ["quantity", quantity],
    ["minAmount", minAmount],
    ["maxAmount", maxAmount],
  ] as const) {
    if (raw === undefined) continue;
    const n = positive(raw);
    if (n === null) return res.status(400).json({ error: `${key} must be a positive number.` });
    patch[key] = n;
    if (key === "price") newPrice = n;
  }
  if (premium !== undefined && Number.isFinite(Number(premium))) patch.premium = Number(premium);
  if (priceType === "fixed" || priceType === "floating") patch.priceType = priceType;
  if (typeof remark === "string") patch.remark = remark;

  if (patch.minAmount !== undefined && patch.maxAmount !== undefined && patch.minAmount > patch.maxAmount) {
    return res.status(400).json({ error: "minAmount cannot exceed maxAmount." });
  }

  try {
    const result = await updateAd(patch);

    if (newPrice !== null) {
      await prisma.deskAd
        .update({ where: { advId: patch.advId }, data: { price: newPrice } })
        .catch(() => {
          // Ad published outside this API — nothing mirrored to update.
          console.warn(`[BITGET] Repriced unknown ad ${patch.advId}; not mirrored locally.`);
        });
    }

    __resetDeskRateCache();
    console.log(
      `[BITGET] Updated ad ${patch.advId}` + (newPrice !== null ? ` — price now ${newPrice}` : "")
    );
    return res.json({ success: true, result });
  } catch (err) {
    return fail(res, err);
  }
});

// ─── POST /ads/:advId/active — include in / exclude from pricing ──────────────
// Local only: no confirmed Bitget online/offline endpoint yet. Marking an ad
// inactive stops it being used for quotes; it stays live on Bitget until taken
// down there.

router.post("/ads/:advId/active", async (req: Request, res: Response) => {
  const { active } = req.body as { active?: boolean };
  if (typeof active !== "boolean") {
    return res.status(400).json({ error: "active must be true or false." });
  }

  const advId = req.params.advId;

  try {
    let ad = await prisma.deskAd.findUnique({ where: { advId } });

    // An ad published from the Bitget app has no mirror row here, and the
    // operator still has to be able to switch it off. Build the row from the
    // live ad rather than refusing.
    if (!ad && isConfigured()) {
      const live = (await fetchMyAds()).find((a) => a.advId === advId);
      if (live) {
        ad = await prisma.deskAd.create({
          data: {
            advId,
            token: live.token,
            fiat: live.fiat,
            side: live.side,
            price: live.price,
            active,
          },
        });
      }
    }

    if (!ad) {
      return res.status(404).json({ error: "No such ad on this desk." });
    }

    if (ad.active !== active) {
      ad = await prisma.deskAd.update({ where: { advId }, data: { active } });
    }

    __resetDeskRateCache();
    return res.json({
      success: true,
      ad,
      note: active
        ? "This ad prices quotes again."
        : "Quotes no longer price off this ad. It is still live on Bitget — delist it there to stop trading on it.",
    });
  } catch (err) {
    console.error("[BITGET] active toggle failed:", err);
    return res.status(500).json({ error: "Could not update the ad." });
  }
});

export default router;
