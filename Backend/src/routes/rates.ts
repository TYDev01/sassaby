import { Router, Request, Response as ExpressResponse } from "express";
import axios from "axios";
import { prisma } from "../lib/prisma";
import { adminAuth } from "../middleware/adminAuth";
import { getBitgetRate, __resetDeskRateCache, DeskSide, RateSource } from "../lib/deskRate";

const router = Router();


// ─── CoinGecko ID map (no API key required) ───────────────────────────────────

// Keyed on token symbol alone: an asset's USD price does not depend on which
// chain it moves over, so USDT on Tron and USDT on BSC share one entry. Every
// token in lib/assets.ts needs a row here or a quote for it throws.
const COINGECKO_IDS: Record<string, string> = {
  BTC:  "bitcoin",
  LTC:  "litecoin",
  ETH:  "ethereum",
  BNB:  "binancecoin",
  TRX:  "tron",
  SOL:  "solana",
  USDT: "tether",
  USDC: "usd-coin",
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

// No separate platform fee — the margin is the desk's own buy/sell ad spread,
// which is already embedded in the rate. See routes/orders.ts.

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

    // Bust cached ad snapshots so a manual override takes effect immediately
    const changed = Object.keys({ ...modes, ...manualRates });
    if (changed.length > 0) __resetDeskRateCache();

    return res.json(await loadRateConfig());
  } catch (err) {
    console.error("[RATES] config update failed:", err);
    return res.status(500).json({ error: "Failed to update rate config." });
  }
});

// ─── Desk rate ────────────────────────────────────────────────────────────────
//
// The rate comes from the desk's own Bitget P2P ads, with an admin manual rate
// as the override. There is deliberately NO FX fallback: Flutterwave quotes
// something close to the interbank rate, and the desk rebalances on the P2P
// market. Quoting one while settling at the other books a loss on every trade,
// so an unavailable rate is an error, not an excuse to substitute a wrong one.

/** Test-only: drop memoised token prices and Bitget ad snapshots. */
export function __resetRateCaches(): void {
  for (const k of Object.keys(priceCache)) delete priceCache[k];
  __resetDeskRateCache();
}

export async function getDeskRate(
  destCurrency: string,
  side: DeskSide = "sell"
): Promise<{ rate: number; source: RateSource; advId?: string }> {
  // 1. Admin manual override wins — it exists precisely to let the operator
  //    take control when the ad book is thin or being repriced.
  try {
    const row = await prisma.rateConfig.findUnique({ where: { currency: destCurrency } });
    if (row && row.mode === "manual" && Number(row.manualRate) > 0) {
      return { rate: Number(row.manualRate), source: "manual" };
    }
  } catch {
    // DB unavailable — fall through to the ad book.
  }

  // 2. The desk's own P2P ad for this side of the book.
  const fromAds = await getBitgetRate(destCurrency, side);
  if (fromAds) return fromAds;

  throw new Error(
    `No rate available for ${destCurrency}. Publish a Bitget P2P ad for it, ` +
      `or set a manual rate in the admin dashboard.`
  );
}

export interface RateQuoteResponse {
  token: string;
  tokenPriceUSD: number;
  usdAmount: number;
  /** Fiat units per USD, from the desk's own book. */
  deskRate: number;
  /** Retained under the old name so existing clients keep working. */
  flwRate: number;
  receiveAmount: number;
  currency: string;
  rateSource: RateSource;
  rateMode: RateMode;
  /** The ad the rate came from, when it came from one. */
  advId?: string;
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
    // `side` lets a caller price the correct half of the book; defaults to the
    // sell side so a bare ticker query still returns something meaningful.
    const side: DeskSide = (req.query.side as DeskSide) === "buy" ? "buy" : "sell";

    const [tokenPriceUSD, desk] = await Promise.all([
      getTokenPriceUSD(token),
      getDeskRate(currency, side),
    ]);

    const usdAmount = parsedAmount * tokenPriceUSD;
    const receiveAmount = usdAmount * desk.rate;

    const configRow = await prisma.rateConfig.findUnique({ where: { currency } }).catch(() => null);
    const mode: RateMode = (configRow?.mode as RateMode) ?? "api";

    return res.json({
      token,
      tokenPriceUSD,
      usdAmount,
      deskRate: desk.rate,
      flwRate: desk.rate,
      receiveAmount,
      currency,
      rateSource: desk.source,
      rateMode: mode,
      advId: desk.advId,
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
