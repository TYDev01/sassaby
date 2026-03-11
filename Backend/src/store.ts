// ─── PostgreSQL store via Prisma ─────────────────────────────────────────────

import { prisma } from "./lib/prisma";

export type TransferStatus = "pending" | "processing" | "completed" | "failed";
export type SendToken = "STX" | "USDCx" | "BTC";
export type Currency = "NGN" | "GHS" | "KES";

export interface Transfer {
  id: string;
  createdAt: string; // ISO timestamp
  sendAmount: number;
  sendToken: SendToken;
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
  claimedTxId: string;   // on-chain txId that triggered the payout; empty until matched
  status: TransferStatus;
  completedAt?: string;
}

// ─── Row → interface mapper ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): Transfer {
  return {
    id:              row.id,
    createdAt:       row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    sendAmount:      Number(row.sendAmount),
    sendToken:       row.sendToken as SendToken,
    usdEquivalent:   Number(row.usdEquivalent),
    receiveAmount:   Number(row.receiveAmount),
    receiveCurrency: row.receiveCurrency as Currency,
    fee:             Number(row.fee),
    feeRate:         Number(row.feeRate),
    bank:            row.bank,
    bankCode:        row.bankCode,
    accountNumber:   row.accountNumber,
    senderAddress:   row.senderAddress ?? "",
    depositAddress:  row.depositAddress ?? "",
    claimedTxId:     row.claimedTxId ?? "",
    status:          row.status as TransferStatus,
    completedAt:     row.completedAt instanceof Date
      ? row.completedAt.toISOString()
      : row.completedAt ?? undefined,
  };
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function getAllTransfers(): Promise<Transfer[]> {
  const rows = await prisma.transfer.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(mapRow);
}

export async function getTransferById(id: string): Promise<Transfer | undefined> {
  const row = await prisma.transfer.findUnique({ where: { id } });
  return row ? mapRow(row) : undefined;
}

export async function addTransfer(transfer: Transfer): Promise<Transfer> {
  await prisma.transfer.create({
    data: {
      id:              transfer.id,
      createdAt:       new Date(transfer.createdAt),
      sendAmount:      transfer.sendAmount,
      sendToken:       transfer.sendToken,
      usdEquivalent:   transfer.usdEquivalent,
      receiveAmount:   transfer.receiveAmount,
      receiveCurrency: transfer.receiveCurrency,
      fee:             transfer.fee,
      feeRate:         transfer.feeRate,
      bank:            transfer.bank,
      bankCode:        transfer.bankCode,
      accountNumber:   transfer.accountNumber,
      senderAddress:   transfer.senderAddress,
      depositAddress:  transfer.depositAddress,
      claimedTxId:     transfer.claimedTxId ?? "",
      status:          transfer.status,
      completedAt:     transfer.completedAt ? new Date(transfer.completedAt) : null,
    },
  });
  return transfer;
}

export async function updateTransferStatus(
  id: string,
  status: TransferStatus,
  completedAt?: string
): Promise<Transfer | null> {
  try {
    const row = await prisma.transfer.update({
      where: { id },
      data: {
        status,
        ...(completedAt ? { completedAt: new Date(completedAt) } : {}),
      },
    });
    return mapRow(row);
  } catch {
    return null;
  }
}

/**
 * Atomically claim an on-chain txId for a transfer and advance its status to
 * "processing".  Returns null if the transfer no longer exists.
 * Call this BEFORE firing the Flutterwave payout so the txId is persisted even
 * if the payout call subsequently fails.
 */
export async function claimTransferTxId(
  id: string,
  txId: string
): Promise<Transfer | null> {
  try {
    const row = await prisma.transfer.update({
      where: { id },
      data: { claimedTxId: txId, status: "processing" },
    });
    return mapRow(row);
  } catch {
    return null;
  }
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
  volumeByToken: Record<SendToken, number>;
  volumeByCurrency: Record<Currency, number>;
  recentTransfers: Transfer[];
}

export async function getAdminStats(): Promise<AdminStats> {
  const all = await getAllTransfers();

  const totalTransactions = all.length;
  const totalVolumeUSD    = all.reduce((s, t) => s + t.usdEquivalent, 0);
  const totalFeesUSD      = all.reduce((s, t) => s + t.fee, 0);
  const totalReceivedUSD  = all.reduce((s, t) => s + t.receiveAmount, 0);

  const completedTransactions = all.filter((t) => t.status === "completed").length;
  const pendingTransactions   = all.filter(
    (t) => t.status === "pending" || t.status === "processing"
  ).length;
  const failedTransactions    = all.filter((t) => t.status === "failed").length;
  const avgTransactionUSD     = totalTransactions > 0 ? totalVolumeUSD / totalTransactions : 0;

  const volumeByToken: Record<SendToken, number>       = { STX: 0, USDCx: 0, BTC: 0 };
  const volumeByCurrency: Record<Currency, number>     = { NGN: 0, GHS: 0, KES: 0 };

  for (const t of all) {
    volumeByToken[t.sendToken]          += t.usdEquivalent;
    volumeByCurrency[t.receiveCurrency] += t.receiveAmount;
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
