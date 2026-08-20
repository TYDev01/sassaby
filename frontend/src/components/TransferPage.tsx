"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpDown, Zap, SendHorizonal, Loader2, Wallet } from "lucide-react";
import Link from "next/link";

import Navbar from "@/components/Navbar";
import TransferCard, { SelectedAsset } from "@/components/TransferCard";
import ReceiveCard from "@/components/ReceiveCard";
import BankSelector, { Bank } from "@/components/BankSelector";
import OrderTracker from "@/components/TransferModal";

import {
  createOrder,
  fetchRates,
  fetchOpenOrder,
  fetchDepositAddresses,
  ApiError,
  AssetSpec,
  Order,
  OrderDirection,
  RateQuote,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

type Currency = "NGN" | "GHS" | "KES";

/** Fallback until the registry loads, so the first paint isn't empty. */
const DEFAULT_ASSET: SelectedAsset = { token: "BTC", chain: "bitcoin" };

// ─── Hero Heading ─────────────────────────────────────────────────────────────

const CRYPTO_WORDS = ["BTC", "USDT", "SOL", "ETH", "LTC", "BNB", "TRX", "TON"];
const FIAT_WORDS = ["NGN"];

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
        Bridge between <CyclingWord words={CRYPTO_WORDS} />
        <br />
        and <CyclingWord words={FIAT_WORDS} delay={1000} /> accounts
      </h1>
    </motion.div>
  );
}

// ─── Direction Toggle ─────────────────────────────────────────────────────────

function DirectionToggle({
  direction,
  onChange,
  disabled,
}: {
  direction: OrderDirection;
  onChange: (d: OrderDirection) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex justify-center mb-4">
      <div className="inline-flex bg-[#111] border border-white/10 rounded-full p-1 gap-1">
        {(["sell", "buy"] as OrderDirection[]).map((d) => (
          <button
            key={d}
            onClick={() => !disabled && onChange(d)}
            disabled={disabled}
            className={`
              px-5 py-1.5 rounded-full text-sm font-semibold transition-colors duration-200
              disabled:cursor-not-allowed
              ${
                direction === d
                  ? "bg-[#f97316] text-white"
                  : "text-gray-400 hover:text-white"
              }
            `}
          >
            {d === "sell" ? "Sell crypto" : "Buy crypto"}
          </button>
        ))}
      </div>
    </div>
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
        <span className="text-[#f97316] font-medium">$100,000</span> — verified within minutes.
      </p>
    </motion.div>
  );
}

// ─── Submit Button ─────────────────────────────────────────────────────────────

function SubmitButton({
  disabled,
  loading,
  label,
  onClick,
}: {
  disabled: boolean;
  loading: boolean;
  label: string;
  onClick: () => void;
}) {
  const isBlocked = disabled || loading;

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
  const { user, loading: authLoading } = useAuth();

  // ── Asset registry ──────────────────────────────────────────────────────────
  const [assets, setAssets] = useState<AssetSpec[]>([]);
  const [asset, setAsset] = useState<SelectedAsset>(DEFAULT_ASSET);

  useEffect(() => {
    fetchDepositAddresses()
      .then((data) => {
        const list = data.supported ?? [];
        setAssets(list);
        if (list.length > 0) {
          setAsset((cur) =>
            list.some((a) => a.token === cur.token && a.chain === cur.chain)
              ? cur
              : { token: list[0].token, chain: list[0].chain }
          );
        }
      })
      .catch(() => {});
  }, []);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [direction, setDirection] = useState<OrderDirection>("sell");
  const [sendAmount, setSendAmount] = useState("");
  // NGN only for now — the ReceiveCard shows it as a fixed badge rather than a
  // picker, so nothing sets this.
  const [currency] = useState<Currency>("NGN");
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");

  // ── The caller's single live order ──────────────────────────────────────────
  // One open order per user is enforced server-side, so surface any existing one
  // rather than letting them fill in a form that will 409.
  const [openOrder, setOpenOrder] = useState<Order | null>(null);
  const [checkingOpen, setCheckingOpen] = useState(false);

  const refreshOpenOrder = useCallback(async () => {
    if (!user) {
      setOpenOrder(null);
      return;
    }
    setCheckingOpen(true);
    try {
      setOpenOrder(await fetchOpenOrder());
    } catch {
      // Non-fatal — the server still rejects a duplicate on submit.
    } finally {
      setCheckingOpen(false);
    }
  }, [user]);

  useEffect(() => {
    refreshOpenOrder();
  }, [refreshOpenOrder]);

  // ── Live rate ───────────────────────────────────────────────────────────────
  const parsedAmount = parseFloat(sendAmount) || 0;
  const [rateQuote, setRateQuote] = useState<RateQuote | null>(null);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [baseRate, setBaseRate] = useState<number | null>(null);
  const rateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setRateQuote(null);
    if (parsedAmount <= 0) {
      setRatesLoading(false);
      return;
    }
    setRatesLoading(true);
    if (rateDebounceRef.current) clearTimeout(rateDebounceRef.current);
    rateDebounceRef.current = setTimeout(async () => {
      try {
        setRateQuote(await fetchRates(asset.token, parsedAmount, currency, direction));
      } catch {
        /* logged server-side */
      } finally {
        setRatesLoading(false);
      }
    }, 500);
    return () => {
      if (rateDebounceRef.current) clearTimeout(rateDebounceRef.current);
    };
  }, [parsedAmount, asset.token, currency, direction]);

  useEffect(() => {
    setBaseRate(null);
    let cancelled = false;
    fetchRates(asset.token, 1, currency, direction)
      .then((q) => {
        if (!cancelled) setBaseRate(q.flwRate);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [asset.token, currency, direction]);

  const usdEquivalent = rateQuote?.usdAmount ?? 0;
  const receiveAmount = rateQuote?.receiveAmount ?? 0;
  const rateInfo = rateQuote
    ? { tokenPrice: rateQuote.tokenPriceUSD, flwRate: rateQuote.flwRate, token: asset.token }
    : null;

  const isSell = direction === "sell";

  /** Buying releases crypto irreversibly, so the payer name must be on file. */
  const missingBankName = !isSell && !!user && !user.bankAccountName;

  const isReady = useMemo(() => {
    if (parsedAmount <= 0) return false;
    if (isSell) return selectedBank !== null && accountNumber.length >= 10;
    return destinationAddress.trim().length >= 8 && !missingBankName;
  }, [parsedAmount, isSell, selectedBank, accountNumber, destinationAddress, missingBankName]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const [showTracker, setShowTracker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!isReady || isLoading) return;
    setIsLoading(true);
    try {
      const created = await createOrder({
        direction,
        sendAmount: parsedAmount,
        sendToken: asset.token,
        chain: asset.chain,
        receiveCurrency: currency,
        ...(isSell
          ? {
              bank: selectedBank!.name,
              bankCode: selectedBank!.code,
              accountNumber,
            }
          : { destinationAddress: destinationAddress.trim() }),
      });
      setActiveOrderId(created.id);
      setShowTracker(true);
      await refreshOpenOrder();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Lost the race, or already had one open — show it instead of erroring.
        toast.error("You already have an order in progress");
        await refreshOpenOrder();
      } else {
        toast.error("Could not create order", {
          description: err instanceof ApiError ? err.message : "Please try again.",
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    isReady,
    isLoading,
    direction,
    parsedAmount,
    asset,
    currency,
    isSell,
    selectedBank,
    accountNumber,
    destinationAddress,
    refreshOpenOrder,
  ]);

  const handleTrackerClose = useCallback(() => {
    setShowTracker(false);
    setActiveOrderId(null);
    refreshOpenOrder();
  }, [refreshOpenOrder]);

  const submitLabel = isLoading
    ? "Processing..."
    : parsedAmount <= 0
    ? "Enter an amount"
    : missingBankName
    ? "Add your bank account name first"
    : !isReady
    ? isSell
      ? "Add your bank details"
      : "Add your wallet address"
    : isSell
    ? `Sell ${sendAmount} ${asset.token}`
    : `Buy ${sendAmount} ${asset.token}`;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="relative z-10 min-h-screen sm:h-screen sm:overflow-hidden flex flex-col">
      {activeOrderId && (
        <OrderTracker
          open={showTracker}
          orderId={activeOrderId}
          onClose={handleTrackerClose}
        />
      )}

      <Navbar />

      <main className="flex-1 flex flex-col items-center sm:justify-center px-3 sm:px-4 pt-24 sm:pt-20 pb-24 sm:pb-2">
        <HeroHeading />

        <div className="w-full max-w-[600px] flex flex-col gap-0">
          {/* An open order blocks a new one — show it rather than a dead form. */}
          {openOrder ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#111] border border-[#f97316]/25 rounded-2xl px-6 py-6 flex flex-col gap-3 text-center"
            >
              <p className="text-white font-semibold">You have an order in progress</p>
              <p className="text-gray-400 text-sm">
                {openOrder.direction === "sell" ? "Selling" : "Buying"}{" "}
                {openOrder.sendAmount} {openOrder.sendToken} on {openOrder.chain}. Finish
                or cancel it before starting another.
              </p>
              <button
                onClick={() => {
                  setActiveOrderId(openOrder.id);
                  setShowTracker(true);
                }}
                className="mt-1 mx-auto px-6 py-2.5 rounded-xl bg-[#f97316] hover:bg-[#ea6c0e] text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                View order
              </button>
            </motion.div>
          ) : (
            <>
              <DirectionToggle
                direction={direction}
                onChange={setDirection}
                disabled={isLoading}
              />

              <div className="flex flex-col">
                <div className="relative z-20">
                  <TransferCard
                    label={isSell ? "You'll send" : "You'll receive"}
                    value={sendAmount}
                    onChange={setSendAmount}
                    usdEquivalent={usdEquivalent}
                    assets={assets}
                    selected={asset}
                    onAssetChange={setAsset}
                  />
                </div>

                <ArrowDivider />

                <div className="relative z-10">
                  <ReceiveCard
                    amount={receiveAmount}
                    minimum={baseRate}
                    currency={currency}
                    isLoading={ratesLoading}
                    rateInfo={rateInfo}
                  />
                </div>
              </div>

              <div className="h-2" />

              {isSell ? (
                <BankSelector
                  selected={selectedBank}
                  onSelect={setSelectedBank}
                  accountNumber={accountNumber}
                  onAccountNumberChange={setAccountNumber}
                />
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    <Wallet
                      size={16}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500"
                    />
                    <input
                      type="text"
                      value={destinationAddress}
                      onChange={(e) => setDestinationAddress(e.target.value)}
                      placeholder={`Your ${asset.token} wallet address`}
                      className="
                        w-full rounded-xl bg-[#111] border border-white/10
                        pl-10 pr-3.5 py-3.5 text-sm text-white font-mono
                        placeholder:text-gray-600 placeholder:font-sans
                        focus:outline-none focus:border-[#f97316]/60 transition-colors
                      "
                    />
                  </div>
                  {/* Releases are irreversible and network-specific — a right
                      address on the wrong chain loses the funds. */}
                  <p className="text-xs text-gray-600 px-1">
                    Must be a{" "}
                    {assets.find((a) => a.token === asset.token && a.chain === asset.chain)
                      ?.network ?? asset.chain}{" "}
                    address. Releases can&apos;t be reversed.
                  </p>
                </div>
              )}

              {missingBankName && (
                <p className="text-xs text-amber-400 px-1 mt-2">
                  <Link
                    href="/profile?next=%2F"
                    className="underline underline-offset-2 hover:text-amber-300"
                  >
                    Add the name on your bank account
                  </Link>{" "}
                  — we match every payment against it before releasing.
                </p>
              )}

              <div className="h-2" />
              <QuickTransferBanner />
              <div className="h-1" />

              {authLoading ? null : user ? (
                <SubmitButton
                  disabled={!isReady || checkingOpen}
                  loading={isLoading}
                  label={submitLabel}
                  onClick={handleSubmit}
                />
              ) : (
                <Link href="/signin?next=/">
                  <div className="w-full rounded-xl px-4 py-4 text-base font-semibold text-center bg-[#f97316] text-white hover:bg-[#ea6c0e] shadow-lg shadow-[#f97316]/20 cursor-pointer transition-colors">
                    Login to trade
                  </div>
                </Link>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
