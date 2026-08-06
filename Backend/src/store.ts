// ─── PostgreSQL store via Prisma ─────────────────────────────────────────────

import { prisma } from "./lib/prisma";

// ─── Domain types ─────────────────────────────────────────────────────────────

/** From the CLIENT's perspective. */
export type OrderDirection = "buy" | "sell";

export type OrderStatus =
  // sell leg — client sells crypto to the desk
  | "awaiting_deposit"
  | "deposit_confirmed"
  | "awaiting_manual_payout"
  | "settled"
  // buy leg — client buys crypto from the desk
  | "awaiting_payment"
  | "payment_claimed"
  | "verifying"
  | "released"
  // terminal, both legs
  | "rejected"
  | "expired"
  | "failed";

export type Currency = "NGN" | "GHS" | "KES";

/**
 * Statuses in which an order is still live.  Mirrors the predicate of the
 * `one_open_order_per_user` partial unique index — if this list changes, the
 * index must be migrated to match, or the database will stop enforcing the
 * rule the application thinks it is enforcing.
 */
export const OPEN_STATUSES: OrderStatus[] = [
  "awaiting_payment",
  "payment_claimed",
  "verifying",
  "awaiting_deposit",
  "deposit_confirmed",
  "awaiting_manual_payout",
];

/**
 * Statuses an unattended sweep may expire.
 *
 * Deliberately narrow.  Once a client has claimed payment or a deposit has
 * landed, value is in flight and only a human may move the order — auto-expiring
 * either would strand real money.
 */
export const EXPIRABLE_STATUSES: OrderStatus[] = [
  "awaiting_deposit",
  "awaiting_payment",
];

/** Legal state transitions.  Anything absent here is rejected. */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  // ── sell leg ──
  awaiting_deposit:       ["deposit_confirmed", "expired", "failed"],
  // Crypto has landed: the desk now owes fiat.  No path back to expired.
  deposit_confirmed:      ["awaiting_manual_payout", "failed"],
  awaiting_manual_payout: ["settled", "failed"],

  // ── buy leg ──
  awaiting_payment:       ["payment_claimed", "expired"],
  // Client says they paid.  Money may be in flight, so only an operator moves
  // this on — never a timer.
  payment_claimed:        ["verifying", "rejected"],
  verifying:              ["released", "rejected"],

  // ── terminal ──
  settled:  [],
  released: [],
  rejected: [],
  expired:  [],
  failed:   [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export interface Order {
  id: string;
  createdAt: string; // ISO timestamp
  userId: string;
  direction: OrderDirection;
  sendAmount: number;
  sendToken: string;
  chain: string;
  usdEquivalent: number;
  receiveAmount: number;
  receiveCurrency: Currency;
  fee: number;
  feeRate: number;
  bank: string;
  bankCode: string;
  accountNumber: string;
  senderAddress: string;
  depositAddress: string;
  destinationAddress: string;
  claimedTxId: string;
  status: OrderStatus;
  completedAt?: string;
  releasedAt?: string;
  releasedBy: string;
  evidenceRef: string;
  rejectionReason: string;
}

/** Retained alias — the codebase called these "transfers" before the pivot. */
export type Transfer = Order;

// ─── Row → interface mapper ───────────────────────────────────────────────────

function iso(v: unknown): string | undefined {
  if (!v) return undefined;
  return v instanceof Date ? v.toISOString() : String(v);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): Order {
  return {
    id:                 row.id,
    createdAt:          iso(row.createdAt) ?? new Date(0).toISOString(),
    userId:             row.userId,
    direction:          row.direction as OrderDirection,
    sendAmount:         Number(row.sendAmount),
    sendToken:          row.sendToken,
    chain:              row.chain ?? "stacks",
    usdEquivalent:      Number(row.usdEquivalent),
    receiveAmount:      Number(row.receiveAmount),
    receiveCurrency:    row.receiveCurrency as Currency,
    fee:                Number(row.fee),
    feeRate:            Number(row.feeRate),
    bank:               row.bank ?? "",
    bankCode:           row.bankCode ?? "",
    accountNumber:      row.accountNumber ?? "",
    senderAddress:      row.senderAddress ?? "",
    depositAddress:     row.depositAddress ?? "",
    destinationAddress: row.destinationAddress ?? "",
    claimedTxId:        row.claimedTxId ?? "",
    status:             row.status as OrderStatus,
    completedAt:        iso(row.completedAt),
    releasedAt:         iso(row.releasedAt),
    releasedBy:         row.releasedBy ?? "",
    evidenceRef:        row.evidenceRef ?? "",
    rejectionReason:    row.rejectionReason ?? "",
  };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function getAllTransfers(): Promise<Order[]> {
  const rows = await prisma.transfer.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(mapRow);
}

export async function getOrdersByUserId(userId: string): Promise<Order[]> {
  const rows = await prisma.transfer.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapRow);
}

/** The caller's single live order, if any.  Drives the one-open-order rule. */
export async function getOpenOrderForUser(userId: string): Promise<Order | null> {
  const row = await prisma.transfer.findFirst({
    where: { userId, status: { in: OPEN_STATUSES } },
    orderBy: { createdAt: "desc" },
  });
  return row ? mapRow(row) : null;
}

export async function getTransferById(id: string): Promise<Order | undefined> {
  const row = await prisma.transfer.findUnique({ where: { id } });
  return row ? mapRow(row) : undefined;
}

/** Open orders in a given status — used by the chain monitor and expiry sweep. */
export async function getOrdersByStatus(statuses: OrderStatus[]): Promise<Order[]> {
  const rows = await prisma.transfer.findMany({
    where: { status: { in: statuses } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(mapRow);
}

// ─── Writes ──────────────────────────────────────────────────────────────────

export type NewOrder = Omit<Order, "completedAt" | "releasedAt">;

export async function addTransfer(order: NewOrder): Promise<Order> {
  const row = await prisma.transfer.create({
    data: {
      id:                 order.id,
      createdAt:          new Date(order.createdAt),
      userId:             order.userId,
      direction:          order.direction,
      sendAmount:         order.sendAmount,
      sendToken:          order.sendToken,
      chain:              order.chain,
      usdEquivalent:      order.usdEquivalent,
      receiveAmount:      order.receiveAmount,
      receiveCurrency:    order.receiveCurrency,
      fee:                order.fee,
      feeRate:            order.feeRate,
      bank:               order.bank,
      bankCode:           order.bankCode,
      accountNumber:      order.accountNumber,
      senderAddress:      order.senderAddress,
      depositAddress:     order.depositAddress,
      destinationAddress: order.destinationAddress,
      claimedTxId:        order.claimedTxId ?? "",
      status:             order.status,
      releasedBy:         order.releasedBy ?? "",
      evidenceRef:        order.evidenceRef ?? "",
      rejectionReason:    order.rejectionReason ?? "",
    },
  });
  return mapRow(row);
}

/** Extra columns a transition may set in the same atomic write. */
export interface TransitionPatch {
  claimedTxId?: string;
  releasedBy?: string;
  evidenceRef?: string;
  rejectionReason?: string;
  completedAt?: Date;
  releasedAt?: Date;
}

/**
 * Move an order between states, atomically and only along a legal edge.
 *
 * The status guard lives in the WHERE clause, so two concurrent callers cannot
 * both succeed — the second matches zero rows and gets null back.  This is what
 * stops a double-tap, two open admin tabs, or a retried request from releasing
 * the same order twice.  Never replace it with read-then-write.
 *
 * Returns the updated order, or null if the order was not in `from` (already
 * moved, or someone else got there first).
 */
export async function transitionOrder(
  id: string,
  from: OrderStatus | OrderStatus[],
  to: OrderStatus,
  patch: TransitionPatch = {}
): Promise<Order | null> {
  const fromList = Array.isArray(from) ? from : [from];

  const illegal = fromList.filter((s) => !canTransition(s, to));
  if (illegal.length > 0) {
    throw new Error(
      `Illegal transition: ${illegal.join("/")} → ${to}. ` +
        `Legal targets: ${illegal.map((s) => TRANSITIONS[s].join("|") || "none").join(", ")}.`
    );
  }

  const result = await prisma.transfer.updateMany({
    where: { id, status: { in: fromList } },
    data: { status: to, ...patch },
  });

  if (result.count === 0) return null;

  const row = await prisma.transfer.findUnique({ where: { id } });
  return row ? mapRow(row) : null;
}

/**
 * Claim an on-chain txId for a sell order and advance it to deposit_confirmed.
 *
 * The txId is persisted in the same write that moves the status, so a crash
 * immediately afterwards cannot leave the deposit unattributed and available
 * for a second order to claim.
 */
export async function claimTransferTxId(
  id: string,
  txId: string
): Promise<Order | null> {
  return transitionOrder(id, "awaiting_deposit", "deposit_confirmed", {
    claimedTxId: txId,
  });
}

// ─── Admin stats ──────────────────────────────────────────────────────────────

export interface AdminStats {
  totalTransactions: number;
  totalVolumeUSD: number;
  totalFeesUSD: number;
  totalReceivedUSD: number;
  completedTransactions: number;
  pendingTransactions: number;
  failedTransactions: number;
  avgTransactionUSD: number;
  volumeByToken: Record<string, number>;
  volumeByCurrency: Record<string, number>;
  recentTransfers: Order[];
}

const SETTLED_STATUSES: OrderStatus[] = ["settled", "released"];
const DEAD_STATUSES: OrderStatus[]    = ["failed", "rejected", "expired"];

export async function getAdminStats(): Promise<AdminStats> {
  const all = await getAllTransfers();

  const totalTransactions = all.length;
  const totalVolumeUSD    = all.reduce((s, t) => s + t.usdEquivalent, 0);
  const totalFeesUSD      = all.reduce((s, t) => s + t.fee, 0);
  const totalReceivedUSD  = all.reduce((s, t) => s + t.receiveAmount, 0);

  const completedTransactions = all.filter((t) => SETTLED_STATUSES.includes(t.status)).length;
  const pendingTransactions   = all.filter((t) => OPEN_STATUSES.includes(t.status)).length;
  const failedTransactions    = all.filter((t) => DEAD_STATUSES.includes(t.status)).length;
  const avgTransactionUSD     = totalTransactions > 0 ? totalVolumeUSD / totalTransactions : 0;

  // Open-ended now — the asset list spans eight chains, so these can't be a
  // fixed-key record any more.
  const volumeByToken: Record<string, number>    = {};
  const volumeByCurrency: Record<string, number> = {};

  for (const t of all) {
    const tokenKey = `${t.sendToken}:${t.chain}`;
    volumeByToken[tokenKey]             = (volumeByToken[tokenKey] ?? 0) + t.usdEquivalent;
    volumeByCurrency[t.receiveCurrency] = (volumeByCurrency[t.receiveCurrency] ?? 0) + t.receiveAmount;
  }

  return {
    totalTransactions,
    totalVolumeUSD,
    totalFeesUSD,
    totalReceivedUSD,
    completedTransactions,
    pendingTransactions,
    failedTransactions,
    avgTransactionUSD,
    volumeByToken,
    volumeByCurrency,
    recentTransfers: all.slice(0, 10),
  };
}
