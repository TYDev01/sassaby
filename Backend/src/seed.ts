import {
  addTransfer,
  Transfer,
  SendToken,
  Currency,
  updateTransferStatus,
} from "./store";
import { v4 as uuidv4 } from "uuid";

// ─── Seed data ────────────────────────────────────────────────────────────────

const tokens: SendToken[] = ["STX", "USDCx", "BTC"];
const currencies: Currency[] = ["NGN", "GHS", "KES"];
const banks = ["GTBank", "Access Bank", "Zenith Bank", "First Bank", "UBA", "Equity Bank", "KCB"];
const statuses: Transfer["status"][] = ["completed", "completed", "completed", "failed", "pending"];

const TOKEN_USD: Record<SendToken, number> = { STX: 1.23, USDCx: 1.0, BTC: 85000 };
const FEE_RATE = 0.015;

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function daysAgo(n: number) {
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

  const t: Transfer = {
    id: uuidv4(),
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
    accountNumber: `0${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, "0")}`,
    senderAddress: "",
    depositAddress: "",
    claimedTxId: "",
    status,
    ...(status === "completed" ? { completedAt: createdAt } : {}),
  };

  addTransfer(t);
}

// Print stats
const { getAdminStats } = require("./store");
console.log("Stats:", JSON.stringify(getAdminStats(), null, 2));
