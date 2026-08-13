import axios from "axios";
import { getAllTransfers, claimTransferTxId, Order } from "../store";
import { notifyDepositConfirmed } from "./notify";

// ─── Configuration ────────────────────────────────────────────────────────────

const BTC_API = "https://blockstream.info/api";

/** How often to poll (ms). */
const POLL_INTERVAL_MS = 20_000;

// Order expiry lives in lib/expirySweep.ts — it must cover fiat-side orders that
// this monitor never looks at.

// Smallest unit multipliers
const BTC_SATS   = 100_000_000;

// ─── BTC types (Blockstream) ──────────────────────────────────────────────────

interface BlockstreamTx {
  txid: string;
  status: { confirmed: boolean; block_time?: number };
  vout: Array<{ scriptpubkey_address?: string; value: number }>;
  vin:  Array<{ prevout?: { scriptpubkey_address?: string } }>;
}

// ─── Result ───────────────────────────────────────────────────────────────────

interface CheckResult {
  confirmed: boolean;
  txId?: string;
}

// ─── Bitcoin deposit check ────────────────────────────────────────────────────
// Checks recipient output, amount, confirmation status, block time, and txId
// deduplication.  BTC UTXO inputs don't always expose a clean sender address,
// so we rely on txId claiming as the primary deduplication layer.

async function checkBtcDeposit(opts: {
  depositAddress: string;
  sendAmount:     number;
  afterIso:       string;
  claimedTxIds:   Set<string>;
}): Promise<CheckResult> {
  const { depositAddress, sendAmount, afterIso, claimedTxIds } = opts;

  const requiredSats = Math.floor(sendAmount * BTC_SATS);
  // Look back 2 hours before createdAt (same reason as the Stacks check above).
  const afterMs      = new Date(afterIso).getTime() - 2 * 60 * 60 * 1_000;

  const { data: txs } = await axios.get<BlockstreamTx[]>(
    `${BTC_API}/address/${encodeURIComponent(depositAddress)}/txs`,
    { timeout: 15_000 }
  );

  for (const tx of txs ?? []) {
    if (!tx.status.confirmed) continue;
    if (claimedTxIds.has(tx.txid)) continue;

    // block_time is a Unix timestamp in seconds
    const blockTime = (tx.status.block_time ?? 0) * 1_000;
    if (blockTime > 0 && blockTime < afterMs) continue;

    for (const vout of tx.vout) {
      if (
        vout.scriptpubkey_address === depositAddress &&
        vout.value >= requiredSats
      ) {
        return { confirmed: true, txId: tx.txid };
      }
    }
  }

  return { confirmed: false };
}

// ─── Single-transfer handler ──────────────────────────────────────────────────

async function checkTransfer(
  transfer: Order,
  claimedTxIds: Set<string>
): Promise<void> {
  const { id, sendToken, sendAmount, senderAddress, depositAddress, createdAt } = transfer;

  if (!depositAddress) {
    console.warn(`[MONITOR] Order ${id}: no depositAddress stored — skipping`);
    return;
  }

  // Expiry is NOT handled here any more — see lib/expirySweep.ts.  Keeping it in
  // this path meant only on-chain-polled orders ever expired.

  let result: CheckResult;
  try {
    if (sendToken === "BTC") {
      result = await checkBtcDeposit({
        depositAddress,
        sendAmount,
        afterIso: createdAt,
        claimedTxIds,
      });
    } else {
      return;
    }
  } catch (err) {
    console.warn(
      `[MONITOR] Chain check failed for transfer ${id}:`,
      (err as Error).message
    );
    return;
  }

  if (!result.confirmed || !result.txId) return;

  // Register the txId in the shared set immediately so that subsequent
  // transfers checked in this same poll cycle cannot claim the same tx.
  claimedTxIds.add(result.txId);

  console.log(
    `[MONITOR] Order ${id} confirmed on-chain (txId: ${result.txId})` +
    (senderAddress ? ` from ${senderAddress}` : "") +
    " — notifying operator for manual payout"
  );

  // Atomic: claims the txId and moves awaiting_deposit → deposit_confirmed in a
  // single write.  If the order already moved (restart mid-cycle, or a second
  // monitor instance), this returns null and we must NOT notify again.
  const claimed = await claimTransferTxId(id, result.txId);
  if (!claimed) {
    console.warn(
      `[MONITOR] Order ${id} was already claimed by another writer — skipping notification`
    );
    return;
  }

  // Fire-and-forget by design: notify() swallows its own errors, so a Telegram
  // outage can never strand an order that has already been confirmed on-chain.
  await notifyDepositConfirmed(claimed, result.txId);
}

// ─── Poll loop ────────────────────────────────────────────────────────────────

export function startChainMonitor(): void {
  console.log(
    `[MONITOR] Chain monitor started — polling every ${POLL_INTERVAL_MS / 1_000}s`
  );

  const poll = async () => {
    try {
      const all     = await getAllTransfers();
      // Only the sell leg deposits on-chain.  Buy-leg orders are settled by the
      // operator against a bank credit and never appear here.
      const pending = all.filter(
        (t) => t.direction === "sell" && t.status === "awaiting_deposit"
      );

      // Build the set of txIds already matched to any order so a deposit can
      // never be counted twice.
      const claimedTxIds = new Set<string>(
        all
          .filter((t) => t.claimedTxId)
          .map((t) => t.claimedTxId)
      );

      if (pending.length > 0) {
        console.log(`[MONITOR] Checking ${pending.length} awaiting-deposit order(s)…`);

        // Process sequentially — each claimed txId is added to the shared set
        // immediately after a match so the next order in the loop sees it.
        for (const transfer of pending) {
          await checkTransfer(transfer, claimedTxIds);
        }
      }
    } catch (err) {
      console.error("[MONITOR] Poll error:", err);
    }

    setTimeout(poll, POLL_INTERVAL_MS);
  };

  setTimeout(poll, 5_000);
}
