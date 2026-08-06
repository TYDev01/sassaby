/**
 * Operator notifications via Telegram.
 *
 * Manual settlement means the operator IS the settlement engine, so these
 * alerts are load-bearing: an order that doesn't reach a phone doesn't settle.
 *
 * Two deliberate properties:
 *
 *  - **Fails soft.** A notification failure must never roll back or block an
 *    order transition. The money movement is the source of truth; the message
 *    is a convenience. Errors are logged and swallowed.
 *  - **Plain text, no parse_mode.** Telegram rejects the whole message on a
 *    MarkdownV2 escaping mistake, and a silently-dropped alert is the worst
 *    possible failure here. Formatting is not worth that risk.
 *
 * Configure with TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID. Unconfigured, this
 * logs and no-ops so local development runs without a bot.
 */

import axios from "axios";
import type { Order } from "../store";

const ADMIN_URL = (process.env.ADMIN_URL ?? "").replace(/\/$/, "");

function config(): { token: string; chatId: string } | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return null;
  return { token, chatId };
}

/** Send a raw message. Never throws. */
export async function notifyOperator(text: string): Promise<void> {
  const cfg = config();
  if (!cfg) {
    console.warn("[NOTIFY] Telegram not configured — would have sent:\n" + text);
    return;
  }

  try {
    await axios.post(
      `https://api.telegram.org/bot${cfg.token}/sendMessage`,
      {
        chat_id: cfg.chatId,
        text,
        disable_web_page_preview: true,
      },
      { timeout: 10_000 }
    );
  } catch (err) {
    // Swallowed on purpose — see the header note.
    console.error("[NOTIFY] Telegram send failed:", (err as Error).message);
  }
}

function orderLink(id: string): string {
  return ADMIN_URL ? `\n${ADMIN_URL}/admin/orders/${id}` : "";
}

function money(n: number, currency: string): string {
  return `${n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

// ─── Sell leg — the client sold crypto, the desk owes fiat ───────────────────

export async function notifyDepositConfirmed(order: Order, txId: string): Promise<void> {
  await notifyOperator(
    [
      "DEPOSIT CONFIRMED — payout owed",
      "",
      `${order.sendAmount} ${order.sendToken} on ${order.chain}`,
      `Pay out: ${money(order.receiveAmount, order.receiveCurrency)}`,
      `To: ${order.bank} / ${order.accountNumber}`,
      `Tx: ${txId}`,
      `Order: ${order.id}`,
    ].join("\n") + orderLink(order.id)
  );
}

// ─── Buy leg — the client claims to have paid, verify before releasing ───────

export async function notifyPaymentClaimed(
  order: Order,
  declaredSenderName: string
): Promise<void> {
  await notifyOperator(
    [
      "PAYMENT CLAIMED — verify before releasing",
      "",
      `Expect: ${money(order.receiveAmount, order.receiveCurrency)}`,
      `Sender name must be: ${declaredSenderName || "(not provided)"}`,
      "",
      `Release: ${order.sendAmount} ${order.sendToken} on ${order.chain}`,
      `To wallet: ${order.destinationAddress}`,
      `Order: ${order.id}`,
      "",
      "Check the credit in your banking app. Do not release on a screenshot,",
      "and do not release if the sender name does not match.",
    ].join("\n") + orderLink(order.id)
  );
}
