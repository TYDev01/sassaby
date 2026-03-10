"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  Search,
  Building2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
} from "lucide-react";
import { fetchBanks, verifyAccount, FlwBank } from "@/lib/api";

// ─── Re-export Bank type (aligned with Flutterwave) ──────────────────────────

export interface Bank {
  id: string;   // string version of FLW numeric id
  name: string;
  code: string; // bank code used for account resolution
  country: string;
}

export interface BankSelectorProps {
  selected: Bank | null;
  onSelect: (bank: Bank) => void;
  accountNumber: string;
  onAccountNumberChange: (value: string) => void;
  /** Called whenever the resolved account name changes (null = unresolved) */
  onAccountNameResolved?: (name: string | null) => void;
}

// ─── Map FLW bank → our Bank shape ───────────────────────────────────────────

function toBank(b: FlwBank): Bank {
  return { id: String(b.id), name: b.name, code: b.code, country: "NG" };
}

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

// ─── Bank Dropdown (modal) ────────────────────────────────────────────────────

function BankDropdown({
  selected,
  onSelect,
  banks,
  loading,
  loadError,
  onRetry,
}: {
  selected: Bank | null;
  onSelect: (bank: Bank) => void;
  banks: Bank[];
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const filtered = banks.filter(
    (b) =>
      b.name.toLowerCase().includes(query.toLowerCase()) ||
      b.code.includes(query)
  );

  function handleSelect(bank: Bank) {
    onSelect(bank);
    setOpen(false);
    setQuery("");
  }

  function handleClose() {
    setOpen(false);
    setQuery("");
  }

  const modal = (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.06 }}
            onClick={handleClose}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
          />

          {/* Modal panel */}
          <motion.div
            key="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Choose a bank"
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ duration: 0.1, ease: "easeOut" }}
            className="
              fixed z-50 inset-x-4 top-1/2 -translate-y-1/2
              sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[420px]
              bg-[#161616] border border-white/[0.08] border-t-[#f97316]
              rounded-2xl shadow-2xl overflow-hidden
              flex flex-col max-h-[70vh]
            "
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <span className="text-sm font-semibold text-white">Choose Bank</span>
              <button
                onClick={handleClose}
                aria-label="Close"
                className="text-gray-500 hover:text-white transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Search */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06]">
              <Search size={14} className="text-gray-500 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search bank name or code…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 bg-transparent text-sm text-white placeholder:text-gray-600 focus:outline-none"
              />
              {query && (
                <button onClick={() => setQuery("")} className="text-gray-600 hover:text-gray-400 cursor-pointer">
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Bank list */}
            <div className="overflow-y-auto flex-1 p-2">
              {loadError ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <AlertCircle size={20} className="text-red-400" />
                  <p className="text-red-400 text-xs">{loadError}</p>
                  <button
                    onClick={() => { onRetry(); handleClose(); }}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white mt-1 cursor-pointer"
                  >
                    <RefreshCw size={12} /> Retry
                  </button>
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-center text-gray-500 text-sm py-8">No banks found</p>
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
        </>
      )}
    </AnimatePresence>
  );

  return (
    <div className="relative w-full">
      {/* Trigger */}
      <motion.button
        whileTap={{ scale: 0.99 }}
        onClick={() => !loading && setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Choose bank"
        disabled={loading}
        className="
          w-full flex items-center justify-between
          bg-[#111111] border border-white/[0.08]
          rounded-xl px-4 py-3 text-sm
          hover:border-white/20 transition-colors duration-200
          focus:outline-none cursor-pointer
          disabled:opacity-60 disabled:cursor-not-allowed
        "
      >
        <span className={selected ? "text-white" : "text-gray-500"}>
          {loading ? "Loading banks…" : selected ? selected.name : "Choose bank"}
        </span>
        {loading ? (
          <Loader2 size={15} className="text-gray-500 animate-spin" />
        ) : (
          <ChevronDown size={16} className="text-gray-500" />
        )}
      </motion.button>

      {/* Portal modal */}
      {typeof window !== "undefined" && createPortal(modal, document.body)}
    </div>
  );
}

// ─── Account Name Badge ───────────────────────────────────────────────────────

type ResolveState = "idle" | "loading" | "success" | "error";

function AccountNameBadge({
  state,
  name,
  error,
}: {
  state: ResolveState;
  name: string | null;
  error: string | null;
}) {
  return (
    <AnimatePresence mode="wait">
      {state === "loading" && (
        <motion.div
          key="loading"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="flex items-center gap-1.5 text-xs text-gray-400"
        >
          <Loader2 size={11} className="animate-spin" />
          Verifying account…
        </motion.div>
      )}
      {state === "success" && name && (
        <motion.div
          key="success"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="flex items-center gap-1.5 text-xs text-emerald-400"
        >
          <CheckCircle2 size={12} />
          <span className="font-medium">{name}</span>
        </motion.div>
      )}
      {state === "error" && error && (
        <motion.div
          key="error"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="flex items-center gap-1.5 text-xs text-red-400"
        >
          <AlertCircle size={12} />
          {error}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Account Number Input ─────────────────────────────────────────────────────

function AccountNumberInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      maxLength={10}
      placeholder={disabled ? "Select a bank first" : "Enter account number"}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      disabled={disabled}
      aria-label="Bank account number"
      className="
        w-full bg-[#111111] border border-white/[0.08]
        rounded-xl px-4 py-3 text-sm text-white
        placeholder:text-gray-500
        hover:border-white/20 focus:border-white/30
        focus:outline-none transition-colors duration-200
        caret-[#f97316]
        disabled:opacity-50 disabled:cursor-not-allowed
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
  onAccountNameResolved,
}: BankSelectorProps) {
  // Bank list state
  const [banks, setBanks] = useState<Bank[]>([]);
  const [banksLoading, setBanksLoading] = useState(true);
  const [banksError, setBanksError] = useState<string | null>(null);

  // Account resolution state
  const [resolveState, setResolveState] = useState<ResolveState>("idle");
  const [accountName, setAccountName] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load banks from backend on mount ─────────────────────────────────────
  const loadBanks = useCallback(async () => {
    setBanksLoading(true);
    setBanksError(null);
    try {
      const raw = await fetchBanks("NG");
      setBanks(raw.map(toBank));
    } catch {
      setBanksError("Could not load banks. Check your connection.");
    } finally {
      setBanksLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBanks();
  }, [loadBanks]);

  // ── Resolve account name once bank + 10-digit account number are ready ────
  useEffect(() => {
    setAccountName(null);
    setResolveError(null);
    setResolveState("idle");
    onAccountNameResolved?.(null);

    if (!selected || accountNumber.length !== 10) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setResolveState("loading");
      try {
        const result = await verifyAccount(accountNumber, selected.code);
        setAccountName(result.account_name);
        setResolveState("success");
        onAccountNameResolved?.(result.account_name);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Account not found.";
        // If the bank simply doesn't support verification, stay quiet — user can still proceed
        const isUnsupported =
          msg.toLowerCase().includes("not supported") ||
          msg.toLowerCase().includes("can still proceed");
        if (isUnsupported) {
          setResolveState("idle");
          onAccountNameResolved?.(null);
        } else {
          setResolveError(msg);
          setResolveState("error");
          onAccountNameResolved?.(null);
        }
      }
    }, 600);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [selected, accountNumber, onAccountNameResolved]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut", delay: 0.15 }}
      className="w-full flex flex-col gap-3"
    >
      {/* Row: bank dropdown + account number */}
      <div className="flex flex-col sm:flex-row items-stretch gap-3">
        <div className="flex-1">
          <BankDropdown
            selected={selected}
            onSelect={onSelect}
            banks={banks}
            loading={banksLoading}
            loadError={banksError}
            onRetry={loadBanks}
          />
        </div>
        <div className="flex-1">
          <AccountNumberInput
            value={accountNumber}
            onChange={onAccountNumberChange}
            disabled={!selected}
          />
        </div>
      </div>

      {/* Account name / verification feedback */}
      <div className="px-1">
        <AccountNameBadge
          state={resolveState}
          name={accountName}
          error={resolveError}
        />
      </div>
    </motion.div>
  );
}
