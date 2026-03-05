import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import transfersRouter from "./routes/transfers";
import adminRouter from "./routes/admin";

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 4000;
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: [FRONTEND_URL, "http://localhost:3000"],
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/transfers", transfersRouter);
app.use("/api/admin", adminRouter);

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found." });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n Sassaby backend running on http://localhost:${PORT}`);
  console.log(`   POST   /api/transfers          — create transfer`);
  console.log(`   GET    /api/transfers          — list all transfers`);
  console.log(`   GET    /api/transfers/:id      — get single transfer`);
  console.log(`   PATCH  /api/transfers/:id/status — update status`);
  console.log(`   GET    /api/admin/stats        — admin dashboard stats\n`);
});
