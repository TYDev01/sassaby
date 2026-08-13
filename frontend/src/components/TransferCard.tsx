"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import Image from "next/image";

import type { AssetSpec } from "@/lib/api";

/**
 * An asset is a (token, chain) pair, never a bare symbol — USDT on Tron and
 * USDT on Ethereum are different assets with different addresses and fees, and
 * conflating them is how a deposit goes to the wrong network.
 */
export interface SelectedAsset {
  token: string;
  chain: string;
}

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

/** An icon exists only for BTC; everything else gets a lettered chip. */
const TOKEN_IMAGES: Record<string, string> = {
  BTC: "/btc.png",
};

function assetKey(a: SelectedAsset): string {
  return `${a.token}:${a.chain}`;
}

// ─── Token Icon ────────────────────────────────────────────────────────────────

function TokenIcon({ token, size = 20 }: { token: string; size?: number }) {
  const src = TOKEN_IMAGES[token];
  if (src) {
    return (
      <Image
        src={src}
        alt={token}
        width={size}
        height={size}
        className="rounded-full shrink-0 object-cover"
      />
    );
  }
  return (
    <span
      style={{ width: size, height: size, fontSize: Math.max(8, size * 0.4) }}
      className="rounded-full shrink-0 bg-white/[0.08] border border-white/10 flex items-center justify-center font-bold text-gray-300"
    >
      {token.slice(0, 3)}
    </span>
  );
}

// ─── Asset Dropdown ───────────────────────────────────────────────────────────

function AssetDropdown({
  assets,
  selected,
  onSelect,
}: {
  assets: AssetSpec[];
  selected: SelectedAsset;
  onSelect: (a: SelectedAsset) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedKey = assetKey(selected);

  return (
    <div ref={ref} className="relative">
      <motion.button
        whileTap={{ scale: 0.96 }}
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Select asset and network"
        aria-expanded={open}
        className="
          flex items-center gap-2 bg-[#1a1a1a] border border-white/10
          rounded-full px-4 py-2 focus:outline-none
          hover:border-white/20 transition-colors duration-200 cursor-pointer
        "
      >
        <TokenIcon token={selected.token} size={20} />
        <span className="text-white text-base font-semibold tracking-wide">
          {selected.token}
        </span>
        <ChevronDown
          size={14}
          className={`text-gray-400 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            aria-label="Asset options"
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="
              absolute right-0 top-full mt-2 z-50
              bg-[#1a1a1a] border border-white/10 rounded-xl
              py-1 min-w-[230px] max-h-[320px] overflow-y-auto shadow-xl
            "
          >
            {assets.map((a) => {
              const key = `${a.token}:${a.chain}`;
              const isSelected = key === selectedKey;
              return (
                <li key={key}>
                  <button
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onSelect({ token: a.token, chain: a.chain });
                      setOpen(false);
                    }}
                    className={`
                      w-full flex items-center gap-2.5 px-4 py-2.5 text-sm
                      transition-colors duration-150 cursor-pointer text-left
                      ${
                        isSelected
                          ? "text-white bg-white/5"
                          : "text-gray-400 hover:text-white hover:bg-white/5"
                      }
                    `}
                  >
                    <TokenIcon token={a.token} size={18} />
                    <span className="font-medium">{a.token}</span>
                    {/* The network is the load-bearing half of the choice, so it
                        is always shown, never hidden behind the symbol. */}
                    <span className="ml-auto text-[11px] text-gray-500 truncate">
                      {a.network}
                    </span>
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
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
          <AssetDropdown assets={assets} selected={selected} onSelect={onAssetChange} />
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
