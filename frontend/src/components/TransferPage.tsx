"use client";

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpDown, Zap } from "lucide-react";

import Navbar from "@/components/Navbar";
import TransferCard, { SendToken } from "@/components/TransferCard";
import ReceiveCard from "@/components/ReceiveCard";
import BankSelector, { Bank } from "@/components/BankSelector";
import PaymentMethodSelector, {
  PaymentMethodId,
} from "@/components/PaymentMethodSelector";

// ─── Constants ────────────────────────────────────────────────────────────────

/** STX/USD exchange rate — replace with live API later */
const STX_USD_RATE = 1.23;

/** USD rates per send token — replace with live API later */
const TOKEN_USD_RATES: Record<SendToken, number> = {
  STX: 1.23,
  USDCx: 1.0,
  BTC: 85000,
};

/** Fee multiplier per payment method (deducted from output) */
const FEE_RATES: Record<PaymentMethodId, number> = {
  instant: 0.015,
  same_day: 0.008,
  standard: 0.003,
};

/** Minimum receive amount per currency (USD-denominated base) */
const MIN_RECEIVE: Record<string, number> = {
  NGN: 1550,
  GHS: 14,
  KES: 132,
};

type Currency = "NGN" | "GHS" | "KES";

// ─── Available Balance ─────────────────────────────────────────────────────────

function AvailableBalance() {
  const stxBalance = 12450.567;
  const usdBalance = (stxBalance * STX_USD_RATE).toFixed(2);

  return (
    <motion.p
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.4 }}
      className="text-sm text-gray-400 mt-2"
    >
      Available Balance:{" "}
      <span className="text-white font-semibold">
        {stxBalance.toLocaleString("en-US", { minimumFractionDigits: 3 })} STX
      </span>
      <span className="text-gray-500 mx-1.5">≈</span>
      <span className="text-[#f97316] font-medium">
        ${parseFloat(usdBalance).toLocaleString("en-US", { minimumFractionDigits: 2 })}
      </span>
    </motion.p>
  );
}

// ─── Hero Heading ─────────────────────────────────────────────────────────────

function HeroHeading() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: "easeOut" }}
      className="text-center mb-8"
    >
      <h1 className="text-4xl font-bold text-white leading-tight tracking-tight">
        Bridge between Crypto
        <br />
        and local bank accounts
      </h1>
      <AvailableBalance />
    </motion.div>
  );
}

// ─── Swap Direction Button ─────────────────────────────────────────────────────

function SwapButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex justify-center my-[-2px] relative z-10">
      <motion.button
        whileHover={{ scale: 1.1, rotate: 180 }}
        whileTap={{ scale: 0.92 }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
        onClick={onClick}
        aria-label="Swap transfer direction"
        className="
          w-9 h-9 rounded-full
          bg-[#1a1a1a] border border-white/15
          flex items-center justify-center
          text-gray-400 hover:text-white
          hover:border-white/30
          transition-colors duration-200
          focus:outline-none shadow-lg
        "
      >
        <ArrowUpDown size={15} />
      </motion.button>
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
      <p className="text-xs text-gray-400 text-center">
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
  amount,
  token,
  onClick,
}: {
  disabled: boolean;
  amount: string;
  token: SendToken;
  onClick: () => void;
}) {
  const label = disabled ? "Enter an amount" : `Bridge ${amount} ${token} →`;

  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.015 } : {}}
      whileTap={!disabled ? { scale: 0.985 } : {}}
      onClick={!disabled ? onClick : undefined}
      disabled={disabled}
      aria-disabled={disabled}
      className={`
        w-full rounded-xl px-4 py-3.5 text-sm font-semibold
        transition-all duration-300 focus:outline-none
        ${
          disabled
            ? "bg-[#1a1a1a] text-gray-600 border border-white/[0.05] cursor-not-allowed"
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
        >
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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId | null>(null);
  const [swapped, setSwapped] = useState(false);

  // ── Derived values ───────────────────────────────────────────────────────────

  const parsedAmount = parseFloat(sendAmount) || 0;

  /** Token → USD conversion */
  const usdEquivalent = useMemo(
    () => parsedAmount * TOKEN_USD_RATES[sendToken],
    [parsedAmount, sendToken]
  );

  /** Receive amount after fee deduction */
  const receiveAmount = useMemo(() => {
    if (!paymentMethod) return usdEquivalent;
    const fee = FEE_RATES[paymentMethod];
    return usdEquivalent * (1 - fee);
  }, [usdEquivalent, paymentMethod]);

  /** Minimum for selected currency */
  const minReceive = useMemo(() => MIN_RECEIVE[currency] ?? 1, [currency]);

  /** Form is valid when all required fields are filled */
  const isReady = useMemo(
    () =>
      parsedAmount > 0 &&
      selectedBank !== null &&
      accountNumber.length >= 10 &&
      paymentMethod !== null,
    [parsedAmount, selectedBank, accountNumber, paymentMethod]
  );

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleSwap = useCallback(() => {
    setSwapped((prev) => !prev);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!isReady) return;
    // TODO: integrate with Stacks smart contract / backend
    console.log("Initiating bridge transfer", {
      sendAmount,
      currency,
      bank: selectedBank,
      accountNumber,
      paymentMethod,
    });
  }, [isReady, sendAmount, currency, selectedBank, accountNumber, paymentMethod]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Navigation */}
      <Navbar />

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center px-4 pt-16 pb-20">
        {/* Hero */}
        <HeroHeading />

        {/* Card stack */}
        <div className="w-full max-w-[520px] flex flex-col gap-0">
          {/* Send / Receive cards with swap */}
          <div className="flex flex-col gap-0">
            <motion.div
              animate={{ order: swapped ? 2 : 0 }}
              className="relative z-20"
            >
              <TransferCard
                value={sendAmount}
                onChange={setSendAmount}
                usdEquivalent={usdEquivalent}
                token={sendToken}
                onTokenChange={setSendToken}
              />
            </motion.div>

            <SwapButton onClick={handleSwap} />

            <motion.div
              animate={{ order: swapped ? 0 : 2 }}
              className="relative z-10"
            >
              <ReceiveCard
                amount={receiveAmount}
                minimum={minReceive}
                currency={currency}
                onCurrencyChange={(c) => setCurrency(c as Currency)}
              />
            </motion.div>
          </div>

          {/* Spacer */}
          <div className="h-3" />

          {/* Bank + account number row */}
          <BankSelector
            selected={selectedBank}
            onSelect={setSelectedBank}
            accountNumber={accountNumber}
            onAccountNumberChange={setAccountNumber}
          />

          {/* Spacer */}
          <div className="h-3" />

          {/* Payment method */}
          <PaymentMethodSelector
            selected={paymentMethod}
            onSelect={setPaymentMethod}
          />

          {/* Quick transfer info */}
          <div className="h-1" />
          <QuickTransferBanner />

          {/* Spacer */}
          <div className="h-2" />

          {/* Submit */}
          <SubmitButton
            disabled={!isReady}
            amount={sendAmount}
            token={sendToken}
            onClick={handleSubmit}
          />
        </div>
      </main>
    </div>
  );
}
