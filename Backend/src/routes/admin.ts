import { Router, Request, Response } from "express";
import { getAdminStats } from "../store";

const router = Router();

// ─── GET /api/admin/stats ─────────────────────────────────────────────────────
router.get("/stats", (_req: Request, res: Response) => {
  return res.json(getAdminStats());
});

export default router;
