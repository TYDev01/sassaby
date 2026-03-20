import { request } from "@stacks/connect";
import { Pc, Cl } from "@stacks/transactions";

// ─── Cancel Handling ──────────────────────────────────────────────────────────

const USER_CANCEL_CODES = new Set([-31001, -32003]);

const USER_CANCEL_MSGS = [
  "user cancel",
  "user canceled",
  "user cancelled",
  "user rejected",
  "user denied",
  "request abandoned",
  "user declined",
];

function isCancelled(err: unknown): boolean {
  const code = (err as { code?: number })?.code;
  if (code !== undefined && USER_CANCEL_CODES.has(code)) return true;

  const msg = ((err as Error)?.message ?? "").toLowerCase();
  return USER_CANCEL_MSGS.some((s) => msg.includes(s));
}

// ─── Network ──────────────────────────────────────────────────────────────────

const STACKS_NETWORK = (process.env.NEXT_PUBLIC_STACKS_NETWORK ?? "mainnet") as
  | "mainnet"
  | "testnet";

// ─── USDCx Config ─────────────────────────────────────────────────────────────

const USDC_CONTRACT_ID: `${string}.${string}` =
  (process.env.NEXT_PUBLIC_STACKS_USDC_CONTRACT ??
    "SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx") as `${string}.${string}`;

const USDC_TOKEN_NAME =
  process.env.NEXT_PUBLIC_STACKS_USDC_TOKEN_NAME ?? "usdcx-token";

// ─── STX Transfer ─────────────────────────────────────────────────────────────

export async function sendSTX(params: {
  senderAddress: string;
  recipientAddress: string;
  microAmount: bigint;
  memo?: string;
}): Promise<string> {
  const { recipientAddress, microAmount, memo } = params;

  try {
    const result = await request("stx_transferStx", {
      recipient: recipientAddress,
      amount: microAmount,
      memo: (memo ?? "Sassaby bridge").slice(0, 34),
      network: STACKS_NETWORK,
    });

    const txid =
      result?.txid ??
      ((result as Record<string, unknown>)?.txId as string);

    if (!txid) throw new Error("Wallet did not return a transaction ID");

    return txid;
  } catch (err: unknown) {
    if (isCancelled(err)) throw new Error("cancelled");
    throw err;
  }
}

// ─── USDCx Transfer (SIP-010) ──────────────────────────────────────────────────

export async function sendUSDCx(params: {
  senderAddress: string;
  recipientAddress: string;
  microAmount: bigint;
}): Promise<string> {
  const { senderAddress, recipientAddress, microAmount } = params;

  try {
    const result = await request("stx_callContract", {
      contract: USDC_CONTRACT_ID,
      functionName: "transfer",
      functionArgs: [
        Cl.uint(microAmount),
        Cl.principal(senderAddress),
        Cl.principal(recipientAddress),
        Cl.none(),
      ],
      network: STACKS_NETWORK,

      postConditionMode: "deny",

      postConditions: [
        Pc.principal(senderAddress)
          .willSendLte(microAmount)
          .ft(USDC_CONTRACT_ID, USDC_TOKEN_NAME),
      ],
    });

    if (!result.txid) {
      throw new Error("Wallet did not return a transaction ID");
    }

    return result.txid;
  } catch (err: unknown) {
    if (isCancelled(err)) throw new Error("cancelled");
    throw err;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function toMicroSTX(amount: number): bigint {
  return BigInt(Math.floor(amount * 1_000_000));
}

export function toMicroUSDC(amount: number): bigint {
  return BigInt(Math.floor(amount * 1_000_000));
}