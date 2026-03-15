"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTokenPriceUSD = getTokenPriceUSD;
exports.getFlwRate = getFlwRate;
const express_1 = require("express");
const axios_1 = __importDefault(require("axios"));
const prisma_1 = require("../lib/prisma");
const adminAuth_1 = require("../middleware/adminAuth");
const router = (0, express_1.Router)();
const FLW_V3_BASE = "https://api.flutterwave.com/v3";
// ─── CoinGecko ID map (no API key required) ───────────────────────────────────
const COINGECKO_IDS = {
    STX: "blockstack",
    BTC: "bitcoin",
    USDCx: "usd-coin", // Bridged USDC on Stacks — tracks USDC 1:1
};
const priceCache = {};
async function getTokenPriceUSD(token) {
    const geckoId = COINGECKO_IDS[token];
    if (!geckoId)
        throw new Error(`Unsupported token: ${token}`);
    const cached = priceCache[geckoId];
    if (cached && Date.now() < cached.expiresAt)
        return cached.priceUsd;
    const { data: json } = await axios_1.default.get(`https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd`, { headers: { Accept: "application/json", "User-Agent": "Sassaby/1.0 (https://sassaby.app)" }, timeout: 10000 });
    const price = json[geckoId]?.usd;
    if (!price)
        throw new Error(`No price data for ${token}`);
    priceCache[geckoId] = { priceUsd: price, expiresAt: Date.now() + 60000 };
    return price;
}
// ─── Supported currencies ────────────────────────────────────────────────────
const SUPPORTED_CURRENCIES = ["NGN", "GHS", "KES"];
// ─── Platform fee (must match transfers.ts) ────────────────────────────────────
const FEE_RATE = 0.015; // 1.5%
/** Load all RateConfig rows from DB, seeding defaults if the table is empty. */
async function loadRateConfig() {
    // Seed default rows if missing (mode: api, manualRate: 0 until admin sets it)
    for (const currency of SUPPORTED_CURRENCIES) {
        await prisma_1.prisma.rateConfig.upsert({
            where: { currency },
            create: { currency, mode: "api", manualRate: 0 },
            update: {},
        });
    }
    const rows = await prisma_1.prisma.rateConfig.findMany();
    const modes = {};
    const manualRates = {};
    for (const row of rows) {
        modes[row.currency] = row.mode;
        manualRates[row.currency] = Number(row.manualRate);
    }
    return { modes, manualRates };
}
// GET /api/rates/config
router.get("/config", async (_req, res) => {
    try {
        return res.json(await loadRateConfig());
    }
    catch (err) {
        console.error("[RATES] config load failed:", err);
        return res.status(500).json({ error: "Failed to load rate config." });
    }
});
// POST /api/rates/config
router.post("/config", adminAuth_1.adminAuth, async (req, res) => {
    const { modes, manualRates } = req.body;
    const updates = [];
    if (modes) {
        for (const [currency, mode] of Object.entries(modes)) {
            if (mode === "api" || mode === "manual") {
                updates.push(prisma_1.prisma.rateConfig.upsert({
                    where: { currency },
                    create: { currency, mode, manualRate: 0 },
                    update: { mode },
                }));
            }
        }
    }
    if (manualRates) {
        for (const [currency, rate] of Object.entries(manualRates)) {
            const n = Number(rate);
            if (n > 0) {
                updates.push(prisma_1.prisma.rateConfig.upsert({
                    where: { currency },
                    create: { currency, mode: "manual", manualRate: n },
                    update: { manualRate: n, mode: "manual" },
                }));
            }
        }
    }
    try {
        await Promise.all(updates);
        // Bust FLW rate cache for changed currencies
        const changed = Object.keys({ ...modes, ...manualRates });
        for (const cur of changed)
            delete flwRateCache[`USD→${cur}`];
        return res.json(await loadRateConfig());
    }
    catch (err) {
        console.error("[RATES] config update failed:", err);
        return res.status(500).json({ error: "Failed to update rate config." });
    }
});
const flwRateCache = {};
async function getFlwRate(destCurrency) {
    // ── Check admin config in DB ──────────────────────────────────────────────
    try {
        const row = await prisma_1.prisma.rateConfig.findUnique({ where: { currency: destCurrency } });
        if (row && row.mode === "manual" && Number(row.manualRate) > 0) {
            return { rate: Number(row.manualRate) };
        }
    }
    catch {
        // DB unavailable — fall through to live rate
    }
    const cacheKey = `USD→${destCurrency}`;
    const cached = flwRateCache[cacheKey];
    if (cached && Date.now() < cached.expiresAt)
        return { rate: cached.rate };
    try {
        const secretKey = process.env.FLW_SECRET_KEY;
        if (!secretKey)
            throw new Error("FLW_SECRET_KEY is not set.");
        const { data: json } = await axios_1.default.get(`${FLW_V3_BASE}/transfers/rates?amount=1&source_currency=USD&destination_currency=${encodeURIComponent(destCurrency)}`, { headers: { Authorization: `Bearer ${secretKey}` }, timeout: 10000 });
        // data.rate = USD per 1 dest unit; invert to get dest units per 1 USD
        const rawRate = json.data?.rate;
        if (rawRate && rawRate > 0) {
            const rate = 1 / rawRate;
            flwRateCache[cacheKey] = { rate, expiresAt: Date.now() + 5 * 60000 };
            return { rate };
        }
    }
    catch (err) {
        console.warn(`[RATES] FLW rate fetch failed for ${destCurrency}:`, err.message);
    }
    throw new Error(`No rate available for ${destCurrency}. ` +
        `Set a manual rate in the admin dashboard or ensure Flutterwave API is reachable.`);
}
router.get("/", async (req, res) => {
    const { token, amount, currency } = req.query;
    if (!token || !currency)
        return res.status(400).json({ error: "token and currency query params are required." });
    const parsedAmount = parseFloat(amount ?? "1");
    if (isNaN(parsedAmount) || parsedAmount <= 0)
        return res.status(400).json({ error: "amount must be a positive number." });
    try {
        const [tokenPriceUSD, { rate: flwRate }] = await Promise.all([
            getTokenPriceUSD(token),
            getFlwRate(currency),
        ]);
        const usdAmount = parsedAmount * tokenPriceUSD;
        const fee = usdAmount * FEE_RATE;
        const receiveAmount = (usdAmount - fee) * flwRate;
        // Read mode from DB to annotate the response
        const configRow = await prisma_1.prisma.rateConfig.findUnique({ where: { currency } }).catch(() => null);
        const mode = configRow?.mode ?? "api";
        return res.json({
            token, tokenPriceUSD, usdAmount, flwRate, receiveAmount, currency,
            rateSource: mode === "manual" ? "manual" : "flutterwave",
            rateMode: mode,
        });
    }
    catch (err) {
        console.error("[RATES]", err);
        const msg = err instanceof Error
            ? (err.message || err.constructor.name || "Failed to fetch rates.")
            : "Failed to fetch rates.";
        return res.status(502).json({ error: msg });
    }
});
exports.default = router;
