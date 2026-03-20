import { Router, Request, Response as ExpressResponse } from "express";
import { v4 as uuidv4 } from "uuid";
import { adminAuth } from "../middleware/adminAuth";
import { updateTransferStatus } from "../store";

const router = Router();

const FLW_BASE = "https://api.flutterwave.com/v3";

/** Safely read the secret key — fails fast if not configured */
function getSecretKey(): string {
  const key = process.env.FLW_SECRET_KEY;
  if (!key) throw new Error("FLW_SECRET_KEY is not set in environment.");
  return key;
}

/** v3 fetch helper (uses secret key) */
async function flwFetch(path: string, options: RequestInit = {}) {
  const key = getSecretKey();
  return globalThis.fetch(`${FLW_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      ...(options.headers ?? {}),
    },
  });
}

// ─── In-memory bank list cache (1-hour TTL) ───────────────────────────────────

interface CachedBanks {
  data: FlwBank[];
  expiresAt: number;
}

interface FlwBank {
  id: number;
  code: string;
  name: string;
}

const bankCache: Record<string, CachedBanks> = {};
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ─── GET /api/flutterwave/banks?country=NG ────────────────────────────────────

const ALLOWED_COUNTRIES = new Set(["NG", "GH", "KE"]);

router.get("/banks", async (req: Request, res: ExpressResponse) => {
  const rawCountry = ((req.query.country as string) || "NG").toUpperCase();
  const country = ALLOWED_COUNTRIES.has(rawCountry) ? rawCountry : "NG";

  // Serve from cache if still fresh
  const cached = bankCache[country];
  if (cached && Date.now() < cached.expiresAt) {
    return res.json({ banks: cached.data, cached: true });
  }

  try {
    const response = await flwFetch(`/banks/${country}`);

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as Record<string, unknown>;
      console.error("[FLW] banks error:", err);
      return res
        .status(response.status)
        .json({ error: "Failed to fetch bank list from Flutterwave." });
    }

    const json = (await response.json()) as { status: string; data: FlwBank[] };

    if (json.status !== "success") {
      return res.status(502).json({ error: "Unexpected response from Flutterwave." });
    }

    // Store in cache
    bankCache[country] = { data: json.data, expiresAt: Date.now() + CACHE_TTL_MS };

    return res.json({ banks: json.data, cached: false });
  } catch (err) {
    console.error("[FLW] banks fetch threw:", err);
    return res.status(500).json({ error: "Internal server error while fetching banks." });
  }
});

// ─── POST /api/flutterwave/verify-account ────────────────────────────────────

router.post("/verify-account", async (req: Request, res: ExpressResponse) => {
  const { account_number, account_bank } = req.body as {
    account_number?: string;
    account_bank?: string;
  };

  if (!account_number || !account_bank) {
    return res
      .status(400)
      .json({ error: "account_number and account_bank are required." });
  }

  // Basic format guard — digits only, 6-10 chars
  if (!/^\d{6,10}$/.test(account_number)) {
    return res.status(400).json({ error: "Invalid account number format." });
  }

  try {
    const response = await flwFetch("/accounts/resolve", {
      method: "POST",
      body: JSON.stringify({ account_number, account_bank }),
    });

    const rawJson = await response.json().catch(() => ({}));
    const json = rawJson as {
      status: string;
      message?: string;
      data?: { account_name: string; account_number: string };
    };

    const isOk = response.ok;
    if (!isOk || json.status !== "success") {
      const rawMsg = json.message ?? "";
      // Flutterwave returns technical error strings for unsupported banks — replace with a clean message
      const isTechnicalError =
        rawMsg.toLowerCase().includes("destbankcode") ||
        rawMsg.toLowerCase().includes("account_bank") ||
        rawMsg.toLowerCase().includes("must be numeric") ||
        rawMsg.toLowerCase().includes("not allowed");
      const friendlyError = isTechnicalError
        ? "Account verification is not supported for this bank. You can still proceed."
        : rawMsg || "Could not verify account. Check the details and try again.";
      return res.status(!isOk ? response.status : 422).json({ error: friendlyError });
    }

    return res.json({
      account_name: json.data!.account_name,
      account_number: json.data!.account_number,
    });
  } catch (err) {
    console.error("[FLW] verify-account threw:", err);
    return res.status(500).json({ error: "Internal server error during account verification." });
  }
});

// ─── POST /api/flutterwave/transfer — initiate a real bank transfer ──────────
//
// Body: { account_number, account_bank, amount, currency, narration? }
// Returns: { transfer_id, reference, status }

export interface FlwTransferResult {
  transfer_id: string;
  reference: string;
  status: string;
}

/** Core transfer logic — callable from both the route and chainMonitor */
export async function callFlwTransfer(params: {
  account_number: string;
  account_bank: string;
  amount: number;
  currency: string;
  narration?: string;
  /**
   * Stable transfer ID — when provided the Flutterwave reference is derived
   * as `sassaby-<transferId>` so the request is idempotent on retry.
   */
  transferId?: string;
}): Promise<FlwTransferResult> {
  const { account_number, account_bank, amount, currency, narration, transferId } = params;
  // Derive a stable reference when a transferId is available to prevent
  // duplicate bank payouts if this function is retried after a network error.
  const reference = transferId ? `sassaby-${transferId}` : uuidv4();

  const res = await flwFetch("/transfers", {
    method: "POST",
    body: JSON.stringify({
      account_bank,
      account_number,
      amount,
      narration: narration ?? "Sassaby crypto-to-fiat transfer",
      currency,
      reference,
      debit_currency: currency,
    }),
  });

  const json = await res.json().catch(() => ({})) as {
    status?: string;
    message?: string;
    data?: { id: string | number; status: string };
  };

  if (!res.ok || json.status !== "success") {
    console.error("[FLW] initiate transfer failed:", json);
    throw new Error(json.message ?? "Failed to initiate transfer.");
  }

  return {
    transfer_id: String(json.data?.id ?? ""),
    reference,
    status: json.data?.status ?? "NEW",
  };
}

router.post("/transfer", adminAuth, async (req: Request, res: ExpressResponse) => {
  const { account_number, account_bank, amount, currency, narration } = req.body as {
    account_number?: string;
    account_bank?: string;
    amount?: number;
    currency?: string;
    narration?: string;
  };

  if (!account_number || !account_bank || !amount || !currency) {
    return res.status(400).json({ error: "account_number, account_bank, amount and currency are required." });
  }

  try {
    // No transferId here — manual admin transfer, so reference is a fresh uuid.
    const result = await callFlwTransfer({ account_number, account_bank, amount, currency, narration });
    return res.status(201).json(result);
  } catch (err) {
    console.error("[FLW] transfer route threw:", err);
    return res.status(500).json({ error: "Failed to initiate transfer. Please try again." });
  }
});

// ─── POST /api/flutterwave/webhook — receive Flutterwave transfer events ─────────
//
// Flutterwave sends a `verif-hash` header that must equal FLW_WEBHOOK_SECRET.
// On a confirmed/failed transfer with reference "sassaby-<uuid>", update the
// corresponding transfer record in the DB.
router.post("/webhook", async (req: Request, res: ExpressResponse) => {
  const webhookSecret = process.env.FLW_WEBHOOK_SECRET;

  // If no secret is configured Flutterwave webhooks aren’t expected — ignore.
  if (!webhookSecret) {
    return res.status(200).json({ received: true });
  }

  const signature = req.headers["verif-hash"] as string | undefined;
  if (!signature || signature !== webhookSecret) {
    console.warn("[FLW WEBHOOK] Invalid or missing verif-hash header");
    return res.status(401).json({ error: "Unauthorized." });
  }

  const { event, data } = req.body as {
    event?: string;
    data?: { reference?: string; status?: string };
  };

  // Only care about transfer settlement events.
  if (typeof event !== "string" || !event.startsWith("transfer.")) {
    return res.status(200).json({ received: true });
  }

  const reference = data?.reference ?? "";
  if (!reference.startsWith("sassaby-")) {
    return res.status(200).json({ received: true });
  }

  // Reconstruct the internal transfer ID from the stable reference.
  const transferId = reference.slice("sassaby-".length);
  if (!transferId) return res.status(200).json({ received: true });

  const flwStatus = (data?.status ?? "").toUpperCase();
  let newStatus: "completed" | "failed" | null = null;
  if (flwStatus === "SUCCESSFUL") newStatus = "completed";
  else if (flwStatus === "FAILED")   newStatus = "failed";

  if (newStatus) {
    const updated = await updateTransferStatus(
      transferId,
      newStatus,
      newStatus === "completed" ? new Date().toISOString() : undefined
    );
    console.log(
      updated
        ? `[FLW WEBHOOK] Transfer ${transferId} → ${newStatus}`
        : `[FLW WEBHOOK] Transfer ${transferId} not found for webhook update`
    );
  }

  return res.status(200).json({ received: true });
});

export default router;
