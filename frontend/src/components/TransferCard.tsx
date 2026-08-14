"use client";

import { useCallback } from "react";
import { motion } from "framer-motion";

import type { AssetSpec } from "@/lib/api";
import AssetPicker, { SelectedAsset } from "@/components/AssetPicker";

export type { SelectedAsset };

interface TransferCardProps {
  /** Heading — "You'll send" when selling, "You'll receive" when buying. */
  label: string;
  /** Controlled value from the parent */
  value: string;
  /** Notifies parent when the user changes the amount */
  onChange: (value: string) => void;
  /** Live USD equivalent of the entered amount */
  usdEquivalent: number;
  /** Assets available to pick from, supplied by the backend registry */
  assets: AssetSpec[];
  /** Currently selected asset */
  selected: SelectedAsset;
  /** Notifies parent when the asset changes */
  onAssetChange: (asset: SelectedAsset) => void;
  /** Read-only mode (the computed side of a quote) */
  readOnly?: boolean;
}

// ─── Amount Input ─────────────────────────────────────────────────────────────

function AmountInput({
  value,
  onChange,
  token,
  readOnly,
}: {
  value: string;
  onChange: (v: string) => void;
  token: string;
  readOnly?: boolean;
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
      readOnly={readOnly}
      aria-label={`Amount in ${token}`}
      className={`
        bg-transparent text-3xl font-light
        placeholder:text-gray-600 w-full focus:outline-none
        transition-colors duration-200 caret-[#f97316]
        ${readOnly ? "text-white cursor-default" : "text-gray-500 focus:text-white"}
      `}
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
      className="text-gray-500 text-base mt-1"
    >
      {formatted}
    </motion.p>
  );
}

// ─── TransferCard ─────────────────────────────────────────────────────────────

export default function TransferCard({
  label,
  value,
  onChange,
  usdEquivalent,
  assets,
  selected,
  onAssetChange,
  readOnly,
}: TransferCardProps) {
  const network = assets.find(
    (a) => a.token === selected.token && a.chain === selected.chain
  )?.network;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="
        w-full bg-[#111111] border border-white/[0.07]
        rounded-2xl px-6 py-5 flex flex-col gap-1
      "
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-gray-400 text-xs font-medium uppercase tracking-widest mb-2">
            {label}
          </p>
          <AmountInput
            value={value}
            onChange={onChange}
            token={selected.token}
            readOnly={readOnly}
          />
          <USDLabel amount={usdEquivalent} />
        </div>

        <div className="pt-5 flex flex-col items-end gap-1.5">
          <AssetPicker assets={assets} selected={selected} onSelect={onAssetChange} />
          {network && (
            <span className="text-[11px] text-gray-500 pr-1 max-w-[150px] truncate text-right">
              {network}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
