import { Router, Request, Response as ExpressResponse } from "express";
import axios from "axios";
import { prisma } from "../lib/prisma";
import { adminAuth } from "../middleware/adminAuth";

const router = Router();

const FLW_V3_BASE = "https://api.flutterwave.com/v3";

// ─── CoinGecko ID map (no API key required) ───────────────────────────────────

const COINGECKO_IDS: Record<string, string> = {
  STX: "blockstack",
  BTC: "bitcoin",
  USDCx: "usd-coin",  // Bridged USDC on Stacks — tracks USDC 1:1
};

// ─── Token price cache (60s TTL) ─────────────────────────────────────────────

interface PriceEntry { priceUsd: number; expiresAt: number; }
const priceCache: Record<string, PriceEntry> = {};

export async function getTokenPriceUSD(token: string): Promise<number> {
  const geckoId = COINGECKO_IDS[token];
  if (!geckoId) throw new Error(`Unsupported token: ${token}`);

  const cached = priceCache[geckoId];
  if (cached && Date.now() < cached.expiresAt) return cached.priceUsd;

  const { data: json } = await axios.get<Record<string, { usd: number }>>(
    `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd`,
    { headers: { Accept: "application/json", "User-Agent": "Sassaby/1.0 (https://sassaby.app)" }, timeout: 10_000 }
  );
  const price = json[geckoId]?.usd;
  if (!price) throw new Error(`No price data for ${token}`);

  priceCache[geckoId] = { priceUsd: price, expiresAt: Date.now() + 60_000 };
  return price;
}



// ─── Supported currencies ────────────────────────────────────────────────────

const SUPPORTED_CURRENCIES = ["NGN", "GHS", "KES"] as const;

// ─── Platform fee (must match transfers.ts) ────────────────────────────────────
const FEE_RATE = 0.015; // 1.5%

// ─── Admin rate config (PostgreSQL-backed) ─────────────────────────────────────────

export type RateMode = "api" | "manual";

export interface RateConfig {
  modes: Record<string, RateMode>;
  manualRates: Record<string, number>;
}

/** Load all RateConfig rows from DB, seeding defaults if the table is empty. */
async function loadRateConfig(): Promise<RateConfig> {
  // Seed default rows if missing (mode: api, manualRate: 0 until admin sets it)
  for (const currency of SUPPORTED_CURRENCIES) {
    await prisma.rateConfig.upsert({
      where: { currency },
      create: { currency, mode: "api", manualRate: 0 },
      update: {},
    });
  }

  const rows = await prisma.rateConfig.findMany();
  const modes: Record<string, RateMode> = {};
  const manualRates: Record<string, number> = {};
  for (const row of rows) {
    modes[row.currency] = row.mode as RateMode;
    manualRates[row.currency] = Number(row.manualRate);
  }
  return { modes, manualRates };
}

// GET /api/rates/config
router.get("/config", async (_req, res: ExpressResponse) => {
  try {
    return res.json(await loadRateConfig());
  } catch (err) {
    console.error("[RATES] config load failed:", err);
    return res.status(500).json({ error: "Failed to load rate config." });
  }
});

// POST /api/rates/config
router.post("/config", adminAuth, async (req, res: ExpressResponse) => {
  const { modes, manualRates } = req.body as Partial<RateConfig>;

  const updates: Promise<unknown>[] = [];

  if (modes) {
    for (const [currency, mode] of Object.entries(modes)) {
      if (mode === "api" || mode === "manual") {
        updates.push(
          prisma.rateConfig.upsert({
            where: { currency },
            create: { currency, mode, manualRate: 0 },
            update: { mode },
          })
        );
      }
    }
  }

  if (manualRates) {
    for (const [currency, rate] of Object.entries(manualRates)) {
      const n = Number(rate);
      if (n > 0) {
        updates.push(
          prisma.rateConfig.upsert({
            where: { currency },
            create: { currency, mode: "manual", manualRate: n },
            update: { manualRate: n, mode: "manual" },
          })
        );
      }
    }
  }

  try {
    await Promise.all(updates);

    // Bust FLW rate cache for changed currencies
    const changed = Object.keys({ ...modes, ...manualRates });
    for (const cur of changed) delete flwRateCache[`USD→${cur}`];

    return res.json(await loadRateConfig());
  } catch (err) {
    console.error("[RATES] config update failed:", err);
    return res.status(500).json({ error: "Failed to update rate config." });
  }
});

// ─── Flutterwave rate cache (5-min TTL) ──────────────────────────────────────

interface FlwRateEntry { rate: number; expiresAt: number; }
const flwRateCache: Record<string, FlwRateEntry> = {};

export async function getFlwRate(destCurrency: string): Promise<{ rate: number }> {
  // ── Check admin config in DB ──────────────────────────────────────────────
  try {
    const row = await prisma.rateConfig.findUnique({ where: { currency: destCurrency } });
    if (row && row.mode === "manual" && Number(row.manualRate) > 0) {
      return { rate: Number(row.manualRate) };
    }
  } catch {
    // DB unavailable — fall through to live rate
  }

  const cacheKey = `USD→${destCurrency}`;
  const cached = flwRateCache[cacheKey];
  if (cached && Date.now() < cached.expiresAt) return { rate: cached.rate };

  try {
    const secretKey = process.env.FLW_SECRET_KEY;
    if (!secretKey) throw new Error("FLW_SECRET_KEY is not set.");
    const { data: json } = await axios.get<{
      status: string;
      data?: { rate: number; source: { amount: number }; destination: { amount: number } };
    }>(
      `${FLW_V3_BASE}/transfers/rates?amount=1&source_currency=USD&destination_currency=${encodeURIComponent(destCurrency)}`,
      { headers: { Authorization: `Bearer ${secretKey}` }, timeout: 10_000 }
    );
    // data.rate = USD per 1 dest unit; invert to get dest units per 1 USD
    const rawRate = json.data?.rate;
    if (rawRate && rawRate > 0) {
      const rate = 1 / rawRate;
      flwRateCache[cacheKey] = { rate, expiresAt: Date.now() + 5 * 60_000 };
      return { rate };
    }
  } catch (err) {
    console.warn(`[RATES] FLW rate fetch failed for ${destCurrency}:`, (err as Error).message);
  }

  throw new Error(
    `No rate available for ${destCurrency}. ` +
    `Set a manual rate in the admin dashboard or ensure Flutterwave API is reachable.`
  );
}

// ─── GET /api/rates?token=STX&amount=10&currency=NGN ─────────────────────────

export interface RateQuoteResponse {
  token: string;
  tokenPriceUSD: number;
  usdAmount: number;
  flwRate: number;
  receiveAmount: number;
  currency: string;
  rateSource: "flutterwave" | "manual";
  rateMode: RateMode;
}

router.get("/", async (req: Request, res: ExpressResponse) => {
  const { token, amount, currency } = req.query as {
    token?: string; amount?: string; currency?: string;
  };

  if (!token || !currency)
    return res.status(400).json({ error: "token and currency query params are required." });

  const parsedAmount = parseFloat(amount ?? "1");
  if (isNaN(parsedAmount) || parsedAmount <= 0)
    return res.status(400).json({ error: "amount must be a positive number." });

  try {
    const [tokenPriceUSD, { rate: flwRate }] = await Promise.all([
      getTokenPriceUSD(token),
      getFlwRate(currency),
    ]);

    const usdAmount = parsedAmount * tokenPriceUSD;
    const fee = usdAmount * FEE_RATE;
    const receiveAmount = (usdAmount - fee) * flwRate;

    // Read mode from DB to annotate the response
    const configRow = await prisma.rateConfig.findUnique({ where: { currency } }).catch(() => null);
    const mode: RateMode = (configRow?.mode as RateMode) ?? "api";

    return res.json({
      token, tokenPriceUSD, usdAmount, flwRate, receiveAmount, currency,
      rateSource: mode === "manual" ? "manual" : "flutterwave",
      rateMode: mode,
    } satisfies RateQuoteResponse);
  } catch (err) {
    console.error("[RATES]", err);
    const msg = err instanceof Error
      ? (err.message || err.constructor.name || "Failed to fetch rates.")
      : "Failed to fetch rates.";
    return res.status(502).json({ error: msg });
  }
});

export default router;
