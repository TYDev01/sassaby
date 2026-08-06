"use client";

/**
 * Order tracker.
 *
 * Replaces the old wallet-broadcast modal. Nothing here moves money: the sell
 * leg waits on the chain monitor, and the buy leg waits on an operator checking
 * their banking app. The client's only action is asserting they have paid, which
 * queues the order for verification rather than releasing anything.
 */

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, Check, Loader2, AlertTriangle, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import {
  Order,
  fetchOrder,
  claimPayment,
  cancelOrder,
  isOpen,
  ApiError,
} from "@/lib/api";
import { STATUS_LABEL, STATUS_STYLE, clientHint, explorerTxUrl } from "@/lib/orderStatus";

const POLL_INTERVAL_MS = 8_000;

// ─── Copy field ───────────────────────────────────────────────────────────────

function CopyField({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not copy");
    }
  }

  if (!value) return null;

  return (
    <div className="flex flex-col gap-1">
      <p className="text-gray-500 text-[11px] font-medium uppercase tracking-widest">
        {label}
      </p>
      <button
        onClick={handleCopy}
        className="
          group flex items-center gap-2 w-full text-left
          bg-[#1a1a1a] border border-white/[0.08] rounded-lg
          px-3.5 py-2.5 hover:border-white/20 transition-colors cursor-pointer
        "
      >
        <span
          className={`flex-1 text-sm text-white break-all ${mono ? "font-mono" : ""}`}
        >
          {value}
        </span>
        {copied ? (
          <Check size={15} className="text-emerald-400 shrink-0" />
        ) : (
          <Copy size={15} className="text-gray-500 group-hover:text-white shrink-0" />
        )}
      </button>
    </div>
  );
}

// ─── Order tracker ────────────────────────────────────────────────────────────

export default function OrderTracker({
  open,
  orderId,
  onClose,
}: {
  open: boolean;
  orderId: string;
  onClose: () => void;
}) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrder(await fetchOrder(orderId));
    } catch {
      /* keep the last known state on a transient failure */
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (!open || !orderId) return;
    setLoading(true);
    load();
  }, [open, orderId, load]);

  // Poll while the order is live. Settlement is manual, so the client has no
  // other signal that an operator has acted.
  useEffect(() => {
    if (!open || !order || !isOpen(order.status)) return;
    const t = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [open, order, load]);

  const handleClaimPayment = useCallback(async () => {
    if (!order || acting) return;
    setActing(true);
    try {
      setOrder(await claimPayment(order.id));
      toast.success("Payment reported", {
        description: "We're checking for it now. You'll be notified once it's verified.",
      });
    } catch (err) {
      toast.error("Could not report payment", {
        description: err instanceof ApiError ? err.message : "Please try again.",
      });
    } finally {
      setActing(false);
    }
  }, [order, acting]);

  const handleCancel = useCallback(async () => {
    if (!order || acting) return;
    setActing(true);
    try {
      setOrder(await cancelOrder(order.id));
      toast.success("Order cancelled");
    } catch (err) {
      toast.error("Could not cancel", {
        description: err instanceof ApiError ? err.message : "Please try again.",
      });
    } finally {
      setActing(false);
    }
  }, [order, acting]);

  const isSell = order?.direction === "sell";
  const canClaim = order?.status === "awaiting_payment";
  const canCancel =
    order?.status === "awaiting_payment" || order?.status === "awaiting_deposit";
  const explorer = order ? explorerTxUrl(order.chain, order.claimedTxId) : null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8 bg-black/70 backdrop-blur-sm overflow-y-auto"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ duration: 0.22 }}
            onClick={(e) => e.stopPropagation()}
            className="
              relative w-full max-w-[460px] my-auto
              bg-[#111] border border-white/[0.08] rounded-2xl
              px-6 py-6 flex flex-col gap-5 shadow-2xl
            "
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>

            {loading || !order ? (
              <div className="py-16 flex items-center justify-center gap-2 text-gray-500 text-sm">
                <Loader2 size={16} className="animate-spin" />
                Loading order…
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="flex flex-col gap-2 pr-8">
                  <span
                    className={`self-start text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full border ${STATUS_STYLE[order.status]}`}
                  >
                    {STATUS_LABEL[order.status]}
                  </span>
                  <h2 className="text-white text-xl font-bold tracking-tight">
                    {isSell ? "Sell" : "Buy"} {order.sendAmount} {order.sendToken}
                  </h2>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    {clientHint(order.status, order.direction)}
                  </p>
                </div>

                {/* Amounts */}
                <div className="flex items-center justify-between bg-[#1a1a1a] border border-white/[0.06] rounded-xl px-4 py-3">
                  <div>
                    <p className="text-gray-500 text-[11px] uppercase tracking-widest">
                      {isSell ? "You send" : "You pay"}
                    </p>
                    <p className="text-white text-sm font-semibold mt-0.5">
                      {isSell
                        ? `${order.sendAmount} ${order.sendToken}`
                        : `${order.receiveAmount.toLocaleString()} ${order.receiveCurrency}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-500 text-[11px] uppercase tracking-widest">
                      You receive
                    </p>
                    <p className="text-white text-sm font-semibold mt-0.5">
                      {isSell
                        ? `${order.receiveAmount.toLocaleString()} ${order.receiveCurrency}`
                        : `${order.sendAmount} ${order.sendToken}`}
                    </p>
                  </div>
                </div>

                {/* Sell leg — where to deposit */}
                {isSell && order.status === "awaiting_deposit" && (
                  <div className="flex flex-col gap-3">
                    <CopyField label={`${order.sendToken} deposit address`} value={order.depositAddress} />
                    <p className="text-xs text-amber-400/90 flex items-start gap-1.5">
                      <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                      Send only {order.sendToken} on {order.chain}. Anything else is
                      unrecoverable.
                    </p>
                  </div>
                )}

                {/* Buy leg — where to pay, and the confirm action */}
                {!isSell && (order.status === "awaiting_payment" || order.status === "payment_claimed") && (
                  <div className="flex flex-col gap-3">
                    <div className="bg-[#1a1a1a] border border-white/[0.06] rounded-xl px-4 py-3">
                      <p className="text-gray-500 text-[11px] uppercase tracking-widest mb-1">
                        Pay exactly
                      </p>
                      <p className="text-white text-lg font-bold">
                        {order.receiveAmount.toLocaleString()} {order.receiveCurrency}
                      </p>
                    </div>
                    {/* Bank details are desk config; surfaced by the backend once
                        that endpoint lands (task.md §14). */}
                    <p className="text-xs text-gray-500 leading-relaxed">
                      Transfer from an account in your own name. Payments from a third
                      party can&apos;t be released and will be refunded to source.
                    </p>
                  </div>
                )}

                {/* Destination / explorer */}
                {!isSell && order.destinationAddress && (
                  <CopyField label="Releasing to" value={order.destinationAddress} />
                )}

                {explorer && (
                  <a
                    href={explorer}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-[#f97316] hover:underline"
                  >
                    View transaction <ExternalLink size={13} />
                  </a>
                )}

                {order.rejectionReason && (
                  <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3.5 py-2.5">
                    {order.rejectionReason}
                  </p>
                )}

                {/* Actions */}
                {(canClaim || canCancel) && (
                  <div className="flex items-center gap-2">
                    {canClaim && (
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        onClick={handleClaimPayment}
                        disabled={acting}
                        className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold bg-[#f97316] text-white hover:bg-[#ea6c0e] transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {acting && <Loader2 size={15} className="animate-spin" />}
                        I&apos;ve made payment
                      </motion.button>
                    )}
                    {canCancel && (
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        onClick={handleCancel}
                        disabled={acting}
                        className="px-4 py-3 rounded-xl text-sm font-semibold bg-white/[0.06] text-gray-300 hover:bg-white/[0.12] transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        Cancel
                      </motion.button>
                    )}
                  </div>
                )}

                <p className="text-[11px] text-gray-600 text-center">
                  Order {order.id.slice(0, 8)}…
                </p>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
