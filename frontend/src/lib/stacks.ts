

import { request } from "@stacks/connect";
import { Pc, Cl, postConditionToHex } from "@stacks/transactions";

// JsonRpcError code -31001 means the user dismissed the wallet popup.
// Leather also uses -32003 for user rejection.
const USER_CANCEL_CODES = new Set([-31001, -32003]);
// Match only genuine user-dismissal phrases; NOT bare "reject" because
// "transaction rejected" (node error) would be incorrectly swallowed.
const USER_CANCEL_MSGS = ["user cancel", "user canceled", "user cancelled", "user rejected", "user denied", "request abandoned", "user declined"];

function isCancelled(err: unknown): boolean {
  const code = (err as { code?: number })?.code;
  if (code !== undefined && USER_CANCEL_CODES.has(code)) return true;
  const msg = ((err as Error)?.message ?? "").toLowerCase();
  return USER_CANCEL_MSGS.some((s: string) => msg.includes(s));
}

// The Stacks network to use. Set NEXT_PUBLIC_STACKS_NETWORK=testnet for dev.
// Defaults to mainnet.
const STACKS_NETWORK = (process.env.NEXT_PUBLIC_STACKS_NETWORK ?? "mainnet") as
  "mainnet" | "testnet";

// ─── USDCx contract config ────────────────────────────────────────────────────

const USDC_CONTRACT_ID =
  process.env.NEXT_PUBLIC_STACKS_USDC_CONTRACT ??
  "SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx";

// The defined-fungible-token name declared inside the Wrapped-USD contract.
const USDC_TOKEN_NAME =
  process.env.NEXT_PUBLIC_STACKS_USDC_TOKEN_NAME ?? "wrapped-usd";


// ─── STX transfer ─────────────────────────────────────────────────────────────

/**
 * Open the connected Stacks wallet to send exactly `microAmount` µSTX to
 * `recipientAddress`.  The wallet enforces the exact amount itself.
 *
 * @returns The broadcasted txid, or rejects with Error("cancelled") if the
 *          user dismisses the popup.
 */
export async function sendSTX(params: {
  senderAddress: string;
  recipientAddress: string;
  /** Amount in µSTX (1 STX = 1 000 000 µSTX) */
  microAmount: bigint;
  memo?: string;
}): Promise<string> {
  const { senderAddress, recipientAddress, microAmount, memo } = params;
  try {
    const result = await request("stx_transferStx", {
      recipient: recipientAddress,
      amount: microAmount,
      // STX memo max is 34 bytes; keep it short
      memo: (memo ?? "Sassaby bridge").slice(0, 34),
      network: STACKS_NETWORK,
    });
    // Some wallets return txId (capital I); @stacks/connect's cs() normalises
    // it to txid, but guard against both just in case.
    const txid = result?.txid ?? (result as Record<string, unknown>)?.txId as string;
    if (!txid) throw new Error("Wallet did not return a transaction ID");
    return txid;
  } catch (err: unknown) {
    if (isCancelled(err)) throw new Error("cancelled");
    throw err;
  }
}

// ─── USDCx (SIP-010) transfer ─────────────────────────────────────────────────

/**
 * Open the connected Stacks wallet to send exactly `microAmount` USDCx
 * (6-decimal fungible token) to `recipientAddress` via the SIP-010 `transfer`
 * function, with a strict FT post-condition.
 *
 * @returns The broadcasted txid, or rejects with Error("cancelled") if the
 *          user dismisses the popup.
 */
export async function sendUSDCx(params: {
  senderAddress: string;
  recipientAddress: string;
  /** Amount in micro-USDC (1 USDCx = 1 000 000 µUSDC) */
  microAmount: bigint;
}): Promise<string> {
  const { senderAddress, recipientAddress, microAmount } = params;
  try {
    const result = await request("stx_callContract", {
      contract: USDC_CONTRACT_ID as `${string}.${string}`,
      // SIP-010 standard transfer function signature:
      // (transfer (amount uint) (sender principal) (recipient principal)
      //           (memo (optional (buff 34))))
      functionName: "transfer",
      functionArgs: [
        Cl.uint(microAmount),
        Cl.principal(senderAddress),
        Cl.principal(recipientAddress),
        Cl.none(),
      ],
      network: STACKS_NETWORK,
      // Deny mode: abort on-chain if any asset movement is not covered below.
      postConditionMode: "deny",
      // Exact post-condition: sender sends exactly this many USDCx tokens.
      // Serialised to hex so the wallet can decode the bigint amount correctly
      // (JSON.stringify cannot handle bigint, which causes the amount to become 0).
      postConditions: [
        postConditionToHex(
          Pc.principal(senderAddress)
            .willSendEq(microAmount)
            .ft(USDC_CONTRACT_ID as `${string}.${string}`, USDC_TOKEN_NAME),
        ),
      ],
    });
    if (!result.txid) throw new Error("Wallet did not return a transaction ID");
    return result.txid;
  } catch (err: unknown) {
    if (isCancelled(err)) throw new Error("cancelled");
    throw err;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a human-readable STX amount (e.g. 5.25) to µSTX bigint. */
export function toMicroSTX(amount: number): bigint {
  return BigInt(Math.floor(amount * 1_000_000));
}

/** Convert a human-readable USDCx amount (e.g. 10.50) to µUSDC bigint. */
export function toMicroUSDC(amount: number): bigint {
  return BigInt(Math.floor(amount * 1_000_000));
}
