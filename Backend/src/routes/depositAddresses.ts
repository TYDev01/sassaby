import { Router } from "express";
import { prisma } from "../lib/prisma";
import { adminAuth } from "../middleware/adminAuth";
import { isSupportedAsset, ASSETS } from "../lib/assets";

const router = Router();

const MAX_ADDRESS_LEN = 128;
const MAX_MEMO_LEN = 128;
const VALID_KINDS = ["self", "bitget"] as const;
type Kind = (typeof VALID_KINDS)[number];

// ─── GET /api/deposit-addresses ──────────────────────────────────────────────
// Public: the client has to be shown where to deposit.
//
// Keyed by "TOKEN:chain" — token alone is ambiguous now that USDT exists on
// five networks. `kind` is intentionally NOT exposed: whether the desk custodies
// an asset itself or parks it on Bitget is nobody's business but the operator's.

router.get("/", async (_req, res) => {
  try {
    const rows = await prisma.depositAddress.findMany({ where: { active: true } });

    const addresses: Record<
      string,
      { token: string; chain: string; address: string; memo: string; label: string; updatedAt: string }
    > = {};

    for (const row of rows) {
      addresses[`${row.token}:${row.chain}`] = {
        token:     row.token,
        chain:     row.chain,
        address:   row.address,
        memo:      row.memo,
        label:     row.label,
        updatedAt: row.updatedAt.toISOString(),
      };
    }

    res.json({ addresses, supported: ASSETS });
  } catch (err) {
    console.error("[deposit-addresses] GET /", err);
    res.status(500).json({ error: "Failed to fetch deposit addresses" });
  }
});

// ─── POST /api/deposit-addresses ─────────────────────────────────────────────
// Upsert the receiving address for a (token, chain) pair. Admin-only.
//
// `kind` is the switchable receiving method — point an asset at a Bitget deposit
// address or at a self-custody wallet, and change it whenever. Orders snapshot
// the address at creation, so switching never moves an in-flight deposit target.

router.post("/", adminAuth, async (req, res) => {
  const { token, chain, address, memo = "", label = "", kind = "self", active = true } = req.body as {
    token: string;
    chain: string;
    address: string;
    memo?: string;
    label?: string;
    kind?: Kind;
    active?: boolean;
  };

  if (!token || !chain || !isSupportedAsset(token, chain)) {
    return res.status(400).json({ error: `${token} on ${chain} is not a supported asset.` });
  }
  if (!address || typeof address !== "string" || !address.trim()) {
    return res.status(400).json({ error: "address is required" });
  }
  if (address.length > MAX_ADDRESS_LEN || memo.length > MAX_MEMO_LEN) {
    return res.status(400).json({ error: "address or memo exceeds the maximum allowed length." });
  }
  if (!VALID_KINDS.includes(kind)) {
    return res.status(400).json({ error: `kind must be one of ${VALID_KINDS.join(", ")}` });
  }

  try {
    const row = await prisma.depositAddress.upsert({
      where:  { token_chain: { token, chain } },
      create: { token, chain, address: address.trim(), memo: memo.trim(), label: label.trim(), kind, active },
      update: { address: address.trim(), memo: memo.trim(), label: label.trim(), kind, active },
    });
    return res.json({ depositAddress: row });
  } catch (err) {
    console.error("[deposit-addresses] POST /", err);
    return res.status(500).json({ error: "Failed to save deposit address" });
  }
});

// ─── DELETE /api/deposit-addresses/:token/:chain ─────────────────────────────

router.delete("/:token/:chain", adminAuth, async (req, res) => {
  const { token, chain } = req.params;
  try {
    await prisma.depositAddress.delete({ where: { token_chain: { token, chain } } });
    res.json({ ok: true });
  } catch {
    // Already gone — the caller's intent is satisfied either way.
    res.json({ ok: true });
  }
});

export default router;
