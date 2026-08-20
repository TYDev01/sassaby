/**
 * Transactional email via Resend.
 *
 * Same two properties as the Telegram operator alerts in `notify.ts`, for the
 * same reasons:
 *
 *  - **Fails soft.** A welcome email that doesn't send must never fail a
 *    registration — the account exists either way, and a user who signed up
 *    successfully should not see a 500 because a third-party mail API was
 *    briefly down. Errors are logged and swallowed.
 *  - **Both parts sent.** Every message carries a plain-text alternative
 *    alongside the HTML. Text-only clients and spam scoring both want it.
 *
 * Unlike the operator alerts, user mail is *not* load-bearing: nothing in the
 * order lifecycle depends on it, so it is dispatched without being awaited.
 *
 * Configure with RESEND_API_KEY and MAIL_FROM. Unconfigured, this logs and
 * no-ops so local development runs without an API key.
 */

import axios from "axios";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function config(): { apiKey: string; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Send one message. Never throws. */
export async function sendMail(mail: Mail): Promise<void> {
  const cfg = config();
  if (!cfg) {
    console.warn(`[MAIL] Resend not configured — would have sent "${mail.subject}" to ${mail.to}`);
    return;
  }

  try {
    await axios.post(
      RESEND_ENDPOINT,
      {
        from:    cfg.from,
        to:      [mail.to],
        subject: mail.subject,
        html:    mail.html,
        text:    mail.text,
      },
      {
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
        timeout: 10_000,
      }
    );
    console.log(`[MAIL] Sent "${mail.subject}" to ${mail.to}`);
  } catch (err) {
    // Swallowed on purpose — see the header note.
    const detail =
      (axios.isAxiosError(err) && (err.response?.data as { message?: string })?.message) ||
      (err as Error).message;
    console.error(`[MAIL] Send failed for ${mail.to}:`, detail);
  }
}
