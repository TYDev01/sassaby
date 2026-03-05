// ─── In-memory store (replace with a real DB later) ──────────────────────────

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

// Singleton in-memory store
const transfers: Transfer[] = [];

export function getAllTransfers(): Transfer[] {
  return [...transfers].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getTransferById(id: string): Transfer | undefined {
  return transfers.find((t) => t.id === id);
}

export function addTransfer(transfer: Transfer): Transfer {
  transfers.push(transfer);
  return transfer;
}

export function updateTransferStatus(
  id: string,
  status: TransferStatus,
  completedAt?: string
): Transfer | null {
  const idx = transfers.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  transfers[idx] = { ...transfers[idx], status, ...(completedAt ? { completedAt } : {}) };
  return transfers[idx];
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

export function getAdminStats(): AdminStats {
  const all = getAllTransfers();

  const totalTransactions = all.length;
  const totalVolumeUSD = all.reduce((s, t) => s + t.usdEquivalent, 0);
  const totalFeesUSD = all.reduce((s, t) => s + t.fee, 0);
  const totalReceivedUSD = all.reduce((s, t) => s + t.receiveAmount, 0);
  const completedTransactions = all.filter((t) => t.status === "completed").length;
  const pendingTransactions = all.filter(
    (t) => t.status === "pending" || t.status === "processing"
  ).length;
  const failedTransactions = all.filter((t) => t.status === "failed").length;
  const avgTransactionUSD = totalTransactions > 0 ? totalVolumeUSD / totalTransactions : 0;

  const volumeByToken: Record<SendToken, number> = { STX: 0, USDCx: 0, BTC: 0 };
  const volumeByCurrency: Record<Currency, number> = { NGN: 0, GHS: 0, KES: 0 };
  const volumeByMethod: Record<PaymentMethod, number> = {
    instant: 0,
    same_day: 0,
    standard: 0,
  };

  for (const t of all) {
    volumeByToken[t.sendToken] += t.usdEquivalent;
    volumeByCurrency[t.receiveCurrency] += t.receiveAmount;
    volumeByMethod[t.paymentMethod] += t.usdEquivalent;
  }

  const recentTransfers = all.slice(0, 10);

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
    recentTransfers,
  };
}
