"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check, X, Loader2, AlertCircle, SendHorizonal, CheckCircle2, XCircle } from "lucide-react";
import { SendToken, fetchDepositAddresses, DepositAddress, getTransfer, TransferStatus } from "@/lib/api";

const QRCode = dynamic(() => import("react-qr-code"), { ssr: false });

// ─── Props ────────────────────────────────────────────────────────────────────

interface TransferModalProps {
  open: boolean;
  onClose: () => void;
  /** Called once the user confirms they've sent the crypto. */
  onConfirm: () => void;
  isConfirming: boolean;
  /** When set, modal enters monitoring mode and polls this transfer ID. */
  monitoringTransferId: string | null;
  /** Called when monitoring resolves (completed or failed). */
  onMonitoringDone: (status: TransferStatus) => void;

  sendAmount: number;
  sendToken: SendToken;
  receiveAmount: number;
  receiveCurrency: string;
}

// ─── Token display helpers ────────────────────────────────────────────────────

const TOKEN_COLORS: Record<SendToken, string> = {
  STX: "#f97316",
  USDCx: "#2775ca",
  BTC: "#f7931a",
};

const TOKEN_LABELS: Record<SendToken, string> = {
  STX: "Stacks (STX)",
  USDCx: "USD Coin on Stacks",
  BTC: "Bitcoin (BTC)",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function TransferModal({
  open,
  onClose,
  onConfirm,
  isConfirming,
  monitoringTransferId,
  onMonitoringDone,
  sendAmount,
  sendToken,
  receiveAmount,
  receiveCurrency,
}: TransferModalProps) {
  const [depositAddress, setDepositAddress] = useState<DepositAddress | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Monitoring phase state
  const [monitoringStatus, setMonitoringStatus] = useState<TransferStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Poll transfer status when monitoring ─────────────────────────────────
  useEffect(() => {
    if (!monitoringTransferId) {
      setMonitoringStatus(null);
      return;
    }

    let cancelled = false;
    setMonitoringStatus("pending");

    const poll = async () => {
      try {
        const transfer = await getTransfer(monitoringTransferId);
        if (cancelled) return;
        setMonitoringStatus(transfer.status);
        if (transfer.status === "completed" || transfer.status === "failed") {
          onMonitoringDone(transfer.status);
          return; // stop polling
        }
      } catch { /* silently retry */ }
      if (!cancelled) {
        pollRef.current = setTimeout(poll, 6_000);
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [monitoringTransferId, onMonitoringDone]);

  // ── Fetch deposit address when modal opens ────────────────────────────────
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setAddressLoading(true);
    setAddressError(null);
    setDepositAddress(null);

    fetchDepositAddresses()
      .then((data) => {
        if (cancelled) return;
        const addr = data.addresses[sendToken];
        if (addr) {
          setDepositAddress(addr);
        } else {
          setAddressError(
            `No deposit address configured for ${sendToken}. Please contact support.`
          );
        }
      })
      .catch(() => {
        if (!cancelled) setAddressError("Could not load deposit address. Try again.");
      })
      .finally(() => {
        if (!cancelled) setAddressLoading(false);
      });

    return () => { cancelled = true; };
  }, [open, sendToken]);

  // ── Copy to clipboard ─────────────────────────────────────────────────────
  const handleCopy = useCallback(() => {
    if (!depositAddress) return;
    navigator.clipboard.writeText(depositAddress.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }, [depositAddress]);

  // ── Close on Escape ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const color = TOKEN_COLORS[sendToken];
  const isMonitoring = !!monitoringTransferId;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
            onClick={isMonitoring ? undefined : onClose}
          />

          {/* Modal panel */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 20 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="
              fixed inset-0 z-50 flex items-end sm:items-center justify-center px-0 sm:px-4
              pointer-events-none
            "
          >
            <div
              className="
                relative w-full sm:max-w-[480px] bg-[#111111] border border-white/[0.09]
                rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden pointer-events-auto
                max-h-[90dvh] overflow-y-auto
              "
              onClick={(e) => e.stopPropagation()}
            >
              {/* ── Header ─────────────────────────────────────────────────── */}
              <div
                className="px-6 py-4 flex items-center justify-between border-b border-white/[0.07]"
                style={{ borderTopColor: color, borderTopWidth: 2 }}
              >
                <div className="flex items-center gap-2">
                  <SendHorizonal size={16} style={{ color }} />
                  <h2 className="text-white font-semibold text-sm">
                    {isMonitoring ? "Monitoring Deposit" : `Send ${sendToken}`}
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="text-gray-500 hover:text-white transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* ── Monitoring view ─────────────────────────────────────────── */}
              {isMonitoring ? (
                <div className="px-6 py-10 flex flex-col items-center gap-6 text-center">
                  {monitoringStatus === "completed" ? (
                    <>
                      <CheckCircle2 size={56} className="text-emerald-400" />
                      <div>
                        <p className="text-white font-semibold text-lg">Payout sent!</p>
                        <p className="text-gray-400 text-sm mt-1">
                          Your {receiveCurrency} is on its way to your bank account.
                        </p>
                      </div>
                      <button
                        onClick={onClose}
                        className="mt-2 px-6 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-400 transition-colors cursor-pointer"
                      >
                        Done
                      </button>
                    </>
                  ) : monitoringStatus === "failed" ? (
                    <>
                      <XCircle size={56} className="text-red-400" />
                      <div>
                        <p className="text-white font-semibold text-lg">Transfer failed</p>
                        <p className="text-gray-400 text-sm mt-1">
                          The on-chain deposit wasn&apos;t detected or the payout failed. Please contact support.
                        </p>
                      </div>
                      <button
                        onClick={onClose}
                        className="mt-2 px-6 py-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-500/30 transition-colors cursor-pointer"
                      >
                        Close
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Animated scanning rings */}
                      <div className="relative flex items-center justify-center w-24 h-24">
                        {[0, 1, 2].map((i) => (
                          <motion.div
                            key={i}
                            className="absolute rounded-full border-2"
                            style={{ borderColor: color }}
                            initial={{ opacity: 0.6, scale: 0.6 }}
                            animate={{ opacity: 0, scale: 1.8 }}
                            transition={{
                              duration: 2.2,
                              repeat: Infinity,
                              delay: i * 0.7,
                              ease: "easeOut",
                            }}
                          />
                        ))}
                        <div
                          className="w-14 h-14 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: `${color}22`, border: `2px solid ${color}` }}
                        >
                          <Loader2 size={24} style={{ color }} className="animate-spin" />
                        </div>
                      </div>

                      <div>
                        <p className="text-white font-semibold text-base">
                          Watching the blockchain…
                        </p>
                        <p className="text-gray-400 text-sm mt-1 max-w-[300px]">
                          Checking every few seconds for your{" "}
                          <span style={{ color }} className="font-medium">{sendAmount} {sendToken}</span>{" "}
                          deposit. The fiat payout will trigger automatically once confirmed.
                        </p>
                      </div>

                      <p className="text-gray-600 text-xs">
                        You can close this — monitoring continues in the background.
                      </p>
                    </>
                  )}
                </div>
              ) : (
              /* ── Normal deposit view ──────────────────────────────────────── */
              <div className="px-6 py-6 flex flex-col gap-6">

                {/* Transfer summary */}
                <div className="bg-[#1a1a1a] border border-white/[0.07] rounded-xl p-4 flex flex-col gap-3">
                  <p className="text-gray-400 text-xs font-medium uppercase tracking-widest">
                    Transfer Summary
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-white">{sendAmount}</span>
                    <span
                      className="text-lg font-semibold"
                      style={{ color }}
                    >
                      {sendToken}
                    </span>
                    <span className="ml-auto text-right">
                      <span className="block text-gray-500 text-[11px] uppercase tracking-wider leading-none mb-0.5">You receive</span>
                      <span className="text-white text-sm font-semibold">
                        {receiveAmount.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        {receiveCurrency}
                      </span>
                    </span>
                  </div>
                  <p className="text-gray-500 text-xs">{TOKEN_LABELS[sendToken]}</p>
                </div>

                {/* Deposit address / QR */}
                {addressLoading ? (
                  <div className="flex flex-col items-center gap-3 py-8 text-gray-500">
                    <Loader2 size={24} className="animate-spin" />
                    <p className="text-sm">Loading deposit address…</p>
                  </div>
                ) : addressError ? (
                  <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
                    <AlertCircle size={18} className="mt-0.5 shrink-0" />
                    <p>{addressError}</p>
                  </div>
                ) : depositAddress ? (
                  <div className="flex flex-col gap-4">
                    {/* Address label */}
                    <div>
                      <p className="text-gray-400 text-xs font-medium uppercase tracking-widest mb-2">
                        Send exactly <span className="text-white">{sendAmount} {sendToken}</span> to
                        {depositAddress.label ? (
                          <span className="text-[#f97316] ml-1">({depositAddress.label})</span>
                        ) : null}
                      </p>

                      {/* Address box + copy */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-[#1a1a1a] border border-white/[0.08] rounded-xl px-4 py-3">
                          <p className="text-white text-[13px] font-mono break-all leading-relaxed">
                            {depositAddress.address}
                          </p>
                        </div>
                        <button
                          onClick={handleCopy}
                          title="Copy address"
                          className="
                            shrink-0 w-10 h-10 rounded-xl flex items-center justify-center
                            border border-white/[0.08] bg-[#1a1a1a]
                            hover:border-white/20 hover:bg-[#222] transition-all duration-150
                            cursor-pointer
                          "
                        >
                          {copied
                            ? <Check size={16} className="text-emerald-400" />
                            : <Copy size={16} className="text-gray-400" />
                          }
                        </button>
                      </div>

                      {copied && (
                        <motion.p
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-emerald-400 text-xs mt-1.5"
                        >
                          ✓ Address copied to clipboard
                        </motion.p>
                      )}
                    </div>

                    {/* QR Code */}
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-gray-500 text-xs uppercase tracking-wider">
                        Or scan QR code
                      </p>
                      <div
                        className="p-4 bg-white rounded-2xl shadow-lg"
                        style={{ width: "fit-content" }}
                      >
                        <QRCode
                          value={depositAddress.address}
                          size={160}
                          bgColor="#ffffff"
                          fgColor="#000000"
                          level="M"
                        />
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Warning */}
                <div className="flex items-start gap-2 text-yellow-500/80 text-xs bg-yellow-500/5 border border-yellow-500/15 rounded-xl p-3">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  <p>
                    Only send <strong>{sendToken}</strong> to this address. Sending any other
                    token may result in permanent loss of funds.
                    Once your transaction is confirmed on-chain the fiat payout
                    will begin <strong>automatically</strong> — no further action needed.
                  </p>
                </div>

                {/* Confirm button */}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={onConfirm}
                  disabled={isConfirming || !!addressError || addressLoading || !depositAddress}
                  className="
                    w-full py-3.5 rounded-xl text-sm font-semibold
                    flex items-center justify-center gap-2
                    transition-all duration-200 cursor-pointer
                    disabled:opacity-40 disabled:cursor-not-allowed
                  "
                  style={{
                    backgroundColor: color,
                    color: "#fff",
                    boxShadow: `0 0 24px ${color}33`,
                  }}
                >
                  {isConfirming ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Submitting transfer…
                    </>
                  ) : (
                    <>
                      <SendHorizonal size={16} />
                      I&apos;ve made the deposit
                    </>
                  )}
                </motion.button>
              </div>
              )} {/* end !isMonitoring */}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
