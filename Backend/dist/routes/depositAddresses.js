"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const adminAuth_1 = require("../middleware/adminAuth");
const router = (0, express_1.Router)();
const VALID_TOKENS = ["STX", "USDCx", "BTC"];
// ─── GET /api/deposit-addresses ──────────────────────────────────────────────
// Returns all deposit addresses (token → address map). Public endpoint so
// the frontend can show the correct deposit address to the user.
router.get("/", async (_req, res) => {
    try {
        const rows = await prisma_1.prisma.depositAddress.findMany();
        // Return as an array and also a convenient token-keyed map
        const addresses = {};
        for (const row of rows) {
            addresses[row.token] = {
                address: row.address,
                label: row.label,
                updatedAt: row.updatedAt.toISOString(),
            };
        }
        res.json({ addresses, list: rows });
    }
    catch (err) {
        console.error("[deposit-addresses] GET /", err);
        res.status(500).json({ error: "Failed to fetch deposit addresses" });
    }
});
// ─── POST /api/deposit-addresses ─────────────────────────────────────────────
// Upsert a deposit address for a given token. Admin-only.
router.post("/", adminAuth_1.adminAuth, async (req, res) => {
    const { token, address, label = "" } = req.body;
    if (!VALID_TOKENS.includes(token)) {
        res.status(400).json({ error: `token must be one of ${VALID_TOKENS.join(", ")}` });
        return;
    }
    if (!address || typeof address !== "string" || address.trim() === "") {
        res.status(400).json({ error: "address is required" });
        return;
    }
    try {
        const row = await prisma_1.prisma.depositAddress.upsert({
            where: { token },
            create: { token, address: address.trim(), label: label.trim() },
            update: { address: address.trim(), label: label.trim() },
        });
        res.json({ depositAddress: row });
    }
    catch (err) {
        console.error("[deposit-addresses] POST /", err);
        res.status(500).json({ error: "Failed to save deposit address" });
    }
});
// ─── DELETE /api/deposit-addresses/:token ────────────────────────────────────
// Remove a deposit address for a token.
router.delete("/:token", adminAuth_1.adminAuth, async (req, res) => {
    const { token } = req.params;
    if (!VALID_TOKENS.includes(token)) {
        res.status(400).json({ error: `token must be one of ${VALID_TOKENS.join(", ")}` });
        return;
    }
    try {
        await prisma_1.prisma.depositAddress.delete({ where: { token } });
        res.json({ ok: true });
    }
    catch {
        // If not found, still return ok
        res.json({ ok: true });
    }
});
exports.default = router;
