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

dotenv.config();

const app = express();
const FRONTEND_URL = process.env.FRONTEND_URL ?? "";
const NODE_ENV = process.env.NODE_ENV ?? "development";

// ─── Security headers (helmet) ────────────────────────────────────────────────
app.use(helmet());

// ─── CORS — only allow the configured frontend origin ─────────────────────────
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

const publicLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});

const transferLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  skip: () => process.env.NODE_ENV === "test",
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many transfer requests. Please wait before trying again." },
});

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

export default app;
