import { OrderStatus, OrderDirection } from "./api";

/**
 * Presentation for the order state machine.
 *
 * Kept in one place because the admin queue, the history table and the order
 * tracker all render the same states — and a status that reads differently in
 * two places is how a client and an operator end up describing the same order
 * to each other and disagreeing.
 */

export const STATUS_LABEL: Record<OrderStatus, string> = {
  // sell leg
  awaiting_deposit:       "Awaiting deposit",
  deposit_confirmed:      "Deposit confirmed",
  awaiting_manual_payout: "Payout in progress",
  settled:                "Settled",
  // buy leg
  awaiting_payment:       "Awaiting payment",
  payment_claimed:        "Payment claimed",
  verifying:              "Verifying payment",
  released:               "Released",
  // terminal
  rejected:               "Rejected",
  expired:                "Expired",
  failed:                 "Failed",
};

export const STATUS_STYLE: Record<OrderStatus, string> = {
  awaiting_deposit:       "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  deposit_confirmed:      "text-blue-400 bg-blue-400/10 border-blue-400/20",
  awaiting_manual_payout: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  settled:                "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  awaiting_payment:       "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  payment_claimed:        "text-amber-400 bg-amber-400/10 border-amber-400/20",
  verifying:              "text-blue-400 bg-blue-400/10 border-blue-400/20",
  released:               "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  rejected:               "text-red-400 bg-red-400/10 border-red-400/20",
  expired:                "text-gray-400 bg-gray-400/10 border-gray-400/20",
  failed:                 "text-red-400 bg-red-400/10 border-red-400/20",
};

/** What the client should do next, if anything. Empty when it's on the desk. */
export function clientHint(status: OrderStatus, direction: OrderDirection): string {
  switch (status) {
    case "awaiting_deposit":
      return "Send the exact amount to the deposit address shown.";
    case "awaiting_payment":
      return "Transfer the exact amount to the bank details shown, then confirm below.";
    case "payment_claimed":
      return "We're checking for your payment. This usually takes a few minutes.";
    case "verifying":
      return "Your payment is being verified.";
    case "deposit_confirmed":
      return "Deposit received. Your payout is being arranged.";
    case "awaiting_manual_payout":
      return "Your payout has been sent to your bank.";
    case "settled":
      return direction === "sell" ? "Payout complete." : "Complete.";
    case "released":
      return "Crypto released to your wallet.";
    case "rejected":
      return "This order was rejected. See the reason below.";
    case "expired":
      return "This order expired. You can place a new one.";
    case "failed":
      return "This order failed. Contact support if funds were sent.";
    default:
      return "";
  }
}

/** Explorer link for a confirmed on-chain transaction, per network. */
export function explorerTxUrl(chain: string, txId: string): string | null {
  if (!txId) return null;
  switch (chain) {
    case "stacks":   return `https://explorer.hiro.so/txid/${txId}?chain=mainnet`;
    case "bitcoin":  return `https://blockstream.info/tx/${txId}`;
    case "litecoin": return `https://blockchair.com/litecoin/transaction/${txId}`;
    case "ethereum": return `https://etherscan.io/tx/${txId}`;
    case "bsc":      return `https://bscscan.com/tx/${txId}`;
    case "tron":     return `https://tronscan.org/#/transaction/${txId}`;
    case "solana":   return `https://solscan.io/tx/${txId}`;
    case "ton":      return `https://tonviewer.com/transaction/${txId}`;
    default:         return null;
  }
}
