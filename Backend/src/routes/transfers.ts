import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  addTransfer,
  getAllTransfers,
  getTransferById,
  updateTransferStatus,
  Transfer,
  SendToken,
  Currency,
  PaymentMethod,
} from "../store";

const router = Router();

// ─── Token → USD rates (mock; swap with live oracle later) ───────────────────
const TOKEN_USD_RATES: Record<SendToken, number> = {
  STX: 1.23,
  USDCx: 1.0,
  BTC: 85000,
};

// ─── Fee rates per payment method ─────────────────────────────────────────────
const FEE_RATES: Record<PaymentMethod, number> = {
  instant: 0.015,
  same_day: 0.008,
  standard: 0.003,
};

// ─── POST /api/transfers — create a new transfer ─────────────────────────────
router.post("/", (req: Request, res: Response) => {
  const {
    sendAmount,
    sendToken,
    receiveCurrency,
    paymentMethod,
    bank,
    accountNumber,
  } = req.body as {
    sendAmount: number;
    sendToken: SendToken;
    receiveCurrency: Currency;
    paymentMethod: PaymentMethod;
    bank: string;
    accountNumber: string;
  };

  // Validation
  if (
    !sendAmount ||
    !sendToken ||
    !receiveCurrency ||
    !paymentMethod ||
    !bank ||
    !accountNumber
  ) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  const usdEquivalent = sendAmount * (TOKEN_USD_RATES[sendToken] ?? 0);
  const feeRate = FEE_RATES[paymentMethod] ?? 0;
  const fee = usdEquivalent * feeRate;
  const receiveAmount = usdEquivalent - fee;

  const transfer: Transfer = {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    sendAmount,
    sendToken,
    usdEquivalent,
    receiveAmount,
    receiveCurrency,
    fee,
    feeRate,
    paymentMethod,
    bank,
    accountNumber,
    status: "pending",
  };

  addTransfer(transfer);

  // Simulate async processing
  setTimeout(() => {
    updateTransferStatus(transfer.id, "processing");
    setTimeout(() => {
      // 95% success rate
      const success = Math.random() > 0.05;
      updateTransferStatus(
        transfer.id,
        success ? "completed" : "failed",
        success ? new Date().toISOString() : undefined
      );
    }, 8000);
  }, 2000);

  return res.status(201).json({ success: true, transfer });
});

// ─── GET /api/transfers — list all transfers ──────────────────────────────────
router.get("/", (_req: Request, res: Response) => {
  return res.json({ transfers: getAllTransfers() });
});

// ─── GET /api/transfers/:id — single transfer ─────────────────────────────────
router.get("/:id", (req: Request, res: Response) => {
  const transfer = getTransferById(req.params.id);
  if (!transfer) return res.status(404).json({ error: "Transfer not found." });
  return res.json({ transfer });
});

// ─── PATCH /api/transfers/:id/status — manual status override ────────────────
router.patch("/:id/status", (req: Request, res: Response) => {
  const { status } = req.body as { status: string };
  const valid = ["pending", "processing", "completed", "failed"];
  if (!valid.includes(status)) {
    return res.status(400).json({ error: "Invalid status value." });
  }

  const updated = updateTransferStatus(
    req.params.id,
    status as Transfer["status"],
    status === "completed" ? new Date().toISOString() : undefined
  );

  if (!updated) return res.status(404).json({ error: "Transfer not found." });
  return res.json({ success: true, transfer: updated });
});

export default router;
