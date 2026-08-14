/**
 * Bitget P2P side of the admin overview.
 *
 * Deliberately kept apart from the site's own numbers rather than summed into
 * them. A customer selling USDT to the desk and the P2P trade that rebalances
 * that position are the same value moving twice: one is business done with a
 * customer, the other is treasury. Adding them would roughly double the
 * headline and describe neither.
 *
 * USD value comes from the token quantity, not the fiat amount, because the
 * desk only publishes ads in USDT and USDC — the same assumption lib/deskRate
 * makes when it treats a USDT ad price as the USD→fiat rate.
 */

import { fetchAllOrders, fetchPendingOrders, isConfigured, PendingOrder } from "./bitget";

/** Stablecoins counted one-for-one against the dollar. */
const USD_REFERENCE_TOKENS = ["USDT", "USDC"];

/**
 * Bitget caps all-orders at ten rows a call, so a total means paging.
 *
 * MAX_PAGES bounds that: at 10 rows a page this covers 1,000 completed trades,
 * past which the figures are marked truncated rather than quietly wrong. The
 * result is cached because the dashboard polls every fifteen seconds and a full
 * page-through is a dozen signed calls.
 */
const PAGE_SIZE = 10;
const MAX_PAGES = 100;
const CACHE_TTL_MS = Number(process.env.P2P_STATS_TTL_MS ?? 60_000);

export interface P2PStats {
  /** False when Bitget is unconfigured or unreachable — the UI says so rather than showing a zero. */
  available: boolean;
  error?: string;
  completedOrders: number;
  pendingOrders: number;
  volumeUSD: number;
  feesUSD: number;
  /** Fiat received or paid per currency, across completed orders. */
  volumeByFiat: Record<string, number>;
  /** Completed orders split by direction, from the desk's point of view. */
  boughtUSD: number;
  soldUSD: number;
  /** True when the page cap was hit, so the totals are a floor and not the whole history. */
  truncated: boolean;
}

const EMPTY: P2PStats = {
  available: false,
  completedOrders: 0,
  pendingOrders: 0,
  volumeUSD: 0,
  feesUSD: 0,
  volumeByFiat: {},
  boughtUSD: 0,
  soldUSD: 0,
  truncated: false,
};

let cache: { at: number; stats: P2PStats } | null = null;

/** Test-only, and for the moment an ad or order changes something. */
export function __resetP2PStatsCache(): void {
  cache = null;
}

/**
 * Walk the completed-order history to the end.
 *
 * Deduplicated on orderId: the cursor is a server-side position, and a trade
 * settling mid-walk can otherwise shift a row into a page already read.
 */
async function fetchAllCompleted(): Promise<{ orders: PendingOrder[]; truncated: boolean }> {
  const byId = new Map<string, PendingOrder>();
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { orders, nextId } = await fetchAllOrders({
      status: "completed",
      limit: PAGE_SIZE,
      cursor,
    });
    for (const o of orders) byId.set(o.orderId, o);
    if (!nextId || orders.length === 0) {
      return { orders: [...byId.values()], truncated: false };
    }
    cursor = nextId;
  }

  return { orders: [...byId.values()], truncated: true };
}

/** Token units are dollars only for the stablecoins the desk actually trades. */
function usdValue(o: PendingOrder): number {
  return USD_REFERENCE_TOKENS.includes(o.token.toUpperCase()) ? o.quantity : 0;
}

export async function getP2PStats(): Promise<P2PStats> {
  if (!isConfigured()) {
    return { ...EMPTY, error: "Bitget is not configured." };
  }

  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.stats;

  let completed: PendingOrder[] = [];
  let pending: PendingOrder[] = [];
  let truncated = false;

  try {
    // Only settled trades count toward volume, matching how a site order is
    // only counted once it has actually settled.
    const [done, live] = await Promise.all([
      fetchAllCompleted(),
      fetchPendingOrders({ limit: PAGE_SIZE }),
    ]);
    completed = done.orders;
    truncated = done.truncated;
    pending = live.orders;
  } catch (err) {
    return { ...EMPTY, error: (err as Error).message };
  }

  const stats: P2PStats = {
    ...EMPTY,
    available: true,
    completedOrders: completed.length,
    pendingOrders: pending.length,
    volumeByFiat: {},
    truncated,
  };

  for (const o of completed) {
    const usd = usdValue(o);
    stats.volumeUSD += usd;
    stats.feesUSD += USD_REFERENCE_TOKENS.includes(o.token.toUpperCase()) ? o.fee : 0;
    if (o.fiat) {
      stats.volumeByFiat[o.fiat] = (stats.volumeByFiat[o.fiat] ?? 0) + o.amount;
    }
    if (o.side === "buy") stats.boughtUSD += usd;
    else if (o.side === "sell") stats.soldUSD += usd;
  }

  cache = { at: Date.now(), stats };
  return stats;
}
