/**
 * Supported (token, chain) pairs.
 *
 * Token symbol alone is never sufficient — USDT exists on Tron, Ethereum, BSC,
 * Solana and TON at different addresses, with different fees and different
 * recovery characteristics. Every order, deposit address and quote is keyed on
 * the pair.
 *
 * Listing an asset here does NOT make it tradable: a deposit address must also
 * be configured for the pair, and for self-custody deposits a chain adapter has
 * to exist in the monitor. See task.md §10 for the build order.
 */

export const CHAINS = [
  "bitcoin",
  "litecoin",
  "ethereum",
  "bsc",
  "tron",
  "solana",
  "ton",
] as const;

export type Chain = (typeof CHAINS)[number];

export interface AssetSpec {
  token: string;
  chain: Chain;
  /** Human label for the network, as shown to the client. */
  network: string;
  /** Decimal places in the asset's smallest unit. */
  decimals: number;
  /** Chains where omitting a memo/tag can lose the deposit. */
  requiresMemo?: boolean;
  /** True where a self-custody chain adapter exists in the monitor today. */
  monitored?: boolean;
}

export const ASSETS: AssetSpec[] = [
  // ── Already monitored on-chain ──
  { token: "BTC",   chain: "bitcoin",  network: "Bitcoin",           decimals: 8,  monitored: true },

  // ── Pending adapters — deposits must route through Bitget until built ──
  { token: "LTC",   chain: "litecoin", network: "Litecoin",          decimals: 8 },

  { token: "ETH",   chain: "ethereum", network: "Ethereum (ERC20)",  decimals: 18 },
  { token: "USDT",  chain: "ethereum", network: "Ethereum (ERC20)",  decimals: 6 },
  { token: "USDC",  chain: "ethereum", network: "Ethereum (ERC20)",  decimals: 6 },

  { token: "BNB",   chain: "bsc",      network: "BNB Smart Chain",   decimals: 18 },
  { token: "USDT",  chain: "bsc",      network: "BNB Smart Chain (BEP20)", decimals: 18 },

  { token: "TRX",   chain: "tron",     network: "Tron",              decimals: 6 },
  { token: "USDT",  chain: "tron",     network: "Tron (TRC20)",      decimals: 6 },

  { token: "SOL",   chain: "solana",   network: "Solana",            decimals: 9 },
  { token: "USDT",  chain: "solana",   network: "Solana (SPL)",      decimals: 6 },
  { token: "USDC",  chain: "solana",   network: "Solana (SPL)",      decimals: 6 },

  { token: "USDT",  chain: "ton",      network: "TON (Jetton)",      decimals: 6, requiresMemo: true },
];

export function findAsset(token: string, chain: string): AssetSpec | undefined {
  return ASSETS.find((a) => a.token === token && a.chain === chain);
}

export function isSupportedAsset(token: string, chain: string): boolean {
  return findAsset(token, chain) !== undefined;
}

/** Chains the monitor can watch directly. Everything else needs Bitget. */
export function isMonitored(token: string, chain: string): boolean {
  return findAsset(token, chain)?.monitored === true;
}
