"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const store_1 = require("../store");
const adminAuth_1 = require("../middleware/adminAuth");
const router = (0, express_1.Router)();
// ─── GET /api/admin/stats ─────────────────────────────────────────────────────
router.get("/stats", adminAuth_1.adminAuth, async (_req, res) => {
    return res.json(await (0, store_1.getAdminStats)());
});
exports.default = router;
