"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpDown, Zap, SendHorizonal, Loader2 } from "lucide-react";

import Navbar from "@/components/Navbar";
import TransferCard, { SendToken } from "@/components/TransferCard";
import ReceiveCard from "@/components/ReceiveCard";
import BankSelector, { Bank } from "@/components/BankSelector";

import { createTransfer, fetchRates, RateQuote } from "@/lib/api";
import TransferModal from "@/components/TransferModal";
import { toast } from "sonner";

type Currency = "NGN" | "GHS" | "KES";




// ─── Hero Heading ─────────────────────────────────────────────────────────────

function HeroHeading() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: "easeOut" }}
      className="text-center mb-10"
    >
      <h1 className="text-3xl sm:text-5xl font-bold text-white leading-tight tracking-tight">
        Bridge between{" "}
        <span className="relative inline-block text-[#f97316]">
          Crypto
          <svg
            viewBox="0 0 120 10"
            className="absolute left-0 -bottom-2 w-full"
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M2 7 C20 2, 40 9, 60 5 C80 1, 100 8, 118 4"
              stroke="#f97316"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </span>
        <br />
        and{" "}
        <span className="relative inline-block text-[#f97316]">
          local bank
          <svg
            viewBox="0 0 200 10"
            className="absolute left-0 -bottom-2 w-full"
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M2 7 C35 2, 70 9, 105 5 C140 1, 170 8, 198 4"
              stroke="#f97316"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </span>{" "}
        accounts
      </h1>
    </motion.div>
  );
}

// ─── Arrow Divider ────────────────────────────────────────────────────────────

function ArrowDivider() {
  return (
    <div className="flex justify-center py-4 relative z-10">
      <motion.div
        animate={{ y: [0, 6, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        className="
          w-11 h-11 rounded-full
          bg-[#1a1a1a] border border-white/15
          flex items-center justify-center
          text-[#f97316] shadow-lg
        "
      >
        <ArrowUpDown size={16} />
      </motion.div>
    </div>
  );
}

// ─── Quick Transfer Banner ────────────────────────────────────────────────────

function QuickTransferBanner() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.5 }}
      className="flex items-center justify-center gap-1.5 py-1"
    >
      <Zap size={12} className="text-[#f97316] shrink-0" />
      <p className="text-sm text-gray-400 text-center">
        Quick transfers up to{" "}
        <span className="text-[#f97316] font-medium">$10,000</span>{" "}
        - no signup required!
      </p>
    </motion.div>
  );
}

// ─── Submit Button ─────────────────────────────────────────────────────────────

function SubmitButton({
  disabled,
  loading,
  amount,
  token,
  onClick,
}: {
  disabled: boolean;
  loading: boolean;
  amount: string;
  token: SendToken;
  onClick: () => void;
}) {
  const isBlocked = disabled || loading;
  const label = loading
    ? "Processing..."
    : disabled
    ? "Enter an amount"
    : `Transfer ${amount} ${token}`;

  return (
    <motion.button
      whileHover={!isBlocked ? { scale: 1.015 } : {}}
      whileTap={!isBlocked ? { scale: 0.985 } : {}}
      onClick={!isBlocked ? onClick : undefined}
      disabled={isBlocked}
      aria-disabled={isBlocked}
      className={`
        w-full rounded-xl px-4 py-4 text-base font-semibold
        transition-all duration-300 focus:outline-none
        ${
          loading
            ? "bg-[#f97316]/70 text-white cursor-not-allowed shadow-lg shadow-[#f97316]/10"
            : disabled
            ? "bg-[#1a1a1a] text-gray-600 border border-[#f97316]/20 cursor-not-allowed"
            : "bg-[#f97316] text-white hover:bg-[#ea6c0e] shadow-lg shadow-[#f97316]/20 cursor-pointer"
        }
      `}
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={label}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          className="flex items-center justify-center gap-2"
        >
          {loading ? (
            <Loader2 size={18} className="shrink-0 animate-spin" />
          ) : (
            !disabled && <SendHorizonal size={18} className="shrink-0" />
          )}
          {label}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

// ─── Transfer Page ─────────────────────────────────────────────────────────────

export default function TransferPage() {
  // ── Form state ──────────────────────────────────────────────────────────────
  const [sendAmount, setSendAmount] = useState("");
  const [sendToken, setSendToken] = useState<SendToken>("STX");
  const [currency, setCurrency] = useState<Currency>("NGN");
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // ── Live rate state ───────────────────────────────────────────────────────────

  const parsedAmount = parseFloat(sendAmount) || 0;
  const [rateQuote, setRateQuote] = useState<RateQuote | null>(null);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [baseFlwRate, setBaseFlwRate] = useState<number | null>(null);
  const rateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setRateQuote(null);
    if (parsedAmount <= 0) { setRatesLoading(false); return; }
    setRatesLoading(true);
    if (rateDebounceRef.current) clearTimeout(rateDebounceRef.current);
    rateDebounceRef.current = setTimeout(async () => {
      try {
        const quote = await fetchRates(sendToken, parsedAmount, currency);
        setRateQuote(quote);
      } catch { /* logged server-side */ }
      finally { setRatesLoading(false); }
    }, 500);
    return () => { if (rateDebounceRef.current) clearTimeout(rateDebounceRef.current); };
  }, [parsedAmount, sendToken, currency]);

  // Fetch base FLW rate on mount and whenever token/currency changes (drives minimum display)
  useEffect(() => {
    setBaseFlwRate(null);
    let cancelled = false;
    fetchRates(sendToken, 1, currency)
      .then((quote) => { if (!cancelled) setBaseFlwRate(quote.flwRate); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sendToken, currency]);

  const usdEquivalent = rateQuote?.usdAmount ?? 0;
  const receiveAmount = rateQuote?.receiveAmount ?? 0;
  const minReceive = baseFlwRate;
  const rateInfo = rateQuote
    ? { tokenPrice: rateQuote.tokenPriceUSD, flwRate: rateQuote.flwRate, token: sendToken }
    : null;

  /** Form is valid when all required fields are filled */
  const isReady = useMemo(
    () =>
      parsedAmount > 0 &&
      selectedBank !== null &&
      accountNumber.length >= 10,
    [parsedAmount, selectedBank, accountNumber]
  );

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const [showModal, setShowModal] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  /** Step 1: open the modal showing where to send crypto */
  const handleSubmit = useCallback(() => {
    if (!isReady || isLoading || !selectedBank) return;
    setShowModal(true);
  }, [isReady, isLoading, selectedBank]);

  /** Step 2: user clicked "I've sent the crypto — Confirm" inside the modal */
  const handleConfirm = useCallback(async () => {
    if (!selectedBank) return;
    setIsConfirming(true);
    try {
      const transfer = await createTransfer({
        sendAmount: parsedAmount,
        sendToken,
        receiveCurrency: currency,
        bank: selectedBank.name,
        bankCode: selectedBank.code,
        accountNumber,
      });
      console.log("Transfer created:", transfer);
      setShowModal(false);
      toast.success("Transfer submitted!", {
        description: `Your ${sendToken} transfer has been received and is being processed.`,
      });
    } catch (err) {
      console.error("Transfer failed:", err);
      toast.error("Transfer failed", {
        description: "Could not submit your transfer. Please try again.",
      });
    } finally {
      setIsConfirming(false);
    }
  }, [parsedAmount, sendToken, currency, selectedBank, accountNumber]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Transfer confirmation modal */}
      <TransferModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onConfirm={handleConfirm}
        isConfirming={isConfirming}
        sendAmount={parsedAmount}
        sendToken={sendToken}
        receiveAmount={receiveAmount}
        receiveCurrency={currency}
      />

      {/* Navigation */}
      <Navbar />

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center px-3 sm:px-4 pt-28 sm:pt-36 pb-24">
        {/* Hero */}
        <HeroHeading />

        {/* Card stack */}
        <div className="w-full max-w-[600px] flex flex-col gap-0">
          {/* Send / Receive cards */}
          <div className="flex flex-col">
            <div className="relative z-20">
              <TransferCard
                value={sendAmount}
                onChange={setSendAmount}
                usdEquivalent={usdEquivalent}
                token={sendToken}
                onTokenChange={setSendToken}
              />
            </div>

            <ArrowDivider />

            <div className="relative z-10">
              <ReceiveCard
                amount={receiveAmount}
                minimum={minReceive}
                currency={currency}
                onCurrencyChange={(c) => setCurrency(c as Currency)}
                isLoading={ratesLoading}
                rateInfo={rateInfo}
              />
            </div>
          </div>

          {/* Spacer */}
          <div className="h-4" />

          {/* Bank + account number row */}
          <BankSelector
            selected={selectedBank}
            onSelect={setSelectedBank}
            accountNumber={accountNumber}
            onAccountNumberChange={setAccountNumber}
          />

          {/* Spacer */}
          <div className="h-4" />

          {/* Quick transfer info */}
          <div className="h-1" />
          <QuickTransferBanner />

          {/* Spacer */}
          <div className="h-2" />

          {/* Submit */}
          <SubmitButton
            disabled={!isReady}
            loading={isLoading}
            amount={sendAmount}
            token={sendToken}
            onClick={handleSubmit}
          />
        </div>
      </main>
    </div>
  );
}
