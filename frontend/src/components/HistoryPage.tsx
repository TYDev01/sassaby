"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet,
  Unplug,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  Check,
  ArrowUpRight,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { fetchOrders, Order } from "@/lib/api";
import { STATUS_LABEL, STATUS_STYLE, explorerTxUrl } from "@/lib/orderStatus";
import { useAuth } from "@/lib/auth";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncate(addr: string, chars = 6) {
  if (!addr) return "";
  return `${addr.slice(0, chars)}…${addr.slice(-4)}`;
}

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_ICONS: Partial<Record<Order["status"], React.ReactNode>> = {
  settled:           <CheckCircle2 size={13} />,
  released:          <CheckCircle2 size={13} />,
  awaiting_deposit:  <Clock size={13} />,
  awaiting_payment:  <Clock size={13} />,
  payment_claimed:   <Clock size={13} />,
  deposit_confirmed: <Loader2 size={13} className="animate-spin" />,
  verifying:         <Loader2 size={13} className="animate-spin" />,
  awaiting_manual_payout: <Loader2 size={13} className="animate-spin" />,
  failed:            <XCircle size={13} />,
  rejected:          <XCircle size={13} />,
  expired:           <XCircle size={13} />,
};

function StatusBadge({ status }: { status: Order["status"] }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full border ${STATUS_STYLE[status]}`}
    >
      {STATUS_ICONS[status]}
      {STATUS_LABEL[status]}
    </span>
  );
}

// ─── Copy Button ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      className="ml-1.5 text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
      title="Copy address"
    >
      {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
    </button>
  );
}

// ─── Sign-in Wall ─────────────────────────────────────────────────────────────

function SignInWall() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="flex flex-col items-center justify-center flex-1 py-24 px-6 text-center"
    >
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        className="
          w-20 h-20 rounded-2xl mb-8
          bg-[#f97316]/10 border border-[#f97316]/20
          flex items-center justify-center
        "
      >
        <Wallet size={36} className="text-[#f97316]" />
      </motion.div>

      <h2 className="text-white text-2xl font-bold tracking-tight mb-3">
        Login to see your orders
      </h2>
      <p className="text-gray-400 text-sm max-w-xs mb-8 leading-relaxed">
        Orders are tied to your account, so we can match your bank payment to the
        right trade.
      </p>

      <div className="flex items-center gap-3">
        <Link href="/signin?next=/history">
          <motion.div
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            className="
              px-8 py-3.5 rounded-xl bg-[#f97316] hover:bg-[#ea6c0e]
              text-white font-semibold text-sm
              shadow-lg shadow-[#f97316]/20
              transition-all duration-200 cursor-pointer
            "
          >
            Login
          </motion.div>
        </Link>
        <Link href="/signup?next=/history">
          <motion.div
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            className="
              px-8 py-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12]
              text-gray-200 font-semibold text-sm
              transition-all duration-200 cursor-pointer
            "
          >
            Create account
          </motion.div>
        </Link>
      </div>
    </motion.div>
  );
}

// ─── Account Header ───────────────────────────────────────────────────────────

function AccountHeader() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="
        flex flex-wrap items-center justify-between gap-4
        bg-[#111111] border border-white/[0.07]
        rounded-2xl px-6 py-4 mb-6
      "
    >
      <div className="flex flex-col gap-1 min-w-0">
        <p className="text-gray-500 text-xs font-medium uppercase tracking-widest">
          Signed in as
        </p>
        <p className="text-white text-sm font-medium truncate">{user.email}</p>
      </div>

      <div className="flex flex-col gap-1 min-w-0">
        <p className="text-gray-500 text-xs font-medium uppercase tracking-widest">
          Bank account name
        </p>
        {user.bankAccountName ? (
          <p className="text-white text-sm font-medium truncate">{user.bankAccountName}</p>
        ) : (
          // Without this, a buy order can't be placed at all — the release check
          // has nothing to match the payer against.
          <p className="text-amber-400 text-sm font-medium">Not set — required to buy</p>
        )}
      </div>
    </motion.div>
  );
}

// ─── Transfer History Table ───────────────────────────────────────────────────

const PAGE_SIZE = 10;

function TransferHistoryTable({
  transfers,
  loading,
  onRefresh,
  refreshing,
}: {
  transfers: Order[];
  loading: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const [page, setPage] = useState(1);
  const [dateFilter, setDateFilter] = useState(""); // "YYYY-MM-DD"

  const filtered = useMemo(() => {
    if (!dateFilter) return transfers;
    return transfers.filter((t) => {
      const d = new Date(t.createdAt);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}` === dateFilter;
    });
  }, [transfers, dateFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  // Reset to page 1 when filter or transfers list changes
  useEffect(() => { setPage(1); }, [transfers, dateFilter]);

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 bg-white/[0.04] rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.4 }}
      className="bg-[#111111] border border-white/[0.07] rounded-2xl overflow-hidden"
    >
      {/* Table header */}
      <div className="px-6 py-4 border-b border-white/[0.07] flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <Clock size={15} className="text-[#f97316]" />
          <h2 className="text-white font-semibold text-sm">Transfer History</h2>
          <span className="text-gray-600 text-xs">
            ({dateFilter ? `${filtered.length} of ${transfers.length}` : `${transfers.length}`} records)
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Date search */}
          <div className="relative flex items-center">
            <Search size={12} className="absolute left-2.5 text-gray-500 pointer-events-none" />
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="pl-7 pr-2 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.07] text-gray-300 text-xs focus:outline-none focus:border-[#f97316]/50 focus:bg-white/[0.08] transition-all [color-scheme:dark] cursor-pointer"
            />
            {dateFilter && (
              <button
                onClick={() => setDateFilter("")}
                className="absolute right-2 text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
                title="Clear filter"
              >
                <X size={11} />
              </button>
            )}
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-gray-400 hover:text-white text-xs transition-colors cursor-pointer"
          >
            <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </motion.button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <ArrowUpRight size={32} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            {dateFilter ? "No transfers found for this date." : "No transfers found."}
          </p>
          <p className="text-gray-600 text-xs mt-1">
            {dateFilter
              ? <button onClick={() => setDateFilter("")} className="text-[#f97316] hover:underline cursor-pointer">Clear filter</button>
              : "Make your first transfer from the Transfer tab."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-white/[0.05]">
                <th className="px-6 py-3 text-left font-medium">Date</th>
                <th className="px-6 py-3 text-left font-medium">Sent</th>
                <th className="px-6 py-3 text-left font-medium">USD Value</th>
                <th className="px-6 py-3 text-left font-medium">Amount Received</th>
                <th className="px-6 py-3 text-left font-medium">Bank</th>
                <th className="px-6 py-3 text-left font-medium">Explorer</th>
                <th className="px-6 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {paginated.map((t, i) => (
                  <motion.tr
                    key={t.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.04 * i }}
                    className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-6 py-3.5 text-gray-400 whitespace-nowrap text-xs">
                      {new Date(t.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                      <br />
                      <span className="text-gray-600">
                        {new Date(t.createdAt).toLocaleTimeString("en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-white font-medium">
                      {fmt(t.sendAmount, 4)}{" "}
                      <span className="text-[#f97316]">{t.sendToken}</span>
                    </td>
                    <td className="px-6 py-3.5 text-white font-semibold">
                      ${fmt(t.usdEquivalent)}
                    </td>
                    <td className="px-6 py-3.5 text-white">
                      {fmt(t.receiveAmount)} {t.receiveCurrency}
                    </td>
                    <td className="px-6 py-3.5 text-gray-400 text-xs">{t.bank}</td>
                    <td className="px-6 py-3.5">
                      {t.claimedTxId ? (
                        <a
                          href={explorerTxUrl(t.chain, t.claimedTxId) ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#f97316] hover:text-[#ea6c0e] transition-colors"
                        >
                          View Tx
                          <ExternalLink size={11} />
                        </a>
                      ) : (
                        <span className="text-gray-700 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5">
                      <StatusBadge status={t.status} />
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="px-6 py-4 border-t border-white/[0.07] flex items-center justify-between">
          <p className="text-gray-600 text-xs">
            Page {page} of {totalPages} &middot; {transfers.length} records
          </p>
          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.07] text-gray-400 hover:text-white text-xs transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft size={13} />
              Prev
            </motion.button>

            {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((p) => (
              <motion.button
                key={p}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setPage(p)}
                className={`w-7 h-7 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  p === page
                    ? "bg-[#f97316] text-white"
                    : "bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.07] text-gray-400 hover:text-white"
                }`}
              >
                {p}
              </motion.button>
            ))}

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.07] text-gray-400 hover:text-white text-xs transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              Next
              <ChevronRight size={13} />
            </motion.button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ─── History Page ─────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const [transfers, setTransfers] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setTransfers(await fetchOrders());
    } catch {
      // silently fail — table shows its empty state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  return (
    <div className="relative z-10 min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col px-4 sm:px-6 pt-28 sm:pt-32 pb-20 max-w-[1200px] mx-auto w-full">
        {/* Page title */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between">
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Transfer History
            </h1>
            <Link href="/">
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-1.5 px-3 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-gray-400 hover:text-white text-xs font-medium transition-colors cursor-pointer"
                title="Go to homepage"
              >
                <ArrowLeft size={14} />
                Home
              </motion.div>
            </Link>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            {user
              ? "Every order placed on your account"
              : "Login to view your order history"}
          </p>
        </motion.div>

        {user ? (
          <>
            <AccountHeader />
            <TransferHistoryTable
              transfers={transfers}
              loading={loading}
              onRefresh={() => load(true)}
              refreshing={refreshing}
            />
          </>
        ) : authLoading ? null : (
          <SignInWall />
        )}
      </main>
    </div>
  );
}
