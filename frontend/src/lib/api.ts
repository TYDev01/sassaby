// ─── Shared API types ────────────────────────────────────────────────────────

export type TransferStatus = "pending" | "processing" | "completed" | "failed";
export type SendToken = "STX" | "USDCx" | "BTC";
export type Currency = "NGN" | "GHS" | "KES";
export type PaymentMethod = "instant" | "same_day" | "standard";

export interface Transfer {
  id: string;
  createdAt: string;
  sendAmount: number;
  sendToken: SendToken;
  usdEquivalent: number;
  receiveAmount: number;
  receiveCurrency: Currency;
  fee: number;
  feeRate: number;
  paymentMethod: PaymentMethod;
  bank: string;
  accountNumber: string;
  status: TransferStatus;
  completedAt?: string;
}

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

// ─── API base URL ────────────────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── API helpers ─────────────────────────────────────────────────────────────

export async function fetchAdminStats(): Promise<AdminStats> {
  const res = await fetch(`${BASE_URL}/api/admin/stats`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch admin stats");
  return res.json();
}

export async function fetchTransfers(): Promise<Transfer[]> {
  const res = await fetch(`${BASE_URL}/api/transfers`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch transfers");
  const data = await res.json();
  return data.transfers;
}

export async function createTransfer(payload: {
  sendAmount: number;
  sendToken: SendToken;
  receiveCurrency: Currency;
  paymentMethod: PaymentMethod;
  bank: string;
  accountNumber: string;
}): Promise<Transfer> {
  const res = await fetch(`${BASE_URL}/api/transfers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to create transfer");
  const data = await res.json();
  return data.transfer;
}
