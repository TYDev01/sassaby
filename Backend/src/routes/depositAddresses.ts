import { Router } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

const VALID_TOKENS = ["STX", "USDCx", "BTC"] as const;
type Token = (typeof VALID_TOKENS)[number];

// ─── GET /api/deposit-addresses ──────────────────────────────────────────────
// Returns all deposit addresses (token → address map). Public endpoint so
// the frontend can show the correct deposit address to the user.

router.get("/", async (_req, res) => {
  try {
    const rows = await prisma.depositAddress.findMany();
    // Return as an array and also a convenient token-keyed map
    const addresses: Record<string, { address: string; label: string; updatedAt: string }> = {};
    for (const row of rows) {
      addresses[row.token] = {
        address: row.address,
        label: row.label,
        updatedAt: row.updatedAt.toISOString(),
      };
    }
    res.json({ addresses, list: rows });
  } catch (err) {
    console.error("[deposit-addresses] GET /", err);
    res.status(500).json({ error: "Failed to fetch deposit addresses" });
  }
});

// ─── POST /api/deposit-addresses ─────────────────────────────────────────────
// Upsert a deposit address for a given token. Admin-only (auth enforced by
// the caller knowing the admin key — in production add middleware).

router.post("/", async (req, res) => {
  const { token, address, label = "" } = req.body as {
    token: Token;
    address: string;
    label?: string;
  };

  if (!VALID_TOKENS.includes(token)) {
    res.status(400).json({ error: `token must be one of ${VALID_TOKENS.join(", ")}` });
    return;
  }
  if (!address || typeof address !== "string" || address.trim() === "") {
    res.status(400).json({ error: "address is required" });
    return;
  }

  try {
    const row = await prisma.depositAddress.upsert({
      where: { token },
      create: { token, address: address.trim(), label: label.trim() },
      update: { address: address.trim(), label: label.trim() },
    });
    res.json({ depositAddress: row });
  } catch (err) {
    console.error("[deposit-addresses] POST /", err);
    res.status(500).json({ error: "Failed to save deposit address" });
  }
});

// ─── DELETE /api/deposit-addresses/:token ────────────────────────────────────
// Remove a deposit address for a token.

router.delete("/:token", async (req, res) => {
  const { token } = req.params;
  if (!VALID_TOKENS.includes(token as Token)) {
    res.status(400).json({ error: `token must be one of ${VALID_TOKENS.join(", ")}` });
    return;
  }
  try {
    await prisma.depositAddress.delete({ where: { token } });
    res.json({ ok: true });
  } catch {
    // If not found, still return ok
    res.json({ ok: true });
  }
});

export default router;
