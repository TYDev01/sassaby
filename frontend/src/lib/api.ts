// ─── Domain types ─────────────────────────────────────────────────────────────

/** From the client's perspective. */
export type OrderDirection = "buy" | "sell";

export type OrderStatus =
  // sell leg — the client sells crypto to the desk
  | "awaiting_deposit"
  | "deposit_confirmed"
  | "awaiting_manual_payout"
  | "settled"
  // buy leg — the client buys crypto from the desk
  | "awaiting_payment"
  | "payment_claimed"
  | "verifying"
  | "released"
  // terminal, both legs
  | "rejected"
  | "expired"
  | "failed";

export type Currency = "NGN" | "GHS" | "KES";

export const OPEN_STATUSES: OrderStatus[] = [
  "awaiting_payment",
  "payment_claimed",
  "verifying",
  "awaiting_deposit",
  "deposit_confirmed",
  "awaiting_manual_payout",
];

export function isOpen(status: OrderStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

export interface Order {
  id: string;
  createdAt: string;
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
  senderAddress: string;
  depositAddress: string;
  destinationAddress: string;
  claimedTxId: string;
  status: OrderStatus;
  completedAt?: string;
  releasedAt?: string;
  evidenceRef: string;
  rejectionReason: string;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  bankAccountName: string;
  kycTier: string;
  /** Operator access. Server-granted only — never settable from the client. */
  isAdmin: boolean;
}

// ─── Base URLs ────────────────────────────────────────────────────────────────

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");

/** Next.js origin for server-side proxy routes (admin calls stay server-side). */
const NEXTJS_ORIGIN =
  typeof window === "undefined" ? `http://localhost:${process.env.PORT ?? 3000}` : "";

// ─── Session token ────────────────────────────────────────────────────────────

const TOKEN_KEY = "sassaby.token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

/** Thrown by `request` so callers can branch on status without parsing strings. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Single fetch path for the backend API.
 *
 * Attaches the bearer token when present and normalises errors — the server
 * returns `{ error }` on every failure, so unwrap it once here rather than in
 * each caller.
 */
async function request<T>(
  path: string,
  init: RequestInit & { auth?: boolean } = {}
): Promise<T> {
  const { auth = true, headers, ...rest } = init;
  const token = auth ? getToken() : null;

  const res = await fetch(`${BASE_URL}${path}`, {
    cache: "no-store",
    ...rest,
    headers: {
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    // A dead session should not leave a stale token behind to fail every
    // subsequent call — clear it so the UI can route to sign-in cleanly.
    if (res.status === 401) setToken(null);
    throw new ApiError(
      (body.error as string) ?? `Request failed (${res.status})`,
      res.status,
      body
    );
  }

  return body as T;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthResult {
  token: string;
  user: User;
}

export async function register(payload: {
  email: string;
  password: string;
  fullName?: string;
  phone?: string;
  bankAccountName?: string;
}): Promise<AuthResult> {
  const data = await request<AuthResult>("/api/auth/register", {
    method: "POST",
    auth: false,
    body: JSON.stringify(payload),
  });
  setToken(data.token);
  return data;
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const data = await request<AuthResult>("/api/auth/login", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  return data;
}

export function logout(): void {
  setToken(null);
}

export async function fetchMe(): Promise<User> {
  const data = await request<{ user: User }>("/api/auth/me");
  return data.user;
}

/**
 * Slide the idle window. Requires a token that is still valid, so this extends a
 * live session rather than resurrecting a dead one.
 */
export async function refreshSession(): Promise<User> {
  const data = await request<AuthResult>("/api/auth/refresh", { method: "POST" });
  setToken(data.token);
  return data.user;
}

export async function updateProfile(patch: {
  fullName?: string;
  phone?: string;
  bankAccountName?: string;
}): Promise<User> {
  const data = await request<{ user: User }>("/api/auth/me", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return data.user;
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export interface CreateOrderPayload {
  direction: OrderDirection;
  sendAmount: number;
  sendToken: string;
  chain: string;
  receiveCurrency: Currency;
  /** sell only — where the desk pays the client out */
  bank?: string;
  bankCode?: string;
  accountNumber?: string;
  senderAddress?: string;
  /** buy only — where the desk releases crypto to */
  destinationAddress?: string;
}

export interface CreateOrderResult {
  success: boolean;
  id: string;
  direction: OrderDirection;
  status: OrderStatus;
  sendAmount: number;
  sendToken: string;
  chain: string;
  receiveAmount: number;
  receiveCurrency: Currency;
  depositAddress: string;
  depositMemo: string;
  memoRequired: boolean;
}

export async function createOrder(payload: CreateOrderPayload): Promise<CreateOrderResult> {
  return request<CreateOrderResult>("/api/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchOrders(): Promise<Order[]> {
  const data = await request<{ orders: Order[] }>("/api/orders");
  return data.orders;
}

/** The caller's single live order, or null. Drives the one-open-order rule. */
export async function fetchOpenOrder(): Promise<Order | null> {
  const data = await request<{ order: Order | null }>("/api/orders/open");
  return data.order;
}

export async function fetchOrder(id: string): Promise<Order> {
  const data = await request<{ order: Order }>(`/api/orders/${id}`);
  return data.order;
}

/** Buy leg: assert payment was sent. Releases nothing — queues it for review. */
export async function claimPayment(id: string): Promise<Order> {
  const data = await request<{ order: Order }>(`/api/orders/${id}/claim-payment`, {
    method: "POST",
  });
  return data.order;
}

export async function cancelOrder(id: string): Promise<Order> {
  const data = await request<{ order: Order }>(`/api/orders/${id}/cancel`, {
    method: "POST",
  });
  return data.order;
}

// ─── Rate quotes ──────────────────────────────────────────────────────────────

/** Where a quote's fiat rate came from. The desk prices off its own P2P ads. */
export type RateSource = "bitget" | "bitget_opposite" | "manual";

export interface RateQuote {
  token: string;
  tokenPriceUSD: number;
  usdAmount: number;
  /** Fiat units per USD, from the desk's own book. */
  deskRate: number;
  /** Same value under the legacy name. */
  flwRate: number;
  receiveAmount: number;
  currency: string;
  rateSource?: RateSource;
  rateMode?: "api" | "manual";
  advId?: string;
}

export async function fetchRates(
  token: string,
  amount: number,
  currency: string,
  /** Side of the desk's book — a sell order prices off the buy-side ad. */
  side?: "buy" | "sell"
): Promise<RateQuote> {
  const params = new URLSearchParams({ token, amount: String(amount), currency });
  if (side) params.set("side", side);
  return request<RateQuote>(`/api/rates?${params}`, { auth: false });
}

// ─── Assets and deposit addresses ─────────────────────────────────────────────

export interface AssetSpec {
  token: string;
  chain: string;
  network: string;
  decimals: number;
  requiresMemo?: boolean;
  monitored?: boolean;
}

export interface DepositAddress {
  token: string;
  chain: string;
  address: string;
  memo: string;
  label: string;
  updatedAt: string;
}

export interface DepositAddressMap {
  /** Keyed "TOKEN:chain" — token alone is ambiguous across networks. */
  addresses: Record<string, DepositAddress>;
  supported: AssetSpec[];
}

export async function fetchDepositAddresses(): Promise<DepositAddressMap> {
  const res = await fetch(`${NEXTJS_ORIGIN}/api/deposit-addresses`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch deposit addresses");
  return res.json();
}

export async function upsertDepositAddress(payload: {
  token: string;
  chain: string;
  address: string;
  memo?: string;
  label?: string;
  kind?: "self" | "bitget";
  active?: boolean;
}): Promise<DepositAddress> {
  const res = await fetch(`${NEXTJS_ORIGIN}/api/deposit-addresses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...adminAuthHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to save deposit address");
  return data.depositAddress as DepositAddress;
}

export async function deleteDepositAddress(token: string, chain: string): Promise<void> {
  await fetch(`${NEXTJS_ORIGIN}/api/deposit-addresses/${token}/${chain}`, {
    method: "DELETE",
    headers: adminAuthHeaders(),
  });
}

// ─── Banks ────────────────────────────────────────────────────────────────────

export interface Bank {
  id: number;
  code: string;
  name: string;
}

export interface VerifiedAccount {
  account_name: string;
  account_number: string;
}

export async function fetchBanks(country = "NG"): Promise<Bank[]> {
  const data = await request<{ banks: Bank[] }>(`/api/banks?country=${country}`, {
    auth: false,
  });
  return data.banks;
}

export async function verifyAccount(
  account_number: string,
  account_bank: string
): Promise<VerifiedAccount> {
  return request<VerifiedAccount>("/api/banks/verify-account", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ account_number, account_bank }),
  });
}

// ─── Admin ────────────────────────────────────────────────────────────────────

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
  /**
   * Bitget P2P, reported alongside the site's own orders rather than added to
   * them: a customer order and the P2P trade that rebalances it are the same
   * value moving twice.
   */
  p2p?: P2PStats;
}

export interface P2PStats {
  /** False when Bitget is unconfigured or unreachable. */
  available: boolean;
  error?: string;
  completedOrders: number;
  pendingOrders: number;
  volumeUSD: number;
  feesUSD: number;
  volumeByFiat: Record<string, number>;
  boughtUSD: number;
  soldUSD: number;
  /** True when the page cap was hit, so the totals are a floor. */
  truncated?: boolean;
}

/** Bearer header for the Next.js admin proxies, which authorise before
 *  attaching the privileged key server-side. */
function adminAuthHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchAdminStats(): Promise<AdminStats> {
  const res = await fetch(`${NEXTJS_ORIGIN}/api/admin/stats`, {
    cache: "no-store",
    headers: adminAuthHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch admin stats");
  return res.json();
}

export type RateMode = "api" | "manual";

export interface RateConfig {
  modes: Record<string, RateMode>;
  manualRates: Record<string, number>;
}

export async function fetchRateConfig(): Promise<RateConfig> {
  const res = await fetch(`${NEXTJS_ORIGIN}/api/rates/config`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch rate config");
  return res.json();
}

export async function updateRateConfig(patch: Partial<RateConfig>): Promise<RateConfig> {
  const res = await fetch(`${NEXTJS_ORIGIN}/api/rates/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...adminAuthHeaders() },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("Failed to update rate config");
  return res.json();
}

// ─── Bitget ad book (admin) ───────────────────────────────────────────────────

export interface BitgetStatus {
  configured: boolean;
  reachable: boolean;
  merchant?: {
    uid: string;
    nickName: string;
    accountLevel: string;
    completedOrderNum: string;
    positiveRate: string;
  };
  error?: string;
  endpoints?: Record<string, string>;
}

export interface DeskAd {
  advId: string;
  token: string;
  fiat: string;
  side: "buy" | "sell";
  price: number;
  priceType: string;
  /** Bitget's status, e.g. "online", "delist", "remove". */
  status: string;
  /** True when the ad is actually on the book. Only live ads price quotes. */
  live: boolean;
  /**
   * The desk's own switch, independent of Bitget. False means quotes stop
   * pricing off this ad even though it is still live on the exchange.
   */
  active?: boolean;
  quantity: number;
  soldAmount: number;
  payMethodIds: string[];
  updatedTime: number;
}

export interface BitgetOrder {
  orderId: string;
  side: string;
  token: string;
  fiat: string;
  price: number;
  amount: number;
  quantity: number;
  fee: number;
  counterparty: string;
  /** "pending_payment" | "pending_release" | "in_appeal" */
  status: string;
  createdTime: number;
  updatedTime: number;
}

export interface MarketAd {
  advId: string;
  token: string;
  fiat: string;
  side: string;
  price: number;
  quantity: number;
  minAmount: number;
  maxAmount: number;
  merchantName: string;
  merchantId: string;
  completedOrderNum?: number;
}

export interface PublishAdPayload {
  token: string;
  fiat: string;
  side: "buy" | "sell";
  priceType: "fixed" | "floating";
  price?: number;
  premium?: number;
  quantity: number;
  minAmount: number;
  maxAmount: number;
  payMethodIds: Array<{ payMethodId: string; userPayMethodId?: string }>;
  payTimeLimit: string;
  remark?: string;
}

/** Admin proxies authorise the caller before attaching the privileged key. */
async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${NEXTJS_ORIGIN}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...adminAuthHeaders(),
      ...init.headers,
    },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError((body.error as string) ?? `Request failed (${res.status})`, res.status, body);
  }
  return body as T;
}

export async function fetchBitgetStatus(): Promise<BitgetStatus> {
  return adminRequest<BitgetStatus>("/api/admin/bitget/status");
}

export async function fetchDeskAds(): Promise<DeskAd[]> {
  const d = await adminRequest<{ ads: DeskAd[] }>("/api/admin/bitget/ads");
  return d.ads;
}

export async function fetchMarketBook(params: {
  token: string;
  fiat: string;
  side: "buy" | "sell";
}): Promise<MarketAd[]> {
  const qs = new URLSearchParams(params as unknown as Record<string, string>);
  const d = await adminRequest<{ ads: MarketAd[] }>(`/api/admin/bitget/market?${qs}`);
  return d.ads;
}

export async function publishAd(payload: PublishAdPayload): Promise<{ advId?: string }> {
  return adminRequest<{ advId?: string }>("/api/admin/bitget/ads", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function repriceAd(
  advId: string,
  patch: { price?: number; quantity?: number; minAmount?: number; maxAmount?: number; payTimeLimit?: string }
): Promise<unknown> {
  return adminRequest(`/api/admin/bitget/ads/${encodeURIComponent(advId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function setAdActive(advId: string, active: boolean): Promise<unknown> {
  return adminRequest(`/api/admin/bitget/ads/${encodeURIComponent(advId)}/active`, {
    method: "POST",
    body: JSON.stringify({ active }),
  });
}

export type BitgetOrderFilter =
  | "pending"
  | "completed"
  | "cancelled"
  | "in_appeal";

export async function fetchBitgetOrders(params: {
  status?: BitgetOrderFilter;
  side?: "buy" | "sell";
  cursor?: string;
  limit?: number;
} = {}): Promise<{ orders: BitgetOrder[]; nextId: string }> {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.side) qs.set("side", params.side);
  if (params.cursor) qs.set("cursor", params.cursor);
  if (params.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs}` : "";
  return adminRequest<{ orders: BitgetOrder[]; nextId: string }>(
    `/api/admin/bitget/orders${suffix}`
  );
}

/** Payment method IDs derived from the desk's own ad history. */
export async function fetchPayMethodIds(): Promise<string[]> {
  const d = await adminRequest<{ payMethodIds: string[] }>("/api/admin/bitget/pay-methods");
  return d.payMethodIds;
}
