/**
 * The desk's fiat rate.
 *
 * The rate must come from the desk's own Bitget P2P ads, not from an FX feed.
 * Flutterwave quotes something close to the interbank rate; the P2P market is
 * where the desk actually rebalances, and in NGN the two diverge materially.
 * Quoting an FX rate while settling at a P2P rate books a loss on every trade —
 * so the ad price *is* the price.
 *
 * The USDT ad is the reference: a USDT/NGN ad priced at 1,600 means one dollar
 * of value is worth ₦1,600 to this desk, which is exactly the USD→NGN rate to
 * apply to any asset once it's been priced in USD.
 *
 * Direction matters. The desk's buy-side ad is what it pays per USDT, its
 * sell-side ad is what it charges — the gap between them is the spread, and
 * collapsing them to one number gives it away.
 *
 * Resolution order, most to least authoritative:
 *   1. Own Bitget ad for the currency, matching the side of the trade
 *   2. Own Bitget ad on the other side (better than no P2P signal at all)
 *   3. Admin manual rate
 *   4. Flutterwave FX — last resort, and wrong for pricing; logged loudly
 */

import { fetchOwnAdvs, isConfigured, Adv } from "./bitget";

/** Which side of the desk's book a quote sits on. */
export type DeskSide = "buy" | "sell";

export type RateSource = "bitget" | "bitget_opposite" | "manual" | "flutterwave";

export interface DeskRate {
  rate: number;
  source: RateSource;
  /** Ad the rate came from, when it came from one. */
  advId?: string;
}

/** Stablecoins treated as 1 USD for reference pricing. */
const USD_REFERENCE_COINS = ["USDT", "USDC"];

const CACHE_TTL_MS = Number(process.env.BITGET_RATE_TTL_MS ?? 60_000);

interface CacheEntry {
  advs: Adv[];
  expiresAt: number;
}

let advCache: CacheEntry | null = null;

export function __resetDeskRateCache(): void {
  advCache = null;
}

async function getAdvs(): Promise<Adv[]> {
  if (advCache && Date.now() < advCache.expiresAt) return advCache.advs;
  const advs = await fetchOwnAdvs();
  advCache = { advs, expiresAt: Date.now() + CACHE_TTL_MS };
  return advs;
}

/**
 * The desk's USD→fiat rate for one side of the book, from its own ads.
 *
 * Returns null when Bitget isn't configured, has no usable ad, or errors — the
 * caller falls back. Never throws for an absent rate, only for a broken client.
 */
export async function getBitgetRate(
  currency: string,
  side: DeskSide
): Promise<DeskRate | null> {
  if (!isConfigured()) return null;

  let advs: Adv[];
  try {
    advs = await getAdvs();
  } catch (err) {
    console.warn(`[RATES] Bitget ad fetch failed:`, (err as Error).message);
    return null;
  }

  const candidates = advs.filter(
    (a) =>
      a.online &&
      a.fiat === currency.toUpperCase() &&
      USD_REFERENCE_COINS.includes(a.coin)
  );
  if (candidates.length === 0) return null;

  const onSide = candidates.filter((a) => a.side === side);
  if (onSide.length > 0) {
    // Multiple ads on one side: take the price that is most conservative for the
    // desk — the lowest when buying crypto in (pay less fiat per USD is worse for
    // the client, better for us to be cautious), the highest when selling.
    const best =
      side === "buy"
        ? onSide.reduce((m, a) => (a.price < m.price ? a : m))
        : onSide.reduce((m, a) => (a.price > m.price ? a : m));
    return { rate: best.price, source: "bitget", advId: best.id };
  }

  // No ad on the requested side — fall back to the other side rather than to an
  // FX feed, since it still reflects the P2P market the desk trades in.
  const fallback = candidates.reduce((m, a) => (a.price > m.price ? a : m));
  console.warn(
    `[RATES] No ${side}-side Bitget ad for ${currency}; using opposite-side ad ${fallback.id}`
  );
  return { rate: fallback.price, source: "bitget_opposite", advId: fallback.id };
}

/**
 * Map an order direction to the side of the desk's book.
 *
 * "sell" (the client sells crypto to the desk) means the desk is buying, so it
 * pays out at its buy-side ad price.
 */
export function sideForDirection(direction: "buy" | "sell"): DeskSide {
  return direction === "sell" ? "buy" : "sell";
}
