/**
 * Bitget P2P merchant API client (UTA v3).
 *
 * Signing:
 *   ACCESS-SIGN = base64(HMAC-SHA256(timestamp + METHOD + requestPath + body, secret))
 *
 * Credentials are read from the environment at call time and never logged. Error
 * paths deliberately report status codes and Bitget's own message only — never
 * the request headers, which carry the signature.
 *
 * P2P lives under the Unified Trading Account API (`/api/v3/p2p/*`), not the v2
 * paths the older docs describe. Ad writes need the **UTA P2P read-and-write**
 * key permission; reads need UTA P2P read. Access requires Advanced merchant
 * status or above.
 */

import axios from "axios";
import crypto from "crypto";

const BASE_URL = (process.env.BITGET_API_URL ?? "https://api.bitget.com").replace(/\/$/, "");
const TIMEOUT_MS = 12_000;

/**
 * Endpoint paths, verified against this account by probe.
 *
 * Bitget splits P2P across two API generations and the account mode picks one —
 * they are mutually exclusive, not layered:
 *
 *   Classic mode → v2 works, v3 returns 40084.
 *   Unified (UTA) → v3 works, v2 returns 40085.
 *
 * This account is on UTA, so v3 is the live set. The v2 paths are kept only for
 * reference and for anyone running a Classic-mode deployment; calling them here
 * will fail with 40085.
 *
 * Note there are no v2 write endpoints at all — advCreate / adv/create /
 * ad-create and their update variants all return 40404. Publishing and repricing
 * only exist in v3, which is why the UTA upgrade was required.
 */
const V2 = (process.env.BITGET_P2P_PREFIX_V2 ?? "/api/v2/p2p").replace(/\/$/, "");
const V3 = (process.env.BITGET_P2P_PREFIX_V3 ?? "/api/v3/p2p").replace(/\/$/, "");

export const P2P = {
  // ── v2: reads, work in Classic mode ──
  /** Merchant profile. No parameters. */
  merchantInfo: process.env.BITGET_PATH_MERCHANT_INFO ?? `${V2}/merchantInfo`,
  /** The merchant's OWN ads. Requires `side`; omitting it returns 60004. */
  advList:      process.env.BITGET_PATH_ADV_LIST      ?? `${V2}/advList`,
  /** The merchant's own P2P orders. */
  orderList:    process.env.BITGET_PATH_ORDER_LIST    ?? `${V2}/orderList`,

  // ── v3 (UTA): writes, require Unified Account mode ──
  userInfo:     process.env.BITGET_PATH_USER_INFO     ?? `${V3}/user-info`,
  /** PUBLIC market book across all merchants. */
  adList:       process.env.BITGET_PATH_AD_LIST       ?? `${V3}/ad-list`,
  adCreate:     process.env.BITGET_PATH_AD_CREATE     ?? `${V3}/ad-create`,
  adUpdate:     process.env.BITGET_PATH_AD_UPDATE     ?? `${V3}/ad-update`,
} as const;

/** Bitget's code for "this account is in Classic mode, v3 is unavailable". */
export const CLASSIC_MODE_CODE = "40084";

export function isClassicModeError(err: unknown): boolean {
  return (err as Error)?.message?.includes(CLASSIC_MODE_CODE) ?? false;
}

export interface BitgetCredentials {
  key: string;
  secret: string;
  passphrase: string;
}

export function getCredentials(): BitgetCredentials | null {
  const key = process.env.BITGET_API_KEY;
  const secret = process.env.BITGET_API_SECRET;
  const passphrase = process.env.BITGET_API_PASSPHRASE;
  if (!key || !secret || !passphrase) return null;
  return { key, secret, passphrase };
}

export function isConfigured(): boolean {
  return getCredentials() !== null;
}

function sign(
  secret: string,
  timestamp: string,
  method: string,
  requestPath: string,
  body = ""
): string {
  const prehash = `${timestamp}${method.toUpperCase()}${requestPath}${body}`;
  return crypto.createHmac("sha256", secret).update(prehash).digest("base64");
}

function authHeaders(
  creds: BitgetCredentials,
  timestamp: string,
  method: string,
  requestPath: string,
  body = ""
): Record<string, string> {
  return {
    "ACCESS-KEY": creds.key,
    "ACCESS-SIGN": sign(creds.secret, timestamp, method, requestPath, body),
    "ACCESS-TIMESTAMP": timestamp,
    "ACCESS-PASSPHRASE": creds.passphrase,
    "Content-Type": "application/json",
    locale: "en-US",
  };
}

/** Bitget wraps every response; unwrap it and turn its error envelope into a throw. */
function unwrap<T>(
  path: string,
  status: number,
  body: { code?: string; msg?: string; data?: T }
): T {
  if (status !== 200 || (body?.code && body.code !== "00000")) {
    throw new Error(
      `Bitget ${path} failed (http ${status}, code ${body?.code ?? "?"}): ${
        body?.msg ?? "unknown error"
      }`
    );
  }
  return body.data as T;
}

/**
 * Signed GET.
 *
 * `requestPath` must include the query string exactly as sent — the signature
 * covers it, so building the URL and the prehash separately is how signature
 * mismatches happen.
 */
export async function signedGet<T>(
  path: string,
  query: Record<string, string | number | undefined> = {}
): Promise<T> {
  const creds = getCredentials();
  if (!creds) throw new Error("Bitget API credentials are not configured.");

  const entries = Object.entries(query).filter(([, v]) => v !== undefined && v !== "");
  const qs = entries.length
    ? "?" + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")
    : "";
  const requestPath = `${path}${qs}`;
  const timestamp = Date.now().toString();

  const res = await axios.get<{ code: string; msg: string; data: T }>(
    `${BASE_URL}${requestPath}`,
    {
      timeout: TIMEOUT_MS,
      headers: authHeaders(creds, timestamp, "GET", requestPath),
      validateStatus: () => true,
    }
  );

  return unwrap(path, res.status, res.data);
}

/**
 * Signed POST.
 *
 * The signature covers the serialised body verbatim, so the exact same string is
 * signed and sent — letting axios re-serialise would break it, hence the
 * identity `transformRequest`.
 */
export async function signedPost<T>(
  path: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  const creds = getCredentials();
  if (!creds) throw new Error("Bitget API credentials are not configured.");

  const body = JSON.stringify(payload);
  const timestamp = Date.now().toString();

  const res = await axios.post<{ code: string; msg: string; data: T }>(
    `${BASE_URL}${path}`,
    body,
    {
      timeout: TIMEOUT_MS,
      headers: authHeaders(creds, timestamp, "POST", path, body),
      transformRequest: [(d) => d],
      validateStatus: () => true,
    }
  );

  return unwrap(path, res.status, res.data);
}

// ─── Merchant account ─────────────────────────────────────────────────────────

export interface MerchantInfo {
  /** v3 field. */
  uid?: string;
  /** v2 field. */
  merchantId?: string;
  nickName?: string;
  /** v3 only: "starter" | "advanced" | "master" */
  accountLevel?: string;
  completedOrderNum?: string;
  totalTrades?: string;
  positiveRate?: string;
  equityDetail?: {
    maxAdvSellNum?: string;
    maxAdvSellLimit?: string;
    maxAdvBuyNum?: string;
    maxAdvBuyLimit?: string;
    totalMaxPendingOrder?: string;
    advMaxPendingOrder?: string;
  };
}

/** Merchant profile. UTA path; needs the P2P read permission on the key. */
export async function fetchMerchantInfo(): Promise<MerchantInfo> {
  return signedGet<MerchantInfo>(P2P.userInfo);
}

/**
 * Best-effort read of the desk's own ads on UTA.
 *
 * v2 had a dedicated "my ads" endpoint (`advList`); no v3 equivalent is
 * confirmed, and `ad-list` is the PUBLIC book. So this pulls the public book and
 * filters to rows whose `merchantName` matches this account's nickname.
 *
 * Deliberately not the pricing source: the public book is paged 10 at a time, so
 * an uncompetitive ad can fall off page one and silently vanish from the result.
 * `DeskAd` — written when the desk publishes — is the authority for pricing.
 * This is for display and drift-checking.
 */
export async function fetchOwnAds(
  side: "buy" | "sell",
  opts: { token?: string; fiat?: string; nickName?: string } = {}
): Promise<Ad[]> {
  const nickName = opts.nickName ?? (await fetchMerchantInfo()).nickName ?? "";
  if (!nickName) return [];

  const book = await fetchAdList({
    token: opts.token ?? "USDT",
    fiat: opts.fiat ?? "NGN",
    side,
  });
  return book.filter((a) => a.merchantName === nickName);
}

// ─── Market book ──────────────────────────────────────────────────────────────

export interface RawAd {
  advId?: string;
  advNo?: string;
  coin?: string;
  token?: string;
  fiat?: string;
  side?: string;
  price?: string | number;
  quantity?: string | number;
  minAmount?: string | number;
  maxAmount?: string | number;
  merchantName?: string;
  [k: string]: unknown;
}

export interface Ad {
  advId: string;
  token: string;
  fiat: string;
  /** "buy" = the advertiser buys crypto; "sell" = the advertiser sells crypto. */
  side: "buy" | "sell" | "unknown";
  /** Fiat units per 1 unit of token. */
  price: number;
  quantity: number;
  minAmount: number;
  maxAmount: number;
  merchantName: string;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normaliseAd(raw: RawAd): Ad | null {
  const price = Number(raw.price);
  if (!Number.isFinite(price) || price <= 0) return null;

  const side = String(raw.side ?? "").toLowerCase();
  return {
    // v2 calls it advNo, v3 calls it advId.
    advId: String(raw.advId ?? raw.advNo ?? ""),
    // v2 calls it coin, v3 calls it token.
    token: String(raw.token ?? raw.coin ?? "").toUpperCase(),
    fiat: String(raw.fiat ?? "").toUpperCase(),
    side: side === "buy" ? "buy" : side === "sell" ? "sell" : "unknown",
    price,
    quantity: num(raw.quantity),
    minAmount: num(raw.minAmount),
    maxAmount: num(raw.maxAmount),
    merchantName: String(raw.merchantName ?? ""),
  };
}

/**
 * The public order book for a (token, fiat, side).
 *
 * This is the whole market, not only this desk's ads — it returns `merchantName`
 * for each row. Useful for deciding where to price, and for locating the desk's
 * own ad by `advId`. Bitget caps `limit` at 10 per page.
 */
export async function fetchAdList(params: {
  token: string;
  fiat: string;
  side: "buy" | "sell";
  amount?: number;
  pageNum?: number;
  limit?: number;
}): Promise<Ad[]> {
  const data = await signedGet<RawAd[] | { list?: RawAd[]; adList?: RawAd[] }>(P2P.adList, {
    token: params.token.toUpperCase(),
    fiat: params.fiat.toUpperCase(),
    side: params.side,
    amount: params.amount,
    pageNum: params.pageNum ?? 1,
    limit: Math.min(params.limit ?? 10, 10),
  });

  const rows: RawAd[] = Array.isArray(data) ? data : data?.list ?? data?.adList ?? [];
  return rows.map(normaliseAd).filter((a): a is Ad => a !== null);
}

// ─── Ad management ────────────────────────────────────────────────────────────

export interface PayMethodRef {
  payMethodId: string;
  /** Required when side = "sell" — the desk's own collection method. */
  userPayMethodId?: string;
}

export interface CreateAdInput {
  token: string;
  fiat: string;
  side: "buy" | "sell";
  priceType: "fixed" | "floating";
  /** Required when priceType = "fixed". */
  price?: number;
  /** Required when priceType = "floating". */
  premium?: number;
  minAmount: number;
  maxAmount: number;
  quantity: number;
  payMethodIds: PayMethodRef[];
  /** Minutes — Bitget accepts "5" or "10". */
  payTimeLimit: string;
  remark?: string;
  tradeTerms?: string;
}

/** Bitget takes every numeric field as a string. */
function str(v: number | undefined): string | undefined {
  return v === undefined ? undefined : String(v);
}

export async function createAd(input: CreateAdInput): Promise<{ advId: string }> {
  return signedPost<{ advId: string }>(P2P.adCreate, {
    token: input.token.toUpperCase(),
    fiat: input.fiat.toUpperCase(),
    side: input.side,
    priceType: input.priceType,
    ...(input.price !== undefined ? { price: str(input.price) } : {}),
    ...(input.premium !== undefined ? { premium: str(input.premium) } : {}),
    minAmount: str(input.minAmount),
    maxAmount: str(input.maxAmount),
    quantity: str(input.quantity),
    payMethodIds: input.payMethodIds,
    payTimeLimit: input.payTimeLimit,
    ...(input.remark ? { remark: input.remark } : {}),
    ...(input.tradeTerms ? { tradeTerms: input.tradeTerms } : {}),
  });
}

export interface UpdateAdInput {
  advId: string;
  priceType?: "fixed" | "floating";
  price?: number;
  premium?: number;
  minAmount?: number;
  maxAmount?: number;
  quantity?: number;
  payMethodIds?: PayMethodRef[];
  /** Bitget marks this required on update, even when nothing else changes. */
  payTimeLimit: string;
  remark?: string;
  tradeTerms?: string;
}

/**
 * Repricing an ad is how the desk moves its rate — quotes are priced off the
 * published price, so the two are the same number rather than two numbers kept
 * in sync.
 */
export async function updateAd(input: UpdateAdInput): Promise<unknown> {
  const payload: Record<string, unknown> = {
    advId: input.advId,
    payTimeLimit: input.payTimeLimit,
  };
  if (input.priceType) payload.priceType = input.priceType;
  if (input.price !== undefined) payload.price = str(input.price);
  if (input.premium !== undefined) payload.premium = str(input.premium);
  if (input.minAmount !== undefined) payload.minAmount = str(input.minAmount);
  if (input.maxAmount !== undefined) payload.maxAmount = str(input.maxAmount);
  if (input.quantity !== undefined) payload.quantity = str(input.quantity);
  if (input.payMethodIds) payload.payMethodIds = input.payMethodIds;
  if (input.remark) payload.remark = input.remark;
  if (input.tradeTerms) payload.tradeTerms = input.tradeTerms;

  return signedPost(P2P.adUpdate, payload);
}

// ─── Connectivity ─────────────────────────────────────────────────────────────

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
  /** Bitget's own error message when a call fails. Never includes credentials. */
  error?: string;
}

/**
 * Verify the credentials sign correctly and the account is readable.
 *
 * Uses `user-info` rather than a public endpoint: it needs only the read
 * permission, takes no parameters, and proves the key, secret, passphrase and
 * permissions work together — a public ping proves only that the host resolves.
 */
export async function checkStatus(): Promise<BitgetStatus> {
  if (!isConfigured()) return { configured: false, reachable: false };
  try {
    const info = await fetchMerchantInfo();
    return {
      configured: true,
      reachable: true,
      merchant: {
        uid: info.uid ?? info.merchantId ?? "",
        nickName: info.nickName ?? "",
        accountLevel: info.accountLevel ?? "",
        completedOrderNum: info.completedOrderNum ?? info.totalTrades ?? "",
        positiveRate: info.positiveRate ?? "",
      },
    };
  } catch (err) {
    return { configured: true, reachable: false, error: (err as Error).message };
  }
}
