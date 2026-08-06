/**
 * Bank directory and account-name resolution.
 *
 * Carved out of the old Flutterwave router when the payout rail was removed.
 * Both endpoints are read-only lookups against Flutterwave's API — no money
 * moves through here, and there is deliberately no transfer or webhook code.
 *
 * `/verify-account` matters more than it looks: it resolves an account number to
 * the name the bank holds for it, which is the same check that gates every
 * release. Using it at registration means the sender name a fiat credit must
 * match is bank-confirmed rather than self-declared.
 */

import { Router, Request, Response } from "express";

const router = Router();

const FLW_BASE = "https://api.flutterwave.com/v3";
const ALLOWED_COUNTRIES = new Set(["NG", "GH", "KE"]);
const BANK_CACHE_TTL_MS = 60 * 60 * 1_000;

interface FlwBank {
  id: number;
  code: string;
  name: string;
}

interface CachedBanks {
  data: FlwBank[];
  expiresAt: number;
}

const bankCache: Record<string, CachedBanks> = {};

function getSecretKey(): string {
  const key = process.env.FLW_SECRET_KEY;
  if (!key) throw new Error("FLW_SECRET_KEY is not set in environment.");
  return key;
}

async function flwFetch(path: string, options: RequestInit = {}) {
  return globalThis.fetch(`${FLW_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getSecretKey()}`,
      ...(options.headers ?? {}),
    },
  });
}

// ─── GET /api/banks?country=NG ────────────────────────────────────────────────

router.get("/", async (req: Request, res: Response) => {
  const raw = ((req.query.country as string) || "NG").toUpperCase();
  const country = ALLOWED_COUNTRIES.has(raw) ? raw : "NG";

  const cached = bankCache[country];
  if (cached && Date.now() < cached.expiresAt) {
    return res.json({ banks: cached.data, cached: true });
  }

  try {
    const response = await flwFetch(`/banks/${country}`);
    if (!response.ok) {
      console.error("[BANKS] list error:", response.status);
      return res.status(response.status).json({ error: "Failed to fetch bank list." });
    }

    const json = (await response.json()) as { status: string; data: FlwBank[] };
    if (json.status !== "success") {
      return res.status(502).json({ error: "Unexpected response from the bank directory." });
    }

    const banks = json.data.sort((a, b) => a.name.localeCompare(b.name));
    bankCache[country] = { data: banks, expiresAt: Date.now() + BANK_CACHE_TTL_MS };

    return res.json({ banks, cached: false });
  } catch (err) {
    console.error("[BANKS] list threw:", err);
    return res.status(500).json({ error: "Could not load the bank list." });
  }
});

// ─── POST /api/banks/verify-account ───────────────────────────────────────────

router.post("/verify-account", async (req: Request, res: Response) => {
  const { account_number, account_bank } = req.body as {
    account_number?: string;
    account_bank?: string;
  };

  if (!account_number || !account_bank) {
    return res.status(400).json({ error: "account_number and account_bank are required." });
  }
  if (!/^\d{6,10}$/.test(account_number)) {
    return res.status(400).json({ error: "Invalid account number format." });
  }

  try {
    const response = await flwFetch("/accounts/resolve", {
      method: "POST",
      body: JSON.stringify({ account_number, account_bank }),
    });

    const json = (await response.json().catch(() => ({}))) as {
      status?: string;
      message?: string;
      data?: { account_name: string; account_number: string };
    };

    if (!response.ok || json.status !== "success" || !json.data) {
      const rawMsg = json.message ?? "";
      // Flutterwave surfaces internal field names for banks it can't resolve.
      // Those are not actionable for a client, and resolution failing is not a
      // reason to block the order — the operator still name-matches at release.
      const isTechnical =
        /destbankcode|account_bank|must be numeric|not allowed/i.test(rawMsg);
      const friendly = isTechnical
        ? "Account verification is not supported for this bank. You can still proceed."
        : rawMsg || "Could not verify account. Check the details and try again.";
      return res.status(response.ok ? 422 : response.status).json({ error: friendly });
    }

    return res.json({
      account_name: json.data.account_name,
      account_number: json.data.account_number,
    });
  } catch (err) {
    console.error("[BANKS] verify-account threw:", err);
    return res.status(500).json({ error: "Internal server error during account verification." });
  }
});

export default router;
