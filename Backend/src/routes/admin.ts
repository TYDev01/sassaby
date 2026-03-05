import { Router, Request, Response } from "express";
import { getAdminStats } from "../store";

const router = Router();

// ─── GET /api/admin/stats ─────────────────────────────────────────────────────
router.get("/stats", async (_req: Request, res: Response) => {
  return res.json(await getAdminStats());
});

export default router;
