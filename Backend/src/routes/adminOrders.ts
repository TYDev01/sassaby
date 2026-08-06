import { Router, Request, Response } from "express";

import {
  getOrdersByStatus,
  getTransferById,
  transitionOrder,
  Order,
  OrderStatus,
  OPEN_STATUSES,
} from "../store";
import { adminAuth } from "../middleware/adminAuth";

const router = Router();

router.use(adminAuth);

const MAX_EVIDENCE_LEN = 300;
const MAX_REASON_LEN = 300;

/** Who acted. Recorded on every state change an operator makes. */
function actor(req: Request): string {
  const header = req.get("X-Operator") ?? "";
  return header.slice(0, 80) || "admin";
}

function orderOr404(order: Order | undefined, res: Response): order is Order {
  if (!order) {
    res.status(404).json({ error: "Order not found." });
    return false;
  }
  return true;
}

// ─── GET /api/admin/orders — the work queue ───────────────────────────────────
// Defaults to everything still open, oldest first: buyers are waiting on a
// ~15-minute release, so the queue is a FIFO of people watching a spinner.

router.get("/", async (req: Request, res: Response) => {
  const { status } = req.query as { status?: string };

  const statuses: OrderStatus[] = status
    ? (status.split(",").map((s) => s.trim()) as OrderStatus[])
    : OPEN_STATUSES;

  const orders = await getOrdersByStatus(statuses);
  return res.json({ orders, count: orders.length });
});

// ─── POST /api/admin/orders/:id/verify — take the order off the queue ─────────
// Marks that an operator is actively checking their banking app for this credit,
// so a second operator (or a second tab) doesn't duplicate the work.

router.post("/:id/verify", async (req: Request, res: Response) => {
  const order = await getTransferById(req.params.id);
  if (!orderOr404(order, res)) return;

  const updated = await transitionOrder(order.id, "payment_claimed", "verifying");
  if (!updated) {
    return res.status(409).json({
      error: "Order is not awaiting verification.",
      status: order.status,
    });
  }
  return res.json({ success: true, order: updated });
});

// ─── POST /api/admin/orders/:id/release — buy leg, irreversible ───────────────
//
// The two checks below are required in the request body, not merely documented.
// Releasing crypto cannot be undone, and the failure modes this guards against
// are the two that actually drain P2P desks:
//
//   creditObserved     — the credit was seen in the bank's own record, not on an
//                        uploaded screenshot. Forged receipts are the entire
//                        fraud economy around NGN P2P.
//   senderNameMatches  — the paying account belongs to the buyer. A correct
//                        amount from the wrong name means holding the proceeds of
//                        someone else's fraud, with the reversal landing here
//                        after the crypto is gone.
//
// A UI that cannot tick both boxes cannot release. That is the point.

router.post("/:id/release", async (req: Request, res: Response) => {
  const { creditObserved, senderNameMatches, evidenceRef = "", txId = "" } = req.body as {
    creditObserved?: boolean;
    senderNameMatches?: boolean;
    evidenceRef?: string;
    txId?: string;
  };

  if (creditObserved !== true) {
    return res.status(400).json({
      error:
        "creditObserved must be true — confirm the credit in your banking app, not from an uploaded receipt.",
    });
  }
  if (senderNameMatches !== true) {
    return res.status(400).json({
      error:
        "senderNameMatches must be true — the paying account must match the buyer's registered bank account name.",
    });
  }
  if (!evidenceRef.trim()) {
    return res.status(400).json({
      error: "evidenceRef is required — record the bank reference or credit timestamp.",
    });
  }
  if (evidenceRef.length > MAX_EVIDENCE_LEN) {
    return res.status(400).json({ error: "evidenceRef exceeds the maximum allowed length." });
  }

  const order = await getTransferById(req.params.id);
  if (!orderOr404(order, res)) return;
  if (order.direction !== "buy") {
    return res.status(400).json({ error: "Only buy orders are released." });
  }

  // Atomic: a double-tap, or two operators on two devices, cannot both win.
  const updated = await transitionOrder(order.id, "verifying", "released", {
    releasedBy:  actor(req),
    evidenceRef: evidenceRef.trim(),
    releasedAt:  new Date(),
    completedAt: new Date(),
    ...(txId ? { claimedTxId: txId.trim() } : {}),
  });

  if (!updated) {
    return res.status(409).json({
      error: "Order is not in a releasable state. It may already have been released.",
      status: order.status,
    });
  }

  console.log(`[ADMIN] Order ${order.id} released by ${updated.releasedBy}`);
  return res.json({ success: true, order: updated });
});

// ─── POST /api/admin/orders/:id/reject ────────────────────────────────────────

router.post("/:id/reject", async (req: Request, res: Response) => {
  const { reason = "" } = req.body as { reason?: string };

  if (!reason.trim()) {
    return res.status(400).json({ error: "A rejection reason is required — the client sees it." });
  }
  if (reason.length > MAX_REASON_LEN) {
    return res.status(400).json({ error: "reason exceeds the maximum allowed length." });
  }

  const order = await getTransferById(req.params.id);
  if (!orderOr404(order, res)) return;

  const updated = await transitionOrder(
    order.id,
    ["payment_claimed", "verifying"],
    "rejected",
    { rejectionReason: reason.trim(), releasedBy: actor(req), completedAt: new Date() }
  );

  if (!updated) {
    return res.status(409).json({
      error: "Order is not in a rejectable state.",
      status: order.status,
    });
  }

  console.log(`[ADMIN] Order ${order.id} rejected by ${actor(req)}: ${reason.trim()}`);
  return res.json({ success: true, order: updated });
});

// ─── Sell leg — the desk owes the client fiat ─────────────────────────────────

/** Operator has started the bank transfer out. */
router.post("/:id/payout-initiated", async (req: Request, res: Response) => {
  const order = await getTransferById(req.params.id);
  if (!orderOr404(order, res)) return;

  const updated = await transitionOrder(order.id, "deposit_confirmed", "awaiting_manual_payout", {
    releasedBy: actor(req),
  });
  if (!updated) {
    return res.status(409).json({
      error: "Order is not awaiting payout initiation.",
      status: order.status,
    });
  }
  return res.json({ success: true, order: updated });
});

/** Fiat has left the operator's account and landed. */
router.post("/:id/settle", async (req: Request, res: Response) => {
  const { evidenceRef = "" } = req.body as { evidenceRef?: string };

  if (!evidenceRef.trim()) {
    return res.status(400).json({
      error: "evidenceRef is required — record the outbound transfer reference.",
    });
  }
  if (evidenceRef.length > MAX_EVIDENCE_LEN) {
    return res.status(400).json({ error: "evidenceRef exceeds the maximum allowed length." });
  }

  const order = await getTransferById(req.params.id);
  if (!orderOr404(order, res)) return;

  const updated = await transitionOrder(order.id, "awaiting_manual_payout", "settled", {
    evidenceRef: evidenceRef.trim(),
    releasedBy:  actor(req),
    completedAt: new Date(),
  });
  if (!updated) {
    return res.status(409).json({
      error: "Order is not awaiting settlement.",
      status: order.status,
    });
  }

  console.log(`[ADMIN] Order ${order.id} settled by ${actor(req)}`);
  return res.json({ success: true, order: updated });
});

export default router;
