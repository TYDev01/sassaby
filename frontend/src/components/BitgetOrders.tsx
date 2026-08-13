"use client";

/**
 * Bitget P2P orders — live and historical.
 *
 * These are counterparties trading against the desk's ads, distinct from
 * Sassaby's own customer orders, which settle through the order queue. Both are
 * manual, but they're separate books and shouldn't be confused.
 *
 * Read-only: releasing on Bitget happens in Bitget, against its own escrow.
 */

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Inbox, Loader2, RefreshCw, AlertTriangle, Clock, ChevronDown } from "lucide-react";

import { fetchBitgetOrders, BitgetOrder, BitgetOrderFilter, ApiError } from "@/lib/api";

/** Only the live view auto-refreshes; history doesn't change under you. */
const POLL_MS = 30_000;

const TABS: Array<{ key: BitgetOrderFilter; label: string }> = [
  { key: "pending", label: "Live" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "in_appeal", label: "Appeals" },
];

const STATUS_STYLE: Record<string, string> = {
  pending_payment: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  pending_release: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  in_appeal: "text-red-400 bg-red-400/10 border-red-400/20",
  completed: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  cancelled: "text-gray-400 bg-gray-400/10 border-gray-400/20",
};

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Awaiting payment",
  pending_release: "Awaiting release",
  in_appeal: "In appeal",
  completed: "Completed",
  cancelled: "Cancelled",
};

function timeAgo(ms: number): string {
  if (!ms) return "";
  const mins = Math.floor((Date.now() - ms) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days < 30 ? `${days}d ago` : new Date(ms).toLocaleDateString();
}

export default function BitgetOrders() {
  const [tab, setTab] = useState<BitgetOrderFilter>("pending");
  const [side, setSide] = useState<"all" | "buy" | "sell">("all");
  const [orders, setOrders] = useState<BitgetOrder[]>([]);
  const [nextId, setNextId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetchBitgetOrders({
        status: tab,
        side: side === "all" ? undefined : side,
      });
      setOrders(res.orders);
      setNextId(res.nextId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load orders.");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [tab, side]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Live orders have someone waiting on the other end, so poll those. History is
  // settled — re-fetching it on a timer would just churn.
  useEffect(() => {
    if (tab !== "pending") return;
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [tab, load]);

  async function loadMore() {
    if (!nextId || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetchBitgetOrders({
        status: tab,
        side: side === "all" ? undefined : side,
        cursor: nextId,
      });
      setOrders((prev) => [...prev, ...res.orders]);
      setNextId(res.nextId);
    } catch {
      // Keep what's already listed rather than blanking the view.
    } finally {
      setLoadingMore(false);
    }
  }

  const needsAction =
    tab === "pending" ? orders.filter((o) => o.status !== "pending_payment").length : 0;

  const volume = orders.reduce((sum, o) => sum + o.amount, 0);
  const fiat = orders[0]?.fiat ?? "";

  return (
    <div className="flex flex-col gap-5">
      {needsAction > 0 && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle size={16} className="shrink-0 text-amber-400" />
          <p className="text-amber-200/90">
            <span className="font-semibold text-amber-300">{needsAction}</span> order
            {needsAction === 1 ? "" : "s"} waiting on you. Release happens in Bitget.
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#111]">
        <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] px-6 py-4">
          <Inbox size={16} className="text-[#f97316]" />
          <h2 className="text-sm font-semibold text-white">P2P orders</h2>

          <div className="ml-auto flex items-center gap-2">
            <div className="flex gap-1 rounded-full bg-[#1a1a1a] p-1">
              {(["all", "buy", "sell"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSide(s)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                    side === s ? "bg-[#f97316] text-white" : "text-gray-400 hover:text-white"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              onClick={load}
              className="flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-medium text-gray-300 hover:bg-white/[0.12]"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-0 border-b border-white/[0.06] px-3">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === t.key
                  ? "border-[#f97316] text-white"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {t.label}
            </button>
          ))}
          {!loading && orders.length > 0 && fiat && (
            <span className="ml-auto pr-3 text-[11px] text-gray-600">
              {orders.length} shown · {volume.toLocaleString()} {fiat}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-gray-500">
            <Loader2 size={15} className="animate-spin" />
            Loading orders…
          </div>
        ) : error ? (
          <p className="px-6 py-12 text-center text-sm text-red-400/90">{error}</p>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <Clock size={20} className="text-gray-600" />
            <p className="text-sm text-gray-500">
              {tab === "pending" ? "No live orders." : `No ${tab.replace("_", " ")} orders.`}
            </p>
            {tab === "pending" && (
              <p className="text-xs text-gray-600">
                Orders appear here when someone trades against your ads.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="divide-y divide-white/[0.05]">
              {orders.map((o) => (
                <motion.div
                  key={o.orderId}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-6"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-semibold text-white">
                      <span className="truncate">{o.counterparty || "—"}</span>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          o.side === "sell"
                            ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-400"
                            : "border-blue-400/20 bg-blue-400/10 text-blue-400"
                        }`}
                      >
                        you {o.side}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-gray-600">
                      {o.orderId} · {timeAgo(o.createdTime)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-sm font-semibold text-white">
                      {o.amount.toLocaleString()} {o.fiat}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {o.quantity.toLocaleString()} {o.token} @ {o.price.toLocaleString()}
                    </p>
                  </div>

                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${
                      STATUS_STYLE[o.status] ??
                      "border-gray-400/20 bg-gray-400/10 text-gray-400"
                    }`}
                  >
                    {STATUS_LABEL[o.status] ?? o.status}
                  </span>
                </motion.div>
              ))}
            </div>

            {nextId && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="flex w-full items-center justify-center gap-1.5 border-t border-white/[0.05] py-3 text-xs font-medium text-gray-400 transition-colors hover:bg-white/[0.03] hover:text-white disabled:opacity-50"
              >
                {loadingMore ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <ChevronDown size={13} />
                )}
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            )}
          </>
        )}
      </div>

      {/* Bitget caps the queryable window; say so rather than let it look like
          orders are missing. */}
      {tab !== "pending" && orders.length > 0 && (
        <p className="px-1 text-[11px] text-gray-600">
          Bitget serves at most 90 days of order history.
        </p>
      )}
    </div>
  );
}
