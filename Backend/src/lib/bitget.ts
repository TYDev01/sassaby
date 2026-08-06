/**
 * Bitget merchant API client.
 *
 * Signing follows the standard v2 scheme:
 *   ACCESS-SIGN = base64(HMAC-SHA256(timestamp + METHOD + requestPath + body, secret))
 *
 * Credentials are read from the environment at call time and never logged. Error
 * paths deliberately report status codes and Bitget's own message only — never
 * the request headers, which carry the signature.
 */

import axios from "axios";
import crypto from "crypto";

const BASE_URL = (process.env.BITGET_API_URL ?? "https://api.bitget.com").replace(/\/$/, "");
const TIMEOUT_MS = 12_000;

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

/**
 * Signed GET against the Bitget v2 API.
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
      headers: {
        "ACCESS-KEY": creds.key,
        "ACCESS-SIGN": sign(creds.secret, timestamp, "GET", requestPath),
        "ACCESS-TIMESTAMP": timestamp,
        "ACCESS-PASSPHRASE": creds.passphrase,
        "Content-Type": "application/json",
        locale: "en-US",
      },
      // Handle Bitget's own error envelope rather than throwing on 4xx.
      validateStatus: () => true,
    }
  );

  const body = res.data;
  if (res.status !== 200 || (body?.code && body.code !== "00000")) {
    throw new Error(
      `Bitget ${path} failed (http ${res.status}, code ${body?.code ?? "?"}): ${
        body?.msg ?? "unknown error"
      }`
    );
  }

  return body.data;
}

// ─── P2P advertisements ───────────────────────────────────────────────────────

/**
 * One of the desk's own P2P ads.
 *
 * Field names vary across Bitget's docs revisions, so the shape is permissive
 * and normalised by `normaliseAdv` rather than trusted verbatim.
 */
export interface RawAdv {
  advNo?: string;
  coin?: string;
  fiat?: string;
  fiatCode?: string;
  price?: string | number;
  /** "buy" | "sell" — whose side the ad is on. */
  side?: string;
  type?: string;
  status?: string;
  advStatus?: string;
  [k: string]: unknown;
}

export interface Adv {
  id: string;
  /** Asset the ad trades, e.g. "USDT". */
  coin: string;
  /** Fiat currency, e.g. "NGN". */
  fiat: string;
  /** Fiat units per 1 unit of coin. */
  price: number;
  /** "buy" = the desk buys crypto; "sell" = the desk sells crypto. */
  side: "buy" | "sell" | "unknown";
  online: boolean;
}

function normaliseAdv(raw: RawAdv): Adv | null {
  const price = Number(raw.price);
  if (!Number.isFinite(price) || price <= 0) return null;

  const rawSide = String(raw.side ?? raw.type ?? "").toLowerCase();
  const side: Adv["side"] =
    rawSide.includes("buy") ? "buy" : rawSide.includes("sell") ? "sell" : "unknown";

  const status = String(raw.status ?? raw.advStatus ?? "").toLowerCase();
  // Treat unknown status as live: a stale "offline" guess would silently drop
  // the only ad we have and fall back to a worse rate source.
  const online = status === "" || status.includes("online") || status.includes("1");

  return {
    id: String(raw.advNo ?? ""),
    coin: String(raw.coin ?? "").toUpperCase(),
    fiat: String(raw.fiat ?? raw.fiatCode ?? "").toUpperCase(),
    price,
    side,
    online,
  };
}

/** Fetch the desk's own advertisements. */
export async function fetchOwnAdvs(limit = 100): Promise<Adv[]> {
  const data = await signedGet<RawAdv[] | { advList?: RawAdv[]; list?: RawAdv[] }>(
    "/api/v2/p2p/advList",
    { limit }
  );

  const rows: RawAdv[] = Array.isArray(data)
    ? data
    : data?.advList ?? data?.list ?? [];

  return rows.map(normaliseAdv).filter((a): a is Adv => a !== null);
}
