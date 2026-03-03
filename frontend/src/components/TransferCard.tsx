"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TransferCardProps {
  /** Controlled value from the parent */
  value: string;
  /** Notifies parent when the user changes the amount */
  onChange: (value: string) => void;
  /** Live USD equivalent of the entered amount */
  usdEquivalent: number;
}

// ─── STX Token Badge ──────────────────────────────────────────────────────────

function STXBadge() {
  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.2, type: "spring", stiffness: 300 }}
      className="flex items-center gap-2 bg-[#1a1a1a] border border-white/10 rounded-full px-3 py-1.5"
    >
      {/* Orange dot representing STX */}
      <span className="w-4 h-4 rounded-full bg-[#f97316] shrink-0" />
      <span className="text-white text-sm font-semibold tracking-wide">STX</span>
    </motion.div>
  );
}

// ─── Amount Input ─────────────────────────────────────────────────────────────

function AmountInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      // Allow only numeric input with at most one decimal point
      if (raw === "" || /^\d*\.?\d*$/.test(raw)) {
        onChange(raw);
      }
    },
    [onChange]
  );

  return (
    <input
      type="text"
      inputMode="decimal"
      placeholder="0.00"
      value={value}
      onChange={handleChange}
      aria-label="Amount to send in STX"
      className="
        bg-transparent text-gray-500 text-2xl font-light
        placeholder:text-gray-600 w-full focus:outline-none
        focus:text-white transition-colors duration-200
        caret-[#f97316]
      "
    />
  );
}

// ─── USD Equivalent Label ─────────────────────────────────────────────────────

function USDLabel({ amount }: { amount: number }) {
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);

  return (
    <motion.p
      key={formatted}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="text-gray-500 text-sm mt-1"
    >
      {formatted}
    </motion.p>
  );
}

// ─── TransferCard ─────────────────────────────────────────────────────────────

export default function TransferCard({
  value,
  onChange,
  usdEquivalent,
}: TransferCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="
        w-full bg-[#111111] border border-white/[0.07]
        rounded-2xl px-5 py-4 flex flex-col gap-1
      "
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-gray-400 text-xs font-medium uppercase tracking-widest mb-2">
            You&apos;ll send
          </p>
          {/* Amount input */}
          <AmountInput value={value} onChange={onChange} />
          {/* USD equivalent */}
          <USDLabel amount={usdEquivalent} />
        </div>

        {/* Token badge — right aligned */}
        <div className="pt-5">
          <STXBadge />
        </div>
      </div>
    </motion.div>
  );
}
