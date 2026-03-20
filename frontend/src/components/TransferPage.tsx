"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpDown, Zap, SendHorizonal, Loader2 } from "lucide-react";

import Navbar from "@/components/Navbar";
import TransferCard, { SendToken } from "@/components/TransferCard";
import ReceiveCard from "@/components/ReceiveCard";
import BankSelector, { Bank } from "@/components/BankSelector";

import { createTransfer, fetchRates, RateQuote, TransferStatus } from "@/lib/api";
import TransferModal from "@/components/TransferModal";
import { toast } from "sonner";
import { useWallet } from "@/lib/wallet";

type Currency = "NGN" | "GHS" | "KES";




// ─── Hero Heading ─────────────────────────────────────────────────────────────

const CRYPTO_WORDS = ["STX", "USDCx", "BTC"];
const FIAT_WORDS = ["NGN", "GHS", "KES"];

function CyclingWord({ words, delay = 0 }: { words: string[]; delay?: number }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;
    const timeoutId = setTimeout(() => {
      intervalId = setInterval(() => setIndex((i) => (i + 1) % words.length), 2000);
    }, delay);
    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [words, delay]);

  return (
    <span className="relative inline-block text-[#f97316]" style={{ minWidth: "4ch" }}>
      <AnimatePresence mode="wait">
        <motion.span
          key={words[index]}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
          className="inline-block"
        >
          {words[index]}
        </motion.span>
      </AnimatePresence>
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
  );
}

function HeroHeading() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: "easeOut" }}
      className="text-center mb-5"
    >
      <h1 className="text-3xl sm:text-5xl font-bold text-white leading-tight tracking-tight">
        Bridge between{" "}
        <CyclingWord words={CRYPTO_WORDS} />
        <br />
        and{" "}
        <CyclingWord words={FIAT_WORDS} delay={1000} />{" "}
        accounts
      </h1>
    </motion.div>
  );
}

// ─── Arrow Divider ────────────────────────────────────────────────────────────

function ArrowDivider() {
  return (
    <div className="flex justify-center py-2 relative z-10">
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
  const { addresses } = useWallet();

  // ── Form state ──────────────────────────────────────────────────────────────
  const [sendAmount, setSendAmount] = useState("");
  const [sendToken, setSendToken] = useState<SendToken>("STX");
  const [currency, setCurrency] = useState<Currency>("NGN");
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  const [accountNumber, setAccountNumber] = useState("");

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
  const [isLoading, setIsLoading] = useState(false);
  const [pendingTransfer, setPendingTransfer] = useState<{
    id: string;
    depositAddress: string;
  } | null>(null);
  const [monitoringTransferId, setMonitoringTransferId] = useState<string | null>(null);

  /**
   * Step 1: create the transfer record, then open the modal.
   * Having the record created first means the chain monitor starts
   * watching immediately; the wallet popup (for STX/USDCx) or
   * QR-code scan (for BTC) happens inside the modal.
   */
  const handleSubmit = useCallback(async () => {
    if (!isReady || isLoading || !selectedBank) return;
    setIsLoading(true);
    const senderAddress =
      sendToken === "BTC" ? (addresses?.btc ?? "") : (addresses?.stx ?? "");
    try {
      const transfer = await createTransfer({
        sendAmount: parsedAmount,
        sendToken,
        receiveCurrency: currency,
        bank: selectedBank.name,
        bankCode: selectedBank.code,
        accountNumber,
        senderAddress,
      });
      setPendingTransfer({ id: transfer.id, depositAddress: transfer.depositAddress ?? "" });
      setShowModal(true);
    } catch (err) {
      console.error("Transfer creation failed:", err);
      toast.error("Could not create transfer", {
        description: "Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [isReady, isLoading, selectedBank, sendToken, parsedAmount, currency, accountNumber, addresses]);

  /** Step 2: called by the modal once the user confirms the send
   *  (wallet tx broadcast for STX/USDCx, or manual "I've sent" for BTC). */
  const handleStartMonitoring = useCallback(() => {
    if (pendingTransfer) setMonitoringTransferId(pendingTransfer.id);
  }, [pendingTransfer]);

  const handleMonitoringDone = useCallback((status: TransferStatus) => {
    if (status === "completed") {
      toast.success("Payout sent!", {
        description: `Your ${currency} has been sent to your bank account.`,
      });
    } else {
      toast.error("Transfer failed", {
        description: "The payout could not be completed. Please contact support.",
      });
    }
  }, [currency]);

  const handleModalClose = useCallback(() => {
    setShowModal(false);
    setMonitoringTransferId(null);
    setPendingTransfer(null);
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen sm:h-screen sm:overflow-hidden bg-[#0a0a0a] flex flex-col">
      {/* Transfer confirmation modal */}
      <TransferModal
        open={showModal}
        onClose={handleModalClose}
        transferId={pendingTransfer?.id ?? ""}
        depositAddress={pendingTransfer?.depositAddress ?? ""}
        senderStxAddress={addresses?.stx ?? ""}
        onStartMonitoring={handleStartMonitoring}
        monitoringTransferId={monitoringTransferId}
        onMonitoringDone={handleMonitoringDone}
        sendAmount={parsedAmount}
        sendToken={sendToken}
        receiveAmount={receiveAmount}
        receiveCurrency={currency}
      />

      {/* Navigation */}
      <Navbar />

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center sm:justify-center px-3 sm:px-4 pt-24 sm:pt-20 pb-24 sm:pb-2">
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
          <div className="h-2" />

          {/* Bank + account number row */}
          <BankSelector
            selected={selectedBank}
            onSelect={setSelectedBank}
            accountNumber={accountNumber}
            onAccountNumberChange={setAccountNumber}
          />

          {/* Spacer */}
          <div className="h-2" />

          {/* Quick transfer info */}
          <QuickTransferBanner />

          {/* Spacer */}
          <div className="h-1" />

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
