import { Router, Request, Response } from "express";
import { getAdminStats } from "../store";
import { adminAuth } from "../middleware/adminAuth";

const router = Router();

// ─── GET /api/admin/stats ─────────────────────────────────────────────────────
router.get("/stats", adminAuth, async (_req: Request, res: Response) => {
  return res.json(await getAdminStats());
});

export default router;
