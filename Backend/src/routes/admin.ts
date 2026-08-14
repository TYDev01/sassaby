import { Router, Request, Response } from "express";
import { getAdminStats } from "../store";
import { getP2PStats } from "../lib/p2pStats";
import { adminAuth } from "../middleware/adminAuth";

const router = Router();

// ─── GET /api/admin/stats ─────────────────────────────────────────────────────
//
// Two books, reported side by side. The site's own orders are the customer
// business; the Bitget P2P orders are the desk rebalancing against it. Summing
// them would count the same value twice, so they stay separate all the way to
// the dashboard.
//
// A Bitget outage degrades this endpoint rather than failing it: getP2PStats
// reports itself unavailable and the site figures still render.
router.get("/stats", adminAuth, async (_req: Request, res: Response) => {
  const [site, p2p] = await Promise.all([getAdminStats(), getP2PStats()]);
  return res.json({ ...site, p2p });
});

export default router;
