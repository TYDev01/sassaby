"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callFlwTransfer = callFlwTransfer;
const express_1 = require("express");
const uuid_1 = require("uuid");
const adminAuth_1 = require("../middleware/adminAuth");
const router = (0, express_1.Router)();
const FLW_BASE = "https://api.flutterwave.com/v3";
const FLW_V4_BASE = "https://api.flutterwave.com";
const FLW_IDP = "https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token";
/** Safely read the secret key — fails fast if not configured */
function getSecretKey() {
    const key = process.env.FLW_SECRET_KEY;
    if (!key)
        throw new Error("FLW_SECRET_KEY is not set in environment.");
    return key;
}
function getClientCredentials() {
    const clientId = process.env.FLW_CLIENT_ID;
    const clientSecret = process.env.FLW_CLIENT_SECRET;
    if (!clientId || !clientSecret)
        throw new Error("FLW_CLIENT_ID or FLW_CLIENT_SECRET is not set.");
    return { clientId, clientSecret };
}
// ─── OAuth2 access token cache (10-min TTL) ───────────────────────────────────
let cachedToken = null;
let tokenExpiresAt = 0;
async function getAccessToken() {
    if (cachedToken && Date.now() < tokenExpiresAt)
        return cachedToken;
    const { clientId, clientSecret } = getClientCredentials();
    const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
    });
    const res = await globalThis.fetch(FLW_IDP, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Failed to get Flutterwave access token: ${JSON.stringify(err)}`);
    }
    const json = await res.json();
    cachedToken = json.access_token;
    // Refresh 30s before expiry
    tokenExpiresAt = Date.now() + (json.expires_in - 30) * 1000;
    return cachedToken;
}
/** v3 fetch helper (uses secret key — for banks list + account resolve) */
async function flwFetch(path, options = {}) {
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
/** v4 fetch helper (uses OAuth access token — for transfers) */
async function flwV4Fetch(path, options = {}, extraHeaders = {}) {
    const token = await getAccessToken();
    return globalThis.fetch(`${FLW_V4_BASE}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...extraHeaders,
            ...(options.headers ?? {}),
        },
    });
}
const bankCache = {};
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
// ─── GET /api/flutterwave/banks?country=NG ────────────────────────────────────
const ALLOWED_COUNTRIES = new Set(["NG", "GH", "KE"]);
router.get("/banks", async (req, res) => {
    const rawCountry = (req.query.country || "NG").toUpperCase();
    const country = ALLOWED_COUNTRIES.has(rawCountry) ? rawCountry : "NG";
    // Serve from cache if still fresh
    const cached = bankCache[country];
    if (cached && Date.now() < cached.expiresAt) {
        return res.json({ banks: cached.data, cached: true });
    }
    try {
        const response = await flwFetch(`/banks/${country}`);
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            console.error("[FLW] banks error:", err);
            return res
                .status(response.status)
                .json({ error: "Failed to fetch bank list from Flutterwave." });
        }
        const json = (await response.json());
        if (json.status !== "success") {
            return res.status(502).json({ error: "Unexpected response from Flutterwave." });
        }
        // Store in cache
        bankCache[country] = { data: json.data, expiresAt: Date.now() + CACHE_TTL_MS };
        return res.json({ banks: json.data, cached: false });
    }
    catch (err) {
        console.error("[FLW] banks fetch threw:", err);
        return res.status(500).json({ error: "Internal server error while fetching banks." });
    }
});
// ─── POST /api/flutterwave/verify-account ────────────────────────────────────
router.post("/verify-account", async (req, res) => {
    const { account_number, account_bank } = req.body;
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
        const json = rawJson;
        const isOk = response.ok;
        if (!isOk || json.status !== "success") {
            const rawMsg = json.message ?? "";
            // Flutterwave returns technical error strings for unsupported banks — replace with a clean message
            const isTechnicalError = rawMsg.toLowerCase().includes("destbankcode") ||
                rawMsg.toLowerCase().includes("account_bank") ||
                rawMsg.toLowerCase().includes("must be numeric") ||
                rawMsg.toLowerCase().includes("not allowed");
            const friendlyError = isTechnicalError
                ? "Account verification is not supported for this bank. You can still proceed."
                : rawMsg || "Could not verify account. Check the details and try again.";
            return res.status(!isOk ? response.status : 422).json({ error: friendlyError });
        }
        return res.json({
            account_name: json.data.account_name,
            account_number: json.data.account_number,
        });
    }
    catch (err) {
        console.error("[FLW] verify-account threw:", err);
        return res.status(500).json({ error: "Internal server error during account verification." });
    }
});
/** Core transfer logic — callable from both the route and transfers.ts */
async function callFlwTransfer(params) {
    const { account_number, account_bank, amount, currency, narration } = params;
    const reference = (0, uuid_1.v4)();
    const traceId = (0, uuid_1.v4)();
    // Step 1: Create recipient
    const recipientRes = await flwV4Fetch("/transfers/recipients", {
        method: "POST",
        body: JSON.stringify({
            type: "bank_ngn",
            bank: { account_number, code: account_bank },
        }),
    }, {
        "X-Trace-Id": traceId,
        "X-Idempotency-Key": `rcpt-${reference}`,
    });
    if (!recipientRes.ok) {
        const err = await recipientRes.json().catch(() => ({}));
        console.error("[FLW] create recipient failed:", err);
        throw new Error("Failed to create transfer recipient.");
    }
    const recipientJson = await recipientRes.json();
    const recipientId = recipientJson.data?.id;
    if (!recipientId)
        throw new Error("No recipient ID returned from Flutterwave.");
    // Step 2: Initiate transfer
    const transferRes = await flwV4Fetch("/transfers", {
        method: "POST",
        body: JSON.stringify({
            action: "instant",
            reference,
            narration: narration ?? "Sassaby crypto-to-fiat transfer",
            payment_instruction: {
                source_currency: currency,
                destination_currency: currency,
                amount: { applies_to: "destination_currency", value: amount },
                recipient_id: recipientId,
            },
        }),
    }, {
        "X-Trace-Id": traceId,
        "X-Idempotency-Key": `trf-${reference}`,
    });
    const transferJson = await transferRes.json().catch(() => ({}));
    if (!transferRes.ok) {
        console.error("[FLW] initiate transfer failed:", transferJson);
        throw new Error(transferJson.message ?? "Failed to initiate transfer.");
    }
    return {
        transfer_id: transferJson.data?.id ?? "",
        reference,
        status: transferJson.data?.status ?? "pending",
    };
}
router.post("/transfer", adminAuth_1.adminAuth, async (req, res) => {
    const { account_number, account_bank, amount, currency, narration } = req.body;
    if (!account_number || !account_bank || !amount || !currency) {
        return res.status(400).json({ error: "account_number, account_bank, amount and currency are required." });
    }
    try {
        const result = await callFlwTransfer({ account_number, account_bank, amount, currency, narration });
        return res.status(201).json(result);
    }
    catch (err) {
        console.error("[FLW] transfer route threw:", err);
        return res.status(500).json({ error: "Failed to initiate transfer. Please try again." });
    }
});
exports.default = router;
