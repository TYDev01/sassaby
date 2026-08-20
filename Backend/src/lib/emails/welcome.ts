/**
 * Welcome email, sent once when an account is created.
 *
 * The one piece of real information here is the sender-name rule: the desk
 * matches incoming fiat credits against `bankAccountName` before releasing
 * crypto, so a user who pays from an account in someone else's name has their
 * order held. Telling them at signup is much cheaper than telling them at
 * settlement.
 *
 * Table layout and inline styles throughout — Outlook still does not do flex,
 * grid, or `<style>` blocks reliably.
 */

import { sendMail } from "../mailer";

const SITE_URL = (process.env.FRONTEND_URL ?? "").replace(/\/$/, "");

const ACCENT = "#f97316";
const INK = "#111111";
const MUTED = "#6b7280";

interface Recipient {
  email: string;
  fullName: string;
}

/** First name if we have one, otherwise a greeting that reads fine without it. */
function greeting(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0];
  return first ? `Hi ${first},` : "Hi there,";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function html(name: string): string {
  const cta = SITE_URL
    ? `<tr><td style="padding:8px 0 32px;">
         <a href="${SITE_URL}/"
            style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;
                   font-weight:600;font-size:15px;padding:13px 28px;border-radius:8px;">
           Start your first swap
         </a>
       </td></tr>`
    : "";

  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f4f4f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;
                      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
          <tr>
            <td style="background:#0a0a0a;padding:24px 32px;">
              <span style="color:#ffffff;font-size:19px;font-weight:700;letter-spacing:-0.3px;">Sassaby</span>
              <span style="color:${ACCENT};font-size:19px;font-weight:700;">.</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;color:${INK};font-size:15px;line-height:1.6;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding-bottom:16px;font-size:21px;font-weight:700;letter-spacing:-0.3px;">
                  Welcome to Sassaby
                </td></tr>
                <tr><td style="padding-bottom:16px;">${escapeHtml(name)}</td></tr>
                <tr><td style="padding-bottom:16px;">
                  Your account is ready. You can now swap crypto for naira, and naira for crypto,
                  at the desk rate — no order book, no counterparty to chase.
                </td></tr>
                <tr><td style="padding-bottom:24px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                         style="background:#fff7ed;border-left:3px solid ${ACCENT};border-radius:6px;">
                    <tr><td style="padding:16px 18px;font-size:14px;line-height:1.55;">
                      <strong style="display:block;margin-bottom:6px;">One thing worth knowing now</strong>
                      When you buy crypto, pay from a bank account in your own name — the one on your
                      profile. We match the sender name on every incoming transfer before releasing
                      funds, so a payment from someone else's account gets held rather than settled.
                    </td></tr>
                  </table>
                </td></tr>
                ${cta}
                <tr><td style="padding-top:8px;border-top:1px solid #e5e7eb;color:${MUTED};font-size:13px;line-height:1.55;">
                  You're receiving this because an account was created with this email address.
                  If that wasn't you, reply to this message and we'll close it.
                </td></tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function text(name: string): string {
  return [
    "Welcome to Sassaby",
    "",
    name,
    "",
    "Your account is ready. You can now swap crypto for naira, and naira for",
    "crypto, at the desk rate — no order book, no counterparty to chase.",
    "",
    "ONE THING WORTH KNOWING NOW",
    "When you buy crypto, pay from a bank account in your own name — the one on",
    "your profile. We match the sender name on every incoming transfer before",
    "releasing funds, so a payment from someone else's account gets held rather",
    "than settled.",
    "",
    ...(SITE_URL ? [`Start your first swap: ${SITE_URL}/`, ""] : []),
    "You're receiving this because an account was created with this email",
    "address. If that wasn't you, reply to this message and we'll close it.",
  ].join("\n");
}

/** Dispatch the welcome email. Never throws. */
export async function sendWelcomeEmail(user: Recipient): Promise<void> {
  const name = greeting(user.fullName);
  await sendMail({
    to:      user.email,
    subject: "Welcome to Sassaby",
    html:    html(name),
    text:    text(name),
  });
}
