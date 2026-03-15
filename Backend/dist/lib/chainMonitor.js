"use strict";
/**
 * chainMonitor.ts
 *
 * Background service that polls the Stacks and Bitcoin blockchains to detect
 * when a user's crypto deposit has been confirmed on-chain.  Once a match is
 * found the Flutterwave fiat payout is triggered automatically.
 *
 * ── Collision prevention ────────────────────────────────────────────────────
 * Two things guarantee that the same on-chain tx never triggers two payouts:
 *
 *  1. Sender-address matching
 *     The user's wallet address (senderAddress, stored at transfer-creation
 *     time) is compared against the `sender` field in every on-chain transfer
 *     event from the Stacks API.  Two users sending the same amount to the
 *     same deposit address are still distinguished by their wallet address.
 *
 *  2. txId claiming
 *     As soon as a matching on-chain tx is found the transfer's `claimedTxId`
 *     is written to the DB (via `claimTransferTxId`) before Flutterwave is
 *     called.  The poll loop loads already-claimed txIds at the start of each
 *     cycle and skips them when matching — so the same tx can't be re-claimed
 *     even across multiple poll cycles or after a server restart.
 *     Within a single poll cycle, transfers are processed sequentially so that
 *     each claim is visible to subsequent checks in that same cycle.
 *
 * Supported networks:
 *   STX  / USDCx — Stacks mainnet via the Hiro Stacks API
 *   BTC          — Bitcoin via the Blockstream.info API (no key required)
 *
 * Environment variables:
 *   STACKS_API_URL        Override Stacks API base (default: https://api.mainnet.hiro.so)
 *   STACKS_USDC_CONTRACT  Contract principal for USDCx, e.g.
 *                         SP3DX3H4FEYZJZ586MFBS25ZW3HZDMEW92260R2PR.Wrapped-USD
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startChainMonitor = startChainMonitor;
const axios_1 = __importDefault(require("axios"));
const store_1 = require("../store");
const flutterwave_1 = require("../routes/flutterwave");
// ─── Configuration ────────────────────────────────────────────────────────────
const STACKS_API = (process.env.STACKS_API_URL ?? "https://api.mainnet.hiro.so").replace(/\/$/, "");
const BTC_API = "https://blockstream.info/api";
/** How often to poll (ms). */
const POLL_INTERVAL_MS = 20000;
/** Expire pending transfers that haven't confirmed within this window (ms). */
const TRANSFER_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const USDC_CONTRACT_PREFIX = (process.env.STACKS_USDC_CONTRACT ??
    "SP3DX3H4FEYZJZ586MFBS25ZW3HZDMEW92260R2PR.Wrapped-USD").toLowerCase();
// Smallest unit multipliers
const STX_MICRO = 1000000;
const USDC_MICRO = 1000000;
const BTC_SATS = 100000000;
// ─── Stacks deposit check ────────────────────────────────────────────────────
// Uses BOTH the sender address AND the amount + time to identify the correct tx.
// Already-claimed txIds are excluded to prevent double-payouts.
async function checkStacksDeposit(opts) {
    const { depositAddress, senderAddress, sendAmount, token, afterIso, claimedTxIds } = opts;
    const url = `${STACKS_API}/extended/v1/address/${encodeURIComponent(depositAddress)}` +
        `/transactions_with_transfers?limit=50`;
    const { data } = await axios_1.default.get(url, {
        timeout: 15000,
    });
    const afterMs = new Date(afterIso).getTime();
    const micro = token === "STX" ? STX_MICRO : USDC_MICRO;
    const requiredMicro = BigInt(Math.floor(sendAmount * micro));
    const senderLc = senderAddress.toLowerCase();
    for (const entry of data.results ?? []) {
        if (entry.tx.tx_status !== "success")
            continue;
        if (claimedTxIds.has(entry.tx.tx_id))
            continue; // already matched to another transfer
        const txTime = new Date(entry.tx.block_time_iso).getTime();
        if (txTime < afterMs)
            continue; // tx predates this transfer record
        if (token === "STX") {
            for (const t of entry.stx_transfers) {
                if (t.recipient.toLowerCase() !== depositAddress.toLowerCase())
                    continue;
                if (BigInt(t.amount) < requiredMicro)
                    continue;
                // If we have a sender address on record, require it to match.
                // This is the primary collision-breaker when two users send the same amount.
                if (senderLc && t.sender.toLowerCase() !== senderLc)
                    continue;
                return { confirmed: true, txId: entry.tx.tx_id };
            }
        }
        else {
            for (const t of entry.ft_transfers) {
                if (!t.asset_identifier.toLowerCase().startsWith(USDC_CONTRACT_PREFIX))
                    continue;
                if (t.recipient.toLowerCase() !== depositAddress.toLowerCase())
                    continue;
                if (BigInt(t.amount) < requiredMicro)
                    continue;
                if (senderLc && t.sender.toLowerCase() !== senderLc)
                    continue;
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
async function checkBtcDeposit(opts) {
    const { depositAddress, sendAmount, afterIso, claimedTxIds } = opts;
    const requiredSats = Math.floor(sendAmount * BTC_SATS);
    const afterMs = new Date(afterIso).getTime();
    const { data: txs } = await axios_1.default.get(`${BTC_API}/address/${encodeURIComponent(depositAddress)}/txs`, { timeout: 15000 });
    for (const tx of txs ?? []) {
        if (!tx.status.confirmed)
            continue;
        if (claimedTxIds.has(tx.txid))
            continue;
        // block_time is a Unix timestamp in seconds
        const blockTime = (tx.status.block_time ?? 0) * 1000;
        if (blockTime > 0 && blockTime < afterMs)
            continue;
        for (const vout of tx.vout) {
            if (vout.scriptpubkey_address === depositAddress &&
                vout.value >= requiredSats) {
                return { confirmed: true, txId: tx.txid };
            }
        }
    }
    return { confirmed: false };
}
// ─── Single-transfer handler ──────────────────────────────────────────────────
async function checkTransfer(transfer, claimedTxIds) {
    const { id, sendToken, sendAmount, senderAddress, depositAddress, createdAt } = transfer;
    if (!depositAddress) {
        console.warn(`[MONITOR] Transfer ${id}: no depositAddress stored — skipping`);
        return;
    }
    // Expire stalled transfers
    if (Date.now() - new Date(createdAt).getTime() > TRANSFER_TIMEOUT_MS) {
        console.warn(`[MONITOR] Transfer ${id} timed out — marking as failed`);
        await (0, store_1.updateTransferStatus)(id, "failed");
        return;
    }
    let result;
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
        }
        else if (sendToken === "BTC") {
            result = await checkBtcDeposit({
                depositAddress,
                sendAmount,
                afterIso: createdAt,
                claimedTxIds,
            });
        }
        else {
            return;
        }
    }
    catch (err) {
        console.warn(`[MONITOR] Chain check failed for transfer ${id}:`, err.message);
        return;
    }
    if (!result.confirmed || !result.txId)
        return;
    // Register the txId in the shared set immediately so that subsequent
    // transfers checked in this same poll cycle cannot claim the same tx.
    claimedTxIds.add(result.txId);
    console.log(`[MONITOR] Transfer ${id} confirmed on-chain (txId: ${result.txId})` +
        (senderAddress ? ` from ${senderAddress}` : "") +
        " — initiating Flutterwave payout");
    // Persist the claim BEFORE calling Flutterwave so the txId survives a
    // server restart even if the payout call subsequently errors.
    await (0, store_1.claimTransferTxId)(id, result.txId);
    try {
        const flwResult = await (0, flutterwave_1.callFlwTransfer)({
            account_number: transfer.accountNumber,
            account_bank: transfer.bankCode,
            amount: transfer.receiveAmount,
            currency: transfer.receiveCurrency,
            narration: `Sassaby: ${transfer.sendAmount} ${transfer.sendToken} → ${transfer.receiveCurrency}`,
        });
        console.log(`[FLW] Payout for transfer ${id} initiated:`, flwResult);
    }
    catch (err) {
        console.error(`[FLW] Payout failed for transfer ${id}:`, err);
        await (0, store_1.updateTransferStatus)(id, "failed");
    }
}
// ─── Poll loop ────────────────────────────────────────────────────────────────
function startChainMonitor() {
    console.log(`[MONITOR] Chain monitor started — polling every ${POLL_INTERVAL_MS / 1000}s`);
    const poll = async () => {
        try {
            const all = await (0, store_1.getAllTransfers)();
            const pending = all.filter((t) => t.status === "pending");
            // Build the set of txIds already used by confirmed/processing transfers
            // so we never match them again.
            const claimedTxIds = new Set(all
                .filter((t) => t.claimedTxId)
                .map((t) => t.claimedTxId));
            if (pending.length > 0) {
                console.log(`[MONITOR] Checking ${pending.length} pending transfer(s)…`);
                // Process sequentially — each claimed txId is added to the shared set
                // immediately after a match so the next transfer in the loop sees it.
                for (const transfer of pending) {
                    await checkTransfer(transfer, claimedTxIds);
                }
            }
        }
        catch (err) {
            console.error("[MONITOR] Poll error:", err);
        }
        setTimeout(poll, POLL_INTERVAL_MS);
    };
    setTimeout(poll, 5000);
}
