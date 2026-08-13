"use client";

/**
 * Competing merchants' rates.
 *
 * Where to price is a judgement call, so this shows the book you're pricing
 * against rather than just your own number.
 *
 * One thing worth being precise about: the `side` filter is what YOU want to do,
 * not the side of the ads listed. Choosing "I'm selling" shows merchants' BUY
 * ads — the people who would take your crypto. Reading it the other way round
 * inverts the comparison, so the UI states it in those words.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Loader2, RefreshCw, Search, ArrowUpDown } from "lucide-react";

import { fetchMarketBook, MarketAd, ApiError } from "@/lib/api";

const TOKENS = ["USDT", "USDC"];
const FIATS = ["NGN", "GHS", "KES"];

type SortKey = "price" | "limits" | "completion";

export default function MarketRates() {
  const [token, setToken] = useState("USDT");
  const [fiat, setFiat] = useState("NGN");
  const [side, setSide] = useState<"sell" | "buy">("sell");
  const [query, setQuery] = useState("");
  const [minLimit, setMinLimit] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("price");
  const [asc, setAsc] = useState(true);

  const [ads, setAds] = useState<MarketAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      setAds(await fetchMarketBook({ token, fiat, side }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the market book.");
      setAds([]);
    } finally {
      setLoading(false);
    }
  }, [token, fiat, side]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const floor = Number(minLimit) || 0;

    const filtered = ads.filter((a) => {
      if (q && !a.merchantName.toLowerCase().includes(q)) return false;
      // "I can trade at least X" — an ad whose maximum is below that is no use.
      if (floor > 0 && a.maxAmount < floor) return false;
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === "price") return a.price - b.price;
      if (sortKey === "limits") return a.maxAmount - b.maxAmount;
      return 0;
    });

    return asc ? sorted : sorted.reverse();
  }, [ads, query, minLimit, sortKey, asc]);

  const best = rows.length > 0 ? rows[asc ? 0 : rows.length - 1] : null;

  const selectClass =
    "rounded-lg border border-white/[0.08] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white/20 focus:outline-none cursor-pointer";

  return (
    <div className="flex flex-col gap-5">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/[0.07] bg-[#111] p-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-widest text-gray-500">
            Token
          </span>
          <select value={token} onChange={(e) => setToken(e.target.value)} className={selectClass}>
            {TOKENS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-widest text-gray-500">
            Fiat
          </span>
          <select value={fiat} onChange={(e) => setFiat(e.target.value)} className={selectClass}>
            {FIATS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-widest text-gray-500">
            You want to
          </span>
          <select
            value={side}
            onChange={(e) => setSide(e.target.value as "sell" | "buy")}
            className={selectClass}
          >
            <option value="sell">Sell {token}</option>
            <option value="buy">Buy {token}</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-widest text-gray-500">
            Merchant
          </span>
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name"
              className="w-40 rounded-lg border border-white/[0.08] bg-[#1a1a1a] py-2 pl-8 pr-3 text-sm text-white placeholder:text-gray-600 focus:border-white/20 focus:outline-none"
            />
          </div>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-widest text-gray-500">
            Handles at least
          </span>
          <input
            value={minLimit}
            onChange={(e) => setMinLimit(e.target.value)}
            inputMode="decimal"
            placeholder={`${fiat} amount`}
            className="w-36 rounded-lg border border-white/[0.08] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-white/20 focus:outline-none"
          />
        </label>

        <button
          onClick={() => setAsc((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-medium text-gray-300 hover:bg-white/[0.12]"
          title="Reverse order"
        >
          <ArrowUpDown size={13} />
          {asc ? "Lowest first" : "Highest first"}
        </button>

        <button
          onClick={load}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-medium text-gray-300 hover:bg-white/[0.12]"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Best price callout — the number to price against */}
      {best && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#f97316]/25 bg-[#f97316]/10 px-4 py-3 text-sm">
          <TrendingUp size={16} className="shrink-0 text-[#f97316]" />
          <span className="text-orange-100/90">
            Best {side === "sell" ? "buyer" : "seller"}:{" "}
            <span className="font-semibold text-[#f97316]">
              {best.price.toLocaleString()} {fiat}
            </span>{" "}
            from {best.merchantName}
          </span>
          <span className="ml-auto text-[11px] text-orange-200/60">
            {side === "sell"
              ? "What you'd receive per unit if you sold into the book."
              : "What you'd pay per unit if you bought from the book."}
          </span>
        </div>
      )}

      {/* Book */}
      <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#111]">
        <div className="flex items-center gap-2 border-b border-white/[0.07] px-6 py-4">
          <h2 className="text-sm font-semibold text-white">
            {token}/{fiat} — merchants {side === "sell" ? "buying" : "selling"}
          </h2>
          <button
            onClick={() => setSortKey(sortKey === "price" ? "limits" : "price")}
            className="ml-auto text-[11px] font-medium uppercase tracking-wider text-gray-500 hover:text-gray-300"
          >
            Sort: {sortKey}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-gray-500">
            <Loader2 size={15} className="animate-spin" />
            Loading book…
          </div>
        ) : error ? (
          <p className="px-6 py-12 text-center text-sm text-red-400/90">{error}</p>
        ) : rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-gray-500">
            {ads.length === 0
              ? "No ads returned for this pair."
              : "No ads match those filters."}
          </p>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            <div className="hidden items-center gap-3 px-6 py-2.5 text-[11px] font-medium uppercase tracking-wider text-gray-600 sm:flex">
              <span className="flex-1">Merchant</span>
              <span className="w-40 text-right">Limits ({fiat})</span>
              <span className="w-28 text-right">Available</span>
              <span className="w-28 text-right">Price</span>
            </div>
            {rows.map((a, i) => (
              <motion.div
                key={a.advId}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(i * 0.02, 0.3) }}
                className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-gray-200">{a.merchantName}</p>
                  <p className="text-[11px] text-gray-600">
                    {a.completedOrderNum ? `${a.completedOrderNum} orders` : ""}
                  </p>
                </div>
                <span className="w-40 text-right text-xs text-gray-500">
                  {a.minAmount.toLocaleString()} – {a.maxAmount.toLocaleString()}
                </span>
                <span className="w-28 text-right text-xs text-gray-500">
                  {a.quantity.toLocaleString()} {a.token}
                </span>
                <span className="w-28 text-right text-sm font-semibold text-white">
                  {a.price.toLocaleString()}
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
