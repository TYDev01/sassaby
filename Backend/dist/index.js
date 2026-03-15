"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = __importDefault(require("dotenv"));
const transfers_1 = __importDefault(require("./routes/transfers"));
const admin_1 = __importDefault(require("./routes/admin"));
const flutterwave_1 = __importDefault(require("./routes/flutterwave"));
const rates_1 = __importDefault(require("./routes/rates"));
const depositAddresses_1 = __importDefault(require("./routes/depositAddresses"));
const chainMonitor_1 = require("./lib/chainMonitor");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT ?? 4000;
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";
const NODE_ENV = process.env.NODE_ENV ?? "development";
// ─── Security headers (helmet) ────────────────────────────────────────────────
app.use((0, helmet_1.default)());
// ─── CORS — only allow the configured frontend origin ─────────────────────────
// Never allow localhost in production; use NODE_ENV to distinguish.
const allowedOrigins = NODE_ENV === "production"
    ? [FRONTEND_URL]
    : [FRONTEND_URL, "http://localhost:3000"];
app.use((0, cors_1.default)({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
// ─── Body size cap — prevent large-payload DoS ───────────────────────────────
app.use(express_1.default.json({ limit: "16kb" }));
// ─── Trust Railway / Vercel reverse proxy ────────────────────────────────────
app.set("trust proxy", 1);
// ─── Rate limiting ────────────────────────────────────────────────────────────
/** Public endpoints: allow generous but bounded traffic */
const publicLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60000, // 1 minute
    max: 60, // 60 requests / minute / IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please slow down." },
});
/** Transfer creation: tighter limit to frustrate flooding */
const transferLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many transfer requests. Please wait before trying again." },
});
/** Admin endpoints: very strict */
const adminLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many admin requests." },
});
// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/transfers", transferLimiter, transfers_1.default);
app.use("/api/admin", adminLimiter, admin_1.default);
app.use("/api/flutterwave", publicLimiter, flutterwave_1.default);
app.use("/api/rates", publicLimiter, rates_1.default);
app.use("/api/deposit-addresses", publicLimiter, depositAddresses_1.default);
// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ error: "Route not found." });
});
// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`\n Sassaby backend running on http://localhost:${PORT} [${NODE_ENV}]`);
    // Start the on-chain deposit monitor (polls Stacks + BTC APIs every 20s)
    (0, chainMonitor_1.startChainMonitor)();
});
