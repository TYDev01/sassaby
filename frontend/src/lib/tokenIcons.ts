/**
 * Artwork for the asset registry.
 *
 * Icons are vendored under public/tokens rather than hot-linked: an off-ramp
 * that loads its asset artwork from someone else's CDN shows a broken deposit
 * screen the day that CDN moves. The set is from spothq/cryptocurrency-icons
 * (CC0); ton.svg is drawn to match, since that set has no TON mark.
 *
 * Keyed on symbol for the token and on chain id for the network badge — a
 * (token, chain) row needs both, because USDT on Tron and USDT on Ethereum are
 * the same symbol and very much not the same asset.
 */

export const TOKEN_ICON: Record<string, string> = {
  BTC:  "/tokens/btc.svg",
  LTC:  "/tokens/ltc.svg",
  ETH:  "/tokens/eth.svg",
  BNB:  "/tokens/bnb.svg",
  TRX:  "/tokens/trx.svg",
  SOL:  "/tokens/sol.svg",
  USDT: "/tokens/usdt.svg",
  USDC: "/tokens/usdc.svg",
};

export const CHAIN_ICON: Record<string, string> = {
  bitcoin:  "/tokens/btc.svg",
  litecoin: "/tokens/ltc.svg",
  ethereum: "/tokens/eth.svg",
  bsc:      "/tokens/bnb.svg",
  tron:     "/tokens/trx.svg",
  solana:   "/tokens/sol.svg",
  ton:      "/tokens/ton.svg",
};

/**
 * Network names for a chain id.
 *
 * Deliberately not taken from AssetSpec.network: that string is per-asset and
 * carries the token standard ("BNB Smart Chain (BEP20)" for USDT, plain "BNB
 * Smart Chain" for BNB itself), which is right on a token row and wrong on the
 * group header above it.
 */
export const CHAIN_LABEL: Record<string, string> = {
  bitcoin:  "Bitcoin",
  litecoin: "Litecoin",
  ethereum: "Ethereum",
  bsc:      "BNB Smart Chain",
  tron:     "Tron",
  solana:   "Solana",
  ton:      "TON",
};

/** Full names, so a picker row reads as more than a ticker. */
export const TOKEN_NAME: Record<string, string> = {
  BTC:  "Bitcoin",
  LTC:  "Litecoin",
  ETH:  "Ethereum",
  BNB:  "BNB",
  TRX:  "TRON",
  SOL:  "Solana",
  USDT: "Tether",
  USDC: "USD Coin",
};
