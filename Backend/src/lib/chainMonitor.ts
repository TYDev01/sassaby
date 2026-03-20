import axios from "axios";
import { getAllTransfers, updateTransferStatus, claimTransferTxId, Transfer } from "../store";
import { callFlwTransfer } from "../routes/flutterwave";

// ─── Configuration ────────────────────────────────────────────────────────────

const STACKS_API =
  (process.env.STACKS_API_URL ?? "https://api.mainnet.hiro.so").replace(/\/$/, "");
const BTC_API = "https://blockstream.info/api";

/** How often to poll (ms). */
const POLL_INTERVAL_MS = 20_000;

/** Expire pending transfers that haven't confirmed within this window (ms). */
const TRANSFER_TIMEOUT_MS = 30 * 60 * 1_000; // 30 minutes

const USDC_CONTRACT_PREFIX = (
  process.env.STACKS_USDC_CONTRACT ??
  "SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx"
).toLowerCase();

// Smallest unit multipliers
const STX_MICRO  = 1_000_000;
const USDC_MICRO = 1_000_000;
const BTC_SATS   = 100_000_000;

// ─── Stacks types ─────────────────────────────────────────────────────────────

interface StacksBaseTransfer {
  amount: string;
  sender: string;
  recipient: string;
}
interface StacksFtTransfer extends StacksBaseTransfer {
  asset_identifier: string;
}
interface StacksTxEntry {
  tx: {
    tx_id: string;
    tx_status: string;
    block_time_iso: string;
  };
  stx_transfers: StacksBaseTransfer[];
  ft_transfers:  StacksFtTransfer[];
}
interface StacksTxWithTransfersResponse {
  results: StacksTxEntry[];
}

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

// ─── Stacks deposit check ────────────────────────────────────────────────────
// Uses BOTH the sender address AND the amount + time to identify the correct tx.
// Already-claimed txIds are excluded to prevent double-payouts.

async function checkStacksDeposit(opts: {
  depositAddress: string;
  senderAddress:  string;       // user's wallet address (may be empty)
  sendAmount:     number;
  token:          "STX" | "USDCx";
  afterIso:       string;
  claimedTxIds:   Set<string>;  // txIds already matched to other transfers
}): Promise<CheckResult> {
  const { depositAddress, senderAddress, sendAmount, token, afterIso, claimedTxIds } = opts;

  const url =
    `${STACKS_API}/extended/v1/address/${encodeURIComponent(depositAddress)}` +
    `/transactions_with_transfers?limit=50`;

  const { data } = await axios.get<StacksTxWithTransfersResponse>(url, {
    timeout: 15_000,
  });

  // Look back 2 hours before createdAt so we catch txns sent before the
  // transfer record was created (common when user sends first, then fills form).
  const afterMs       = new Date(afterIso).getTime() - 2 * 60 * 60 * 1_000;
  const micro         = token === "STX" ? STX_MICRO : USDC_MICRO;
  const requiredMicro = BigInt(Math.floor(sendAmount * micro));
  const senderLc      = senderAddress.toLowerCase();

  for (const entry of data.results ?? []) {
    if (entry.tx.tx_status !== "success") continue;
    if (claimedTxIds.has(entry.tx.tx_id)) continue;  // already matched to another transfer

    const txTime = new Date(entry.tx.block_time_iso).getTime();
    if (txTime < afterMs) continue;  // tx predates this transfer record

    if (token === "STX") {
      for (const t of entry.stx_transfers) {
        if (t.recipient.toLowerCase() !== depositAddress.toLowerCase()) continue;
        if (BigInt(t.amount) < requiredMicro) continue;
        // If the user provided their Stacks address, require the on-chain sender
        // to match.  This prevents a deposit from a different wallet being
        // claimed for this transfer (cross-user theft via amount collision).
        if (senderLc && t.sender.toLowerCase() !== senderLc) continue;
        return { confirmed: true, txId: entry.tx.tx_id };
      }
    } else {
      for (const t of entry.ft_transfers) {
        if (!t.asset_identifier.toLowerCase().startsWith(USDC_CONTRACT_PREFIX)) continue;
        if (t.recipient.toLowerCase() !== depositAddress.toLowerCase()) continue;
        if (BigInt(t.amount) < requiredMicro) continue;
        // Require on-chain sender to match when the address was captured at
        // transfer-creation time.
        if (senderLc && t.sender.toLowerCase() !== senderLc) continue;
        return { confirmed: true, txId: entry.tx.tx_id };
      }
    }
  }

  return { confirmed: false };
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
  // Look back 2 hours before createdAt (same reason as STX check above).
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
  transfer: Transfer,
  claimedTxIds: Set<string>
): Promise<void> {
  const { id, sendToken, sendAmount, senderAddress, depositAddress, createdAt } = transfer;

  if (!depositAddress) {
    console.warn(`[MONITOR] Transfer ${id}: no depositAddress stored — skipping`);
    return;
  }

  // Expire stalled transfers
  if (Date.now() - new Date(createdAt).getTime() > TRANSFER_TIMEOUT_MS) {
    console.warn(`[MONITOR] Transfer ${id} timed out — marking as failed`);
    await updateTransferStatus(id, "failed");
    return;
  }

  let result: CheckResult;
  try {
    if (sendToken === "STX" || sendToken === "USDCx") {
      result = await checkStacksDeposit({
        depositAddress,
        senderAddress,
        sendAmount,
        token: sendToken,
        afterIso: createdAt,
        claimedTxIds,
      });
    } else if (sendToken === "BTC") {
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
    `[MONITOR] Transfer ${id} confirmed on-chain (txId: ${result.txId})` +
    (senderAddress ? ` from ${senderAddress}` : "") +
    " — initiating Flutterwave payout"
  );

  // Persist the claim BEFORE calling Flutterwave so the txId survives a
  // server restart even if the payout call subsequently errors.
  await claimTransferTxId(id, result.txId);

  try {
    const flwResult = await callFlwTransfer({
      account_number: transfer.accountNumber,
      account_bank:   transfer.bankCode,
      // Ensure the fiat amount is rounded to 2 d.p. before sending to Flutterwave.
      amount:         Math.round(transfer.receiveAmount * 100) / 100,
      currency:       transfer.receiveCurrency,
      narration:      `Sassaby: ${transfer.sendAmount} ${transfer.sendToken} → ${transfer.receiveCurrency}`,
      // Stable reference for idempotent retries.
      transferId:     id,
    });
    console.log(`[FLW] Payout for transfer ${id} initiated:`, flwResult);
    // If FLW_WEBHOOK_SECRET is configured, Flutterwave will call the webhook
    // to confirm final settlement — don’t auto-complete here.
    // If no webhook is configured, mark completed optimistically.
    if (!process.env.FLW_WEBHOOK_SECRET) {
      await updateTransferStatus(id, "completed", new Date().toISOString());
    } else {
      console.log(`[FLW] Transfer ${id} awaiting webhook confirmation`);
    }
  } catch (err) {
    console.error(`[FLW] Payout failed for transfer ${id}:`, err);
    await updateTransferStatus(id, "failed");
  }
}

// ─── Poll loop ────────────────────────────────────────────────────────────────

export function startChainMonitor(): void {
  console.log(
    `[MONITOR] Chain monitor started — polling every ${POLL_INTERVAL_MS / 1_000}s`
  );

  const poll = async () => {
    try {
      const all     = await getAllTransfers();
      const pending = all.filter((t) => t.status === "pending");

      // Build the set of txIds already used by confirmed/processing transfers
      // so we never match them again.
      const claimedTxIds = new Set<string>(
        all
          .filter((t) => t.claimedTxId)
          .map((t) => t.claimedTxId)
      );

      if (pending.length > 0) {
        console.log(`[MONITOR] Checking ${pending.length} pending transfer(s)…`);

        // Process sequentially — each claimed txId is added to the shared set
        // immediately after a match so the next transfer in the loop sees it.
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
