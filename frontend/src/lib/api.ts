// ─── Shared API types ────────────────────────────────────────────────────────

export type TransferStatus = "pending" | "processing" | "completed" | "failed";
export type SendToken = "STX" | "USDCx" | "BTC";
export type Currency = "NGN" | "GHS" | "KES";

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
  bank: string;
  bankCode: string;
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

// ─── Rate quotes ─────────────────────────────────────────────────────────────

export interface RateQuote {
  token: string;
  tokenPriceUSD: number;
  usdAmount: number;
  flwRate: number;
  receiveAmount: number;
  currency: string;
  rateSource?: "flutterwave" | "manual";
  rateMode?: "api" | "manual";
}

export async function fetchRates(
  token: string,
  amount: number,
  currency: string
): Promise<RateQuote> {
  const params = new URLSearchParams({ token, amount: String(amount), currency });
  const res = await fetch(`${BASE_URL}/api/rates?${params}`, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to fetch rates");
  return data as RateQuote;
}

// ─── Rate config (admin) ──────────────────────────────────────────────────────

export type RateMode = "api" | "manual";

export interface RateConfig {
  modes: Record<string, RateMode>;
  manualRates: Record<string, number>;
}

export async function fetchRateConfig(): Promise<RateConfig> {
  const res = await fetch(`${BASE_URL}/api/rates/config`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch rate config");
  return res.json();
}

export async function updateRateConfig(patch: Partial<RateConfig>): Promise<RateConfig> {
  const res = await fetch(`${BASE_URL}/api/rates/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("Failed to update rate config");
  return res.json();
}

// ─── Deposit addresses (admin-managed) ───────────────────────────────────────

export interface DepositAddress {
  token: SendToken;
  address: string;
  label: string;
  updatedAt: string;
}

export interface DepositAddressMap {
  addresses: Record<SendToken, DepositAddress>;
  list: Array<DepositAddress & { id: number }>;
}

export async function fetchDepositAddresses(): Promise<DepositAddressMap> {
  const res = await fetch(`${BASE_URL}/api/deposit-addresses`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch deposit addresses");
  return res.json();
}

export async function upsertDepositAddress(
  token: SendToken,
  address: string,
  label = ""
): Promise<DepositAddress> {
  const res = await fetch(`${BASE_URL}/api/deposit-addresses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, address, label }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to save deposit address");
  return data.depositAddress as DepositAddress;
}

export async function deleteDepositAddress(token: SendToken): Promise<void> {
  await fetch(`${BASE_URL}/api/deposit-addresses/${token}`, { method: "DELETE" });
}

// ─── Flutterwave helpers ──────────────────────────────────────────────────────

export interface FlwBank {
  id: number;
  code: string;
  name: string;
}

export interface VerifiedAccount {
  account_name: string;
  account_number: string;
}

export async function fetchBanks(country = "NG"): Promise<FlwBank[]> {
  const res = await fetch(
    `${BASE_URL}/api/flutterwave/banks?country=${country}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error("Failed to fetch banks");
  const data = await res.json();
  return data.banks as FlwBank[];
}

export async function verifyAccount(
  account_number: string,
  account_bank: string
): Promise<VerifiedAccount> {
  const res = await fetch(`${BASE_URL}/api/flutterwave/verify-account`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account_number, account_bank }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Account verification failed");
  return data as VerifiedAccount;
}
