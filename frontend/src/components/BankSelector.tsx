"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Search, Building2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Bank {
  id: string;
  name: string;
  country: string;
  code: string;
}

export interface BankSelectorProps {
  /** Currently selected bank (null = none selected) */
  selected: Bank | null;
  /** Notifies parent when user selects a bank */
  onSelect: (bank: Bank) => void;
  /** Account number input value */
  accountNumber: string;
  /** Notifies parent when account number changes */
  onAccountNumberChange: (value: string) => void;
}

// ─── Static Bank Data ─────────────────────────────────────────────────────────

export const BANKS: Bank[] = [
  { id: "gtb",   name: "Guaranty Trust Bank", country: "NG", code: "058" },
  { id: "uba",   name: "United Bank for Africa", country: "NG", code: "033" },
  { id: "access",name: "Access Bank", country: "NG", code: "044" },
  { id: "zenith", name: "Zenith Bank", country: "NG", code: "057" },
  { id: "first",  name: "First Bank", country: "NG", code: "011" },
  { id: "fcmb",   name: "FCMB", country: "NG", code: "214" },
  { id: "kuda",   name: "Kuda Bank", country: "NG", code: "090267" },
  { id: "opay",   name: "OPay", country: "NG", code: "999992" },
];

// ─── Bank Option ──────────────────────────────────────────────────────────────

function BankOption({
  bank,
  isSelected,
  onClick,
}: {
  bank: Bank;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileHover={{ backgroundColor: "rgba(255,255,255,0.04)" }}
      role="option"
      aria-selected={isSelected}
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 text-left
        transition-colors duration-150 rounded-lg cursor-pointer
        ${isSelected ? "bg-white/5 text-white" : "text-gray-300 hover:text-white"}
      `}
    >
      <div className="w-8 h-8 rounded-lg bg-[#222] border border-white/10 flex items-center justify-center shrink-0">
        <Building2 size={14} className="text-gray-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{bank.name}</p>
        <p className="text-xs text-gray-500">Code: {bank.code}</p>
      </div>
    </motion.button>
  );
}

// ─── Bank Dropdown ────────────────────────────────────────────────────────────

function BankDropdown({
  selected,
  onSelect,
}: {
  selected: Bank | null;
  onSelect: (bank: Bank) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Filter banks by query
  const filtered = BANKS.filter((b) =>
    b.name.toLowerCase().includes(query.toLowerCase())
  );

  function handleSelect(bank: Bank) {
    onSelect(bank);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={ref} className="relative w-full">
      {/* Trigger */}
      <motion.button
        whileTap={{ scale: 0.99 }}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Choose bank"
        className="
          w-full flex items-center justify-between
          bg-[#111111] border border-white/[0.08]
          rounded-xl px-4 py-3 text-sm
          hover:border-white/20 transition-colors duration-200
          focus:outline-none cursor-pointer
        "
      >
        <span className={selected ? "text-white" : "text-gray-500"}>
          {selected ? selected.name : "Choose bank"}
        </span>
        <ChevronDown
          size={16}
          className={`text-gray-500 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </motion.button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            aria-label="Bank list"
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="
              absolute left-0 right-0 top-full mt-2 z-50
              bg-[#161616] border border-white/[0.08]
              rounded-xl shadow-2xl overflow-hidden
            "
          >
            {/* Search */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06]">
              <Search size={14} className="text-gray-500 shrink-0" />
              <input
                autoFocus
                type="text"
                placeholder="Search bank..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="
                  flex-1 bg-transparent text-sm text-white
                  placeholder:text-gray-600 focus:outline-none
                "
              />
            </div>

            {/* List */}
            <div className="max-h-52 overflow-y-auto p-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
              {filtered.length === 0 ? (
                <p className="text-center text-gray-500 text-sm py-4">
                  No banks found
                </p>
              ) : (
                filtered.map((bank) => (
                  <BankOption
                    key={bank.id}
                    bank={bank}
                    isSelected={selected?.id === bank.id}
                    onClick={() => handleSelect(bank)}
                  />
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Account Number Input ─────────────────────────────────────────────────────

function AccountNumberInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, ""); // digits only
    onChange(raw);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      maxLength={10}
      placeholder="Enter account number"
      value={value}
      onChange={handleChange}
      aria-label="Bank account number"
      className="
        w-full bg-[#111111] border border-white/[0.08]
        rounded-xl px-4 py-3 text-sm text-white
        placeholder:text-gray-500
        hover:border-white/20 focus:border-white/30
        focus:outline-none transition-colors duration-200
        caret-[#f97316]
      "
    />
  );
}

// ─── BankSelector ─────────────────────────────────────────────────────────────

export default function BankSelector({
  selected,
  onSelect,
  accountNumber,
  onAccountNumberChange,
}: BankSelectorProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut", delay: 0.15 }}
      className="w-full flex items-stretch gap-3"
    >
      {/* Bank dropdown — wider */}
      <div className="flex-1">
        <BankDropdown selected={selected} onSelect={onSelect} />
      </div>

      {/* Account number — fixed width */}
      <div className="flex-1">
        <AccountNumberInput
          value={accountNumber}
          onChange={onAccountNumberChange}
        />
      </div>
    </motion.div>
  );
}
