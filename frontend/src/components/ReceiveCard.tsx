"use client";

import { motion } from "framer-motion";
import Image from "next/image";

// ─── Types ────────────────────────────────────────────────────────────────────

type Currency = "NGN" | "GHS" | "KES";

interface ReceiveCardProps {
  /** Calculated receive amount (controlled by parent) */
  amount: number;
  /** Minimum receivable amount — null while the live rate is loading */
  minimum: number | null;
  /** Payout currency. Only NGN is offered today — see CURRENCY_IMAGES. */
  currency: Currency;
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

// ─── Currency Badge ───────────────────────────────────────────────────────────

/**
 * Not a picker: the desk quotes NGN only for now. GHS and KES stay in the type
 * and in the rate config, so restoring the choice here is a UI change rather
 * than a rebuild — but offering a currency the desk will not settle is worse
 * than offering one.
 */
function CurrencyBadge({ currency }: { currency: Currency }) {
  return (
    <div
      className="
        flex items-center gap-2 bg-[#1a1a1a] border border-white/10
        rounded-full px-4 py-2
      "
    >
      <CurrencyIcon currency={currency} size={20} />
      <span className="text-white text-base font-semibold tracking-wide">
        {currency}
      </span>
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
        : n >= 1
        ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
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

        {/* Payout currency */}
        <div className="pt-1">
          <CurrencyBadge currency={currency} />
        </div>
      </div>
    </motion.div>
  );
}
