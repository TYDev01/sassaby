/**
 * Order expiry sweep.
 *
 * Pulled out of the chain monitor deliberately. Expiry used to live inside the
 * per-transfer deposit check, which meant it only ran for orders being polled
 * on-chain — an order waiting on a *fiat* payment would have sat open forever.
 * Since one open order blocks a user from placing another, that would have
 * locked people out permanently and turned every abandoned order into a support
 * message.
 *
 * Only `EXPIRABLE_STATUSES` are swept. Once a deposit has landed or a client has
 * claimed payment, value is in flight and only a human may move the order.
 */

import {
  getOrdersByStatus,
  transitionOrder,
  EXPIRABLE_STATUSES,
} from "../store";

/** How long an order may sit unpaid before it is released back to the user. */
const ORDER_TTL_MS = Number(process.env.ORDER_TTL_MS ?? 30 * 60 * 1_000);

const SWEEP_INTERVAL_MS = Number(process.env.EXPIRY_SWEEP_INTERVAL_MS ?? 60_000);

/**
 * Expire every stale order in an expirable state.
 *
 * Exported for tests and for a manual admin trigger; `startExpirySweep` is the
 * scheduled entry point.
 */
export async function sweepExpiredOrders(now: number = Date.now()): Promise<number> {
  const candidates = await getOrdersByStatus(EXPIRABLE_STATUSES);

  let expired = 0;
  for (const order of candidates) {
    const age = now - new Date(order.createdAt).getTime();
    if (age < ORDER_TTL_MS) continue;

    // Atomic: if the client paid in the same instant and something else moved
    // the order first, this matches zero rows and we leave it alone.
    const result = await transitionOrder(order.id, order.status, "expired");
    if (result) {
      expired++;
      console.log(
        `[EXPIRY] Order ${order.id} expired after ${Math.round(age / 60_000)}m ` +
          `(was ${order.status})`
      );
    }
  }

  return expired;
}

export function startExpirySweep(): void {
  console.log(
    `[EXPIRY] Sweep started — every ${SWEEP_INTERVAL_MS / 1_000}s, ` +
      `TTL ${ORDER_TTL_MS / 60_000}m`
  );

  const tick = async () => {
    try {
      await sweepExpiredOrders();
    } catch (err) {
      console.error("[EXPIRY] Sweep error:", err);
    }
    setTimeout(tick, SWEEP_INTERVAL_MS);
  };

  setTimeout(tick, 10_000);
}
