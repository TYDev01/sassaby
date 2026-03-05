"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import Image from "next/image";

// ─── Types ────────────────────────────────────────────────────────────────────

type Currency = "NGN" | "GHS" | "KES";

interface ReceiveCardProps {
  /** Calculated receive amount (controlled by parent) */
  amount: number;
  /** Minimum receivable amount — null while the live rate is loading */
  minimum: number | null;
  /** Selected currency */
  currency: Currency;
  /** Notifies parent when currency changes */
  onCurrencyChange: (currency: Currency) => void;
  /** Shows a loading skeleton while rates are being fetched */
  isLoading?: boolean;
  /** Live rate info to display below the amount */
  rateInfo?: { tokenPrice: number; flwRate: number; token: string } | null;
}

const CURRENCY_IMAGES: Record<Currency, string> = {
  NGN: "/ngn.png",
  GHS: "/ghs.png",
  KES: "/kes.png",
};

const CURRENCIES: Currency[] = ["NGN", "GHS", "KES"];

// ─── Currency Icon ────────────────────────────────────────────────────────────

function CurrencyIcon({ currency, size = 20 }: { currency: Currency; size?: number }) {
  return (
    <Image
      src={CURRENCY_IMAGES[currency]}
      alt={currency}
      width={size}
      height={size}
      className="rounded-full shrink-0 object-cover"
    />
  );
}

// ─── Currency Dropdown ────────────────────────────────────────────────────────

function CurrencyDropdown({
  selected,
  onSelect,
}: {
  selected: Currency;
  onSelect: (c: Currency) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <motion.button
        whileTap={{ scale: 0.96 }}
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Select currency"
        aria-expanded={open}
        className="
          flex items-center gap-2 bg-[#1a1a1a] border border-white/10
          rounded-full px-4 py-2 focus:outline-none
          hover:border-white/20 transition-colors duration-200 cursor-pointer
        "
      >
        <CurrencyIcon currency={selected} size={20} />
        <span className="text-white text-base font-semibold tracking-wide">
          {selected}
        </span>
        <ChevronDown
          size={14}
          className={`text-gray-400 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </motion.button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            aria-label="Currency options"
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="
              absolute right-0 top-full mt-2 z-50
              bg-[#1a1a1a] border border-white/10 rounded-xl
              py-1 min-w-[110px] shadow-xl
            "
          >
            {CURRENCIES.map((c) => (
              <li key={c}>
                <button
                  role="option"
                  aria-selected={c === selected}
                  onClick={() => {
                    onSelect(c);
                    setOpen(false);
                  }}
                  className={`
                    w-full flex items-center gap-2 px-4 py-2.5 text-sm
                    transition-colors duration-150 cursor-pointer
                    ${
                      c === selected
                        ? "text-white bg-white/5"
                        : "text-gray-400 hover:text-white hover:bg-white/5"
                    }
                  `}
                >
                  <CurrencyIcon currency={c} size={18} />
                  {c}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Amount Display ───────────────────────────────────────────────────────────

function AmountDisplay({ amount, isLoading }: { amount: number; isLoading?: boolean }) {
  if (isLoading) {
    return <div className="h-9 w-36 rounded-lg bg-white/5 animate-pulse" />;
  }
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (
    <motion.p
      key={formatted}
      initial={{ opacity: 0.4, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="text-white text-3xl font-light"
    >
      {formatted}
    </motion.p>
  );
}

// ─── Minimum Label ────────────────────────────────────────────────────────────

function MinimumLabel({
  minimum,
  currency,
  rateInfo,
  isLoading,
}: {
  minimum: number | null;
  currency: Currency;
  rateInfo?: { tokenPrice: number; flwRate: number; token: string } | null;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return <div className="h-3.5 w-28 rounded bg-white/5 animate-pulse mt-2" />;
  }
  if (rateInfo) {
    const fmt = (n: number) =>
      n >= 1000
        ? n.toLocaleString("en-US", { maximumFractionDigits: 0 })
        : n.toLocaleString("en-US", { maximumFractionDigits: 4 });
    return (
      <p className="text-gray-500 text-xs mt-1.5">
        1 {rateInfo.token} ≈ ${fmt(rateInfo.tokenPrice)}
        <span className="mx-1.5 text-gray-600">·</span>
        1 USD ≈ {fmt(rateInfo.flwRate)} {currency}
      </p>
    );
  }
  if (minimum === null) {
    return <div className="h-3.5 w-28 rounded bg-white/5 animate-pulse mt-2" />;
  }
  return (
    <p className="text-gray-500 text-base mt-1">
      Min:{" "}
      <span className="text-gray-400">
        {minimum.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
      </span>
    </p>
  );
}

// ─── ReceiveCard ──────────────────────────────────────────────────────────────

export default function ReceiveCard({
  amount,
  minimum,
  currency,
  onCurrencyChange,
  isLoading,
  rateInfo,
}: ReceiveCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut", delay: 0.1 }}
      className="
        w-full bg-[#111111] border border-white/[0.07]
        rounded-2xl px-6 py-5
      "
    >
      {/* Header */}
      <p className="text-gray-400 text-xs font-medium uppercase tracking-widest mb-3">
        You&apos;ll receive
      </p>

      {/* Amount row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <AmountDisplay amount={amount} isLoading={isLoading} />
          <MinimumLabel
            minimum={minimum}
            currency={currency}
            rateInfo={rateInfo}
            isLoading={isLoading}
          />
        </div>

        {/* Currency selector */}
        <div className="pt-1">
          <CurrencyDropdown selected={currency} onSelect={onCurrencyChange} />
        </div>
      </div>
    </motion.div>
  );
}
