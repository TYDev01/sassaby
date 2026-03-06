"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check, X, Loader2, AlertCircle, SendHorizonal } from "lucide-react";
import { SendToken, fetchDepositAddresses, DepositAddress } from "@/lib/api";

const QRCode = dynamic(() => import("react-qr-code"), { ssr: false });

// ─── Props ────────────────────────────────────────────────────────────────────

interface TransferModalProps {
  open: boolean;
  onClose: () => void;
  /** Called once the user confirms they've sent the crypto. */
  onConfirm: () => void;
  isConfirming: boolean;

  sendAmount: number;
  sendToken: SendToken;
  receiveAmount: number;
  receiveCurrency: string;
  /** 1.5% fee amount in USD */
  feeUSD: number;
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
  sendAmount,
  sendToken,
  receiveAmount,
  receiveCurrency,
  feeUSD,
}: TransferModalProps) {
  const [depositAddress, setDepositAddress] = useState<DepositAddress | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
            onClick={onClose}
          />

          {/* Modal panel */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 20 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="
              fixed inset-0 z-50 flex items-center justify-center px-4
              pointer-events-none
            "
          >
            <div
              className="
                relative w-full max-w-[480px] bg-[#111111] border border-white/[0.09]
                rounded-2xl shadow-2xl overflow-hidden pointer-events-auto
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
                  <h2 className="text-white font-semibold text-sm">Send {sendToken}</h2>
                </div>
                <button
                  onClick={onClose}
                  className="text-gray-500 hover:text-white transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* ── Body ───────────────────────────────────────────────────── */}
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
                  </div>
                  <p className="text-gray-500 text-xs">{TOKEN_LABELS[sendToken]}</p>

                  <div className="border-t border-white/[0.06] pt-3 mt-1 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-gray-500 text-[11px] uppercase tracking-wider mb-0.5">
                        You receive
                      </p>
                      <p className="text-white text-sm font-semibold">
                        {receiveAmount.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        {receiveCurrency}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-[11px] uppercase tracking-wider mb-0.5">
                        Protocol fee (1.5%)
                      </p>
                      <p className="text-white text-sm font-semibold">
                        ${feeUSD.toFixed(4)} USD
                      </p>
                    </div>
                  </div>
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
                          size={180}
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
                      Processing…
                    </>
                  ) : (
                    <>
                      <SendHorizonal size={16} />
                      I&apos;ve sent the crypto — Confirm Transfer
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
