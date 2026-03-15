"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const uuid_1 = require("uuid");
const store_1 = require("../store");
const rates_1 = require("./rates");
const prisma_1 = require("../lib/prisma");
const VALID_TOKENS = ["STX", "USDCx", "BTC"];
const VALID_CURRENCIES = ["NGN", "GHS", "KES"];
/** Maximum send amount per-transfer (crypto units) — guard against fat-finger or abuse */
const MAX_SEND_AMOUNT = 1000000;
const router = (0, express_1.Router)();
// ─── Platform fee (all transfers are instant) ────────────────────────────────
const FEE_RATE = 0.015; // 1.5%
// ─── POST /api/transfers — create a new transfer ─────────────────────────────
// The Flutterwave payout is NOT triggered here. The chain monitor
// (src/lib/chainMonitor.ts) polls the blockchain and fires the payout once the
// user's on-chain deposit is confirmed.
router.post("/", async (req, res) => {
    const { sendAmount, sendToken, receiveCurrency, bank, bankCode, accountNumber, senderAddress = "", } = req.body;
    // ── Presence check ────────────────────────────────────────────────────────
    if (!sendAmount || !sendToken || !receiveCurrency || !bank || !bankCode || !accountNumber) {
        return res.status(400).json({ error: "Missing required fields." });
    }
    // ── Enum validation ───────────────────────────────────────────────────────
    if (!VALID_TOKENS.includes(sendToken)) {
        return res.status(400).json({ error: `sendToken must be one of: ${VALID_TOKENS.join(", ")}.` });
    }
    if (!VALID_CURRENCIES.includes(receiveCurrency)) {
        return res.status(400).json({ error: `receiveCurrency must be one of: ${VALID_CURRENCIES.join(", ")}.` });
    }
    // ── Numeric bounds ────────────────────────────────────────────────────────
    if (typeof sendAmount !== "number" || sendAmount <= 0 || sendAmount > MAX_SEND_AMOUNT) {
        return res.status(400).json({ error: `sendAmount must be a positive number no greater than ${MAX_SEND_AMOUNT}.` });
    }
    // ── String length guards ──────────────────────────────────────────────────
    if (accountNumber.length > 20 || bank.length > 100 || bankCode.length > 20) {
        return res.status(400).json({ error: "One or more fields exceed the maximum allowed length." });
    }
    // Look up the admin deposit address for this token so the chain monitor
    // knows exactly which blockchain address to watch.
    const depositRow = await prisma_1.prisma.depositAddress.findUnique({
        where: { token: sendToken },
    });
    if (!depositRow) {
        return res.status(400).json({
            error: `No deposit address configured for ${sendToken}. Please contact support.`,
        });
    }
    const depositAddress = depositRow.address;
    let usdEquivalent = 0;
    let fee = 0;
    let receiveAmount = 0;
    try {
        const [tokenPrice, { rate: flwRate }] = await Promise.all([
            (0, rates_1.getTokenPriceUSD)(sendToken),
            (0, rates_1.getFlwRate)(receiveCurrency),
        ]);
        usdEquivalent = sendAmount * tokenPrice;
        fee = usdEquivalent * FEE_RATE;
        // Store the actual fiat payout amount so the chain monitor can pass it
        // directly to Flutterwave without a second rate lookup.
        receiveAmount = (usdEquivalent - fee) * flwRate;
    }
    catch (err) {
        console.error("[TRANSFERS] Failed to fetch live rates:", err);
        return res
            .status(502)
            .json({ error: "Could not fetch live rates. Please try again." });
    }
    const transfer = {
        id: (0, uuid_1.v4)(),
        createdAt: new Date().toISOString(),
        sendAmount,
        sendToken,
        usdEquivalent,
        receiveAmount,
        receiveCurrency,
        fee,
        feeRate: FEE_RATE,
        bank,
        bankCode,
        accountNumber,
        senderAddress,
        depositAddress,
        claimedTxId: "",
        // Status stays "pending" until the chain monitor detects the on-chain
        // deposit and updates it to "processing".
        status: "pending",
    };
    await (0, store_1.addTransfer)(transfer);
    console.log(`[TRANSFERS] Transfer ${transfer.id} created — awaiting on-chain confirmation ` +
        `at ${depositAddress} for ${sendAmount} ${sendToken}`);
    // Do NOT return accountNumber or full banking PII in the response.
    return res.status(201).json({
        success: true,
        id: transfer.id,
        status: transfer.status,
        depositAddress: transfer.depositAddress,
        sendAmount: transfer.sendAmount,
        sendToken: transfer.sendToken,
        receiveAmount: transfer.receiveAmount,
        receiveCurrency: transfer.receiveCurrency,
    });
});
// ─── GET /api/transfers — list all transfers ──────────────────────────────────
router.get("/", async (_req, res) => {
    return res.json({ transfers: await (0, store_1.getAllTransfers)() });
});
// ─── GET /api/transfers/:id — single transfer ─────────────────────────────────
router.get("/:id", async (req, res) => {
    const transfer = await (0, store_1.getTransferById)(req.params.id);
    if (!transfer)
        return res.status(404).json({ error: "Transfer not found." });
    return res.json({ transfer });
});
// ─── PATCH /api/transfers/:id/status — manual status override ────────────────
router.patch("/:id/status", async (req, res) => {
    const { status } = req.body;
    const valid = ["pending", "processing", "completed", "failed"];
    if (!valid.includes(status)) {
        return res.status(400).json({ error: "Invalid status value." });
    }
    const updated = await (0, store_1.updateTransferStatus)(req.params.id, status, status === "completed" ? new Date().toISOString() : undefined);
    if (!updated)
        return res.status(404).json({ error: "Transfer not found." });
    return res.json({ success: true, transfer: updated });
});
exports.default = router;
