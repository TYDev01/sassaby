import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

import transfersRouter from "./routes/transfers";
import adminRouter from "./routes/admin";
import flutterwaveRouter from "./routes/flutterwave";
import ratesRouter from "./routes/rates";
import depositAddressesRouter from "./routes/depositAddresses";
import { startChainMonitor } from "./lib/chainMonitor";

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 4000;
const FRONTEND_URL = process.env.FRONTEND_URL ?? "";
const NODE_ENV = process.env.NODE_ENV ?? "development";

// ─── Security headers (helmet) ────────────────────────────────────────────────
app.use(helmet());

// ─── CORS — only allow the configured frontend origin ─────────────────────────
// Never allow localhost in production; use NODE_ENV to distinguish.
const allowedOrigins =
  NODE_ENV === "production"
    ? [FRONTEND_URL]
    : [FRONTEND_URL, ""];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ─── Body size cap — prevent large-payload DoS ───────────────────────────────
app.use(express.json({ limit: "16kb" }));

// ─── Trust Railway / Vercel reverse proxy ────────────────────────────────────
app.set("trust proxy", 1);

// ─── Rate limiting ────────────────────────────────────────────────────────────

/** Public endpoints: allow generous but bounded traffic */
const publicLimiter = rateLimit({
  windowMs: 60_000,       // 1 minute
  max: 60,                // 60 requests / minute / IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});

/** Transfer creation: tighter limit to frustrate flooding */
const transferLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many transfer requests. Please wait before trying again." },
});

/** Admin endpoints: very strict */
const adminLimiter = rateLimit({
  windowMs: 60_000,
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
app.use("/api/transfers", transferLimiter, transfersRouter);
app.use("/api/admin", adminLimiter, adminRouter);
app.use("/api/flutterwave", publicLimiter, flutterwaveRouter);
app.use("/api/rates", publicLimiter, ratesRouter);
app.use("/api/deposit-addresses", publicLimiter, depositAddressesRouter);

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found." });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`\n Sassaby backend running on http://localhost:${PORT} [${NODE_ENV}]`);

  // Start the on-chain deposit monitor (polls Stacks + BTC APIs every 20s)
  startChainMonitor();
});
