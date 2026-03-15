"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const store_1 = require("./store");
const uuid_1 = require("uuid");
// ─── Seed data ────────────────────────────────────────────────────────────────
const tokens = ["STX", "USDCx", "BTC"];
const currencies = ["NGN", "GHS", "KES"];
const banks = ["GTBank", "Access Bank", "Zenith Bank", "First Bank", "UBA", "Equity Bank", "KCB"];
const statuses = ["completed", "completed", "completed", "failed", "pending"];
const TOKEN_USD = { STX: 1.23, USDCx: 1.0, BTC: 85000 };
const FEE_RATE = 0.015;
function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
}
function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
}
console.log("Seeding 40 demo transfers...");
for (let i = 0; i < 40; i++) {
    const token = tokens[Math.floor(Math.random() * tokens.length)];
    const currency = currencies[Math.floor(Math.random() * currencies.length)];
    const bank = banks[Math.floor(Math.random() * banks.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const sendAmount = parseFloat(randomBetween(5, 2000).toFixed(4));
    const usdEquivalent = sendAmount * TOKEN_USD[token];
    const feeRate = FEE_RATE;
    const fee = usdEquivalent * feeRate;
    const receiveAmount = usdEquivalent - fee;
    const createdAt = daysAgo(Math.floor(Math.random() * 60));
    const t = {
        id: (0, uuid_1.v4)(),
        createdAt,
        sendAmount,
        sendToken: token,
        usdEquivalent,
        receiveAmount,
        receiveCurrency: currency,
        fee,
        feeRate,
        bank,
        bankCode: "044",
        accountNumber: `0${Math.floor(Math.random() * 1000000000).toString().padStart(9, "0")}`,
        senderAddress: "",
        depositAddress: "",
        claimedTxId: "",
        status,
        ...(status === "completed" ? { completedAt: createdAt } : {}),
    };
    (0, store_1.addTransfer)(t);
}
// Print stats
const { getAdminStats } = require("./store");
console.log("Stats:", JSON.stringify(getAdminStats(), null, 2));
