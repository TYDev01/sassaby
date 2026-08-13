/**
 * The desk's fiat rate.
 *
 * The rate comes from the desk's own Bitget P2P ads, not an FX feed. Flutterwave
 * quotes something near the interbank rate; the desk rebalances on the P2P
 * market, and in NGN the two diverge materially. Quoting one while settling at
 * the other books a loss on every trade — so an unavailable rate is an error,
 * not a licence to substitute a wrong one.
 *
 * The USDT ad is the reference: a USDT/NGN ad at 1,600 means one dollar of value
 * is worth ₦1,600 to this desk, which is exactly the USD→NGN rate to apply to any
 * asset once CoinGecko has priced it in USD.
 *
 * Direction matters. The desk's buy-side ad is what it pays per USDT, its
 * sell-side ad is what it charges — the gap between them is the margin, and
 * collapsing them to one number gives it away.
 *
 * Source of the price: UTA v3 publishes only a PUBLIC ad book (paged, all
 * merchants), with no confirmed "my ads" endpoint. So the desk records each ad
 * it publishes in `DeskAd` and prices off that. See prisma/schema.prisma.
 */

import { prisma } from "./prisma";

/** Which side of the desk's book a quote sits on. */
export type DeskSide = "buy" | "sell";

export type RateSource = "bitget" | "bitget_opposite" | "manual";

export interface DeskRate {
  rate: number;
  source: RateSource;
  /** Ad the rate came from, when it came from one. */
  advId?: string;
}

/** Stablecoins treated as 1 USD for reference pricing. */
const USD_REFERENCE_TOKENS = ["USDT", "USDC"];

const CACHE_TTL_MS = Number(process.env.BITGET_RATE_TTL_MS ?? 60_000);

interface CacheEntry {
  rate: DeskRate | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export function __resetDeskRateCache(): void {
  cache.clear();
}

/**
 * The desk's USD→fiat rate for one side of the book, from its published ads.
 *
 * Returns null when no usable ad exists — the caller falls back to the manual
 * rate or errors. Never throws for an absent rate.
 */
export async function getBitgetRate(
  currency: string,
  side: DeskSide
): Promise<DeskRate | null> {
  const fiat = currency.toUpperCase();
  const key = `${fiat}:${side}`;

  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.rate;

  let result: DeskRate | null = null;

  // The DeskAd mirror is the pricing authority.
  //
  // v2 had a dedicated "my ads" endpoint; UTA v3 exposes only the PUBLIC ad book,
  // paged 10 at a time, so an uncompetitive ad can drop off page one and appear
  // to have vanished. Pricing off that would silently swap the rate. The mirror
  // records exactly what the desk published, which is what a quote must honour.
  try {
    const ads = await prisma.deskAd.findMany({
      where: {
        fiat,
        active: true,
        token: { in: USD_REFERENCE_TOKENS },
      },
      orderBy: { updatedAt: "desc" },
    });

    const onSide = ads.filter((a) => a.side === side);

    if (onSide.length > 0) {
      // Multiple ads on one side: take the most conservative price for the desk —
      // lowest when buying crypto in, highest when selling it out.
      const best =
        side === "buy"
          ? onSide.reduce((m, a) => (a.price < m.price ? a : m))
          : onSide.reduce((m, a) => (a.price > m.price ? a : m));
      result = { rate: best.price, source: "bitget", advId: best.advId };
    } else if (ads.length > 0) {
      // No ad on the requested side. Fall back to the other side rather than to
      // an FX feed — it still reflects the P2P market the desk trades in.
      const fallback = ads.reduce((m, a) => (a.price > m.price ? a : m));
      console.warn(
        `[RATES] No ${side}-side ad for ${fiat}; using opposite-side ad ${fallback.advId}`
      );
      result = { rate: fallback.price, source: "bitget_opposite", advId: fallback.advId };
    }
  } catch (err) {
    console.warn("[RATES] Desk ad lookup failed:", (err as Error).message);
    return null;
  }

  cache.set(key, { rate: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
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
