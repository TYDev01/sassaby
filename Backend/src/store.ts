// ─── PostgreSQL store via Prisma ─────────────────────────────────────────────

import { prisma } from "./lib/prisma";

export type TransferStatus = "pending" | "processing" | "completed" | "failed";
export type SendToken = "STX" | "USDCx" | "BTC";
export type Currency = "NGN" | "GHS" | "KES";
export type PaymentMethod = "instant" | "same_day" | "standard";

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
  paymentMethod: PaymentMethod;
  bank: string;
  bankCode: string;
  accountNumber: string;
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
    paymentMethod:   row.paymentMethod as PaymentMethod,
    bank:            row.bank,
    bankCode:        row.bankCode,
    accountNumber:   row.accountNumber,
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
      paymentMethod:   transfer.paymentMethod,
      bank:            transfer.bank,
      bankCode:        transfer.bankCode,
      accountNumber:   transfer.accountNumber,
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
  volumeByMethod: Record<PaymentMethod, number>;
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
  const volumeByMethod: Record<PaymentMethod, number>  = { instant: 0, same_day: 0, standard: 0 };

  for (const t of all) {
    volumeByToken[t.sendToken]       += t.usdEquivalent;
    volumeByCurrency[t.receiveCurrency] += t.receiveAmount;
    volumeByMethod[t.paymentMethod]  += t.usdEquivalent;
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
    volumeByMethod,
    recentTransfers: all.slice(0, 10),
  };
}
