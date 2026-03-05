"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import Image from "next/image";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SendToken = "STX" | "USDCx" | "BTC";

interface TransferCardProps {
  /** Controlled value from the parent */
  value: string;
  /** Notifies parent when the user changes the amount */
  onChange: (value: string) => void;
  /** Live USD equivalent of the entered amount */
  usdEquivalent: number;
  /** Selected send token */
  token: SendToken;
  /** Notifies parent when token changes */
  onTokenChange: (token: SendToken) => void;
}

const TOKEN_IMAGES: Record<SendToken, string> = {
  STX: "/stx.png",
  USDCx: "/usdcx.png",
  BTC: "/btc.png",
};

const TOKENS: SendToken[] = ["STX", "USDCx", "BTC"];

// ─── Token Icon ────────────────────────────────────────────────────────────────

function TokenIcon({ token, size = 20 }: { token: SendToken; size?: number }) {
  return (
    <Image
      src={TOKEN_IMAGES[token]}
      alt={token}
      width={size}
      height={size}
      className="rounded-full shrink-0 object-cover"
    />
  );
}

// ─── Token Dropdown ───────────────────────────────────────────────────────────

function TokenDropdown({
  selected,
  onSelect,
}: {
  selected: SendToken;
  onSelect: (t: SendToken) => void;
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

  return (
    <div ref={ref} className="relative">
      <motion.button
        whileTap={{ scale: 0.96 }}
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Select token"
        aria-expanded={open}
        className="
          flex items-center gap-2 bg-[#1a1a1a] border border-white/10
          rounded-full px-4 py-2 focus:outline-none
          hover:border-white/20 transition-colors duration-200 cursor-pointer
        "
      >
        <TokenIcon token={selected} size={20} />
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

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            aria-label="Token options"
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
            {TOKENS.map((t) => (
              <li key={t}>
                <button
                  role="option"
                  aria-selected={t === selected}
                  onClick={() => {
                    onSelect(t);
                    setOpen(false);
                  }}
                  className={`
                    w-full flex items-center gap-2 px-4 py-2.5 text-sm
                    transition-colors duration-150 cursor-pointer
                    ${
                      t === selected
                        ? "text-white bg-white/5"
                        : "text-gray-400 hover:text-white hover:bg-white/5"
                    }
                  `}
                >
                  <TokenIcon token={t} size={18} />
                  {t}
                </button>
              </li>
            ))}
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
}: {
  value: string;
  onChange: (v: string) => void;
  token: SendToken;
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
      aria-label={`Amount to send in ${token}`}
      className="
        bg-transparent text-gray-500 text-3xl font-light
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
      className="text-gray-500 text-base mt-1"
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
  token,
  onTokenChange,
}: TransferCardProps) {
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
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-gray-400 text-xs font-medium uppercase tracking-widest mb-2">
            You&apos;ll send
          </p>
          {/* Amount input */}
          <AmountInput value={value} onChange={onChange} token={token} />
          {/* USD equivalent */}
          <USDLabel amount={usdEquivalent} />
        </div>

        {/* Token selector — right aligned */}
        <div className="pt-5">
          <TokenDropdown selected={token} onSelect={onTokenChange} />
        </div>
      </div>
    </motion.div>
  );
}
