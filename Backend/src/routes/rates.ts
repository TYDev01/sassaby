import { Router, Request, Response as ExpressResponse } from "express";
import axios from "axios";

const router = Router();

const FLW_V4_BASE = "https://api.flutterwave.com";
const FLW_IDP =
  "https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token";

// ─── CoinGecko ID map (no API key required) ───────────────────────────────────

const COINGECKO_IDS: Record<string, string> = {
  STX: "blockstack",
  BTC: "bitcoin",
};

// ─── Token price cache (60s TTL) ─────────────────────────────────────────────

interface PriceEntry { priceUsd: number; expiresAt: number; }
const priceCache: Record<string, PriceEntry> = {};

async function getTokenPriceUSD(token: string): Promise<number> {
  if (token === "USDCx") return 1.0;
  const geckoId = COINGECKO_IDS[token];
  if (!geckoId) throw new Error(`Unsupported token: ${token}`);

  const cached = priceCache[geckoId];
  if (cached && Date.now() < cached.expiresAt) return cached.priceUsd;

  const { data: json } = await axios.get<Record<string, { usd: number }>>(
    `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd`,
    { headers: { Accept: "application/json" }, timeout: 10_000 }
  );
  const price = json[geckoId]?.usd;
  if (!price) throw new Error(`No price data for ${token}`);

  priceCache[geckoId] = { priceUsd: price, expiresAt: Date.now() + 60_000 };
  return price;
}

// ─── Flutterwave OAuth token (10-min TTL) ────────────────────────────────────

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  const clientId = process.env.FLW_CLIENT_ID;
  const clientSecret = process.env.FLW_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    throw new Error("FLW_CLIENT_ID or FLW_CLIENT_SECRET is not set.");

  const params = new URLSearchParams({
    client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials",
  });
  const { data: json } = await axios.post<{ access_token: string; expires_in: number }>(
    FLW_IDP,
    params.toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 10_000 }
  );
  cachedToken = json.access_token;
  tokenExpiresAt = Date.now() + (json.expires_in - 30) * 1000;
  return cachedToken;
}

// ─── Approximate fallback rates (USD → fiat) ─────────────────────────────────

const FALLBACK_RATES: Record<string, number> = { NGN: 1580, GHS: 13.5, KES: 130 };

// ─── Flutterwave rate cache (5-min TTL) ──────────────────────────────────────

interface FlwRateEntry { rate: number; expiresAt: number; isFallback: boolean; }
const flwRateCache: Record<string, FlwRateEntry> = {};

async function getFlwRate(destCurrency: string): Promise<{ rate: number; isFallback: boolean }> {
  const cacheKey = `USD→${destCurrency}`;
  const cached = flwRateCache[cacheKey];
  if (cached && Date.now() < cached.expiresAt) return { rate: cached.rate, isFallback: cached.isFallback };

  try {
    const token = await getAccessToken();
    const { data: json } = await axios.post<{ data?: { rate: string } }>(
      `${FLW_V4_BASE}/transfers/rates`,
      { source: { currency: "USD" }, destination: { currency: destCurrency }, precision: 4 },
      { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, timeout: 10_000 }
    );
    const rate = parseFloat(json.data?.rate ?? "0");
    if (rate > 0) {
      flwRateCache[cacheKey] = { rate, expiresAt: Date.now() + 5 * 60_000, isFallback: false };
      return { rate, isFallback: false };
    }
  } catch (err) {
    console.warn(`[RATES] FLW rate failed for ${destCurrency}, using fallback:`, err);
  }

  const fallback = FALLBACK_RATES[destCurrency];
  if (!fallback) throw new Error(`No rate available for ${destCurrency}`);
  flwRateCache[cacheKey] = { rate: fallback, expiresAt: Date.now() + 5 * 60_000, isFallback: true };
  return { rate: fallback, isFallback: true };
}

// ─── GET /api/rates?token=STX&amount=10&currency=NGN ─────────────────────────

export interface RateQuoteResponse {
  token: string;
  tokenPriceUSD: number;
  usdAmount: number;
  flwRate: number;
  receiveAmount: number;
  currency: string;
  rateSource: "flutterwave" | "fallback";
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
    const [tokenPriceUSD, { rate: flwRate, isFallback }] = await Promise.all([
      getTokenPriceUSD(token),
      getFlwRate(currency),
    ]);

    const usdAmount = parsedAmount * tokenPriceUSD;
    const receiveAmount = usdAmount * flwRate;

    return res.json({
      token, tokenPriceUSD, usdAmount, flwRate, receiveAmount, currency,
      rateSource: isFallback ? "fallback" : "flutterwave",
    } satisfies RateQuoteResponse);
  } catch (err) {
    console.error("[RATES]", err);
    const msg = err instanceof Error ? err.message : "Failed to fetch rates.";
    return res.status(502).json({ error: msg });
  }
});

export default router;
