"use client";

import { useEffect, useState, useCallback } from "react";
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
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { useWallet } from "@/lib/wallet";
import { fetchTransfers, Transfer } from "@/lib/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncate(addr: string, chars = 6) {
  if (!addr) return "";
  return `${addr.slice(0, chars)}…${addr.slice(-4)}`;
}

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<Transfer["status"], string> = {
  completed: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  pending: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  processing: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  failed: "text-red-400 bg-red-400/10 border-red-400/20",
};

const STATUS_ICONS: Record<Transfer["status"], React.ReactNode> = {
  completed: <CheckCircle2 size={13} />,
  pending: <Clock size={13} />,
  processing: <Loader2 size={13} className="animate-spin" />,
  failed: <XCircle size={13} />,
};

function StatusBadge({ status }: { status: Transfer["status"] }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full border ${STATUS_STYLES[status]}`}
    >
      {STATUS_ICONS[status]}
      {status}
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

// ─── Connect Wall ─────────────────────────────────────────────────────────────

function ConnectWall() {
  const { connectWallet, connecting } = useWallet();

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="flex flex-col items-center justify-center flex-1 py-24 px-6 text-center"
    >
      {/* Animated wallet icon */}
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
        Connect your wallet
      </h2>
      <p className="text-gray-400 text-sm max-w-xs mb-8 leading-relaxed">
        Connect your Stacks wallet to view your personal transfer history and
        account details.
      </p>

      <motion.button
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
        onClick={connectWallet}
        disabled={connecting}
        className="
          flex items-center gap-2.5 px-8 py-3.5 rounded-xl
          bg-[#f97316] hover:bg-[#ea6c0e]
          text-white font-semibold text-sm
          shadow-lg shadow-[#f97316]/20
          transition-all duration-200 cursor-pointer
          disabled:opacity-70 disabled:cursor-not-allowed
        "
      >
        {connecting ? (
          <Loader2 size={18} className="animate-spin shrink-0" />
        ) : (
          <Wallet size={18} className="shrink-0" />
        )}
        {connecting ? "Connecting…" : "Connect Wallet"}
      </motion.button>

      <p className="text-gray-600 text-xs mt-5">
        Supports Leather, Xverse & any Stacks-compatible wallet
      </p>
    </motion.div>
  );
}

// ─── Wallet Header ────────────────────────────────────────────────────────────

function WalletHeader() {
  const { addresses, disconnectWallet } = useWallet();

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="
        flex items-center justify-between
        bg-[#111111] border border-white/[0.07]
        rounded-2xl px-6 py-4 mb-6
      "
    >
      <div className="flex flex-col gap-1">
        <p className="text-gray-500 text-xs font-medium uppercase tracking-widest">
          Connected Wallet
        </p>
        <div className="flex items-center gap-3 mt-1">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">STX Address</p>
            <div className="flex items-center text-white text-sm font-mono">
              {truncate(addresses?.stx ?? "", 10)}
              <CopyButton text={addresses?.stx ?? ""} />
            </div>
          </div>
          {addresses?.btc && (
            <>
              <div className="w-px h-8 bg-white/[0.06]" />
              <div>
                <p className="text-xs text-gray-500 mb-0.5">BTC Address</p>
                <div className="flex items-center text-white text-sm font-mono">
                  {truncate(addresses.btc, 10)}
                  <CopyButton text={addresses.btc} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <motion.button
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
        onClick={disconnectWallet}
        className="
          flex items-center gap-2 px-4 py-2 rounded-xl
          bg-white/[0.05] hover:bg-red-500/10 border border-white/10
          hover:border-red-500/20 text-gray-400 hover:text-red-400
          text-xs font-medium transition-all duration-200 cursor-pointer
        "
      >
        <Unplug size={13} />
        Disconnect
      </motion.button>
    </motion.div>
  );
}

// ─── Transfer History Table ───────────────────────────────────────────────────

function TransferHistoryTable({
  transfers,
  loading,
  onRefresh,
  refreshing,
}: {
  transfers: Transfer[];
  loading: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}) {
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
      <div className="px-6 py-4 border-b border-white/[0.07] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock size={15} className="text-[#f97316]" />
          <h2 className="text-white font-semibold text-sm">Transfer History</h2>
          <span className="text-gray-600 text-xs">({transfers.length} records)</span>
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

      {transfers.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <ArrowUpRight size={32} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No transfers found.</p>
          <p className="text-gray-600 text-xs mt-1">
            Make your first transfer from the Transfer tab.
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
                {transfers.map((t, i) => (
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
                          href={`https://explorer.hiro.so/txid/${t.claimedTxId}?chain=mainnet`}
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
    </motion.div>
  );
}

// ─── History Page ─────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const { connected, addresses } = useWallet();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    const walletAddr = addresses?.stx || addresses?.btc || "";
    if (!walletAddr) return;
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      const data = await fetchTransfers(walletAddr);
      setTransfers(data);
    } catch {
      // silently fail — table will show empty state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [addresses]);

  useEffect(() => {
    if (connected) load();
  }, [connected, load]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
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
            {connected
              ? "All transfers associated with your wallet"
              : "Connect your wallet to view your transfer history"}
          </p>
        </motion.div>

        {connected ? (
          <>
            <WalletHeader />
            <TransferHistoryTable
              transfers={transfers}
              loading={loading}
              onRefresh={() => load(true)}
              refreshing={refreshing}
            />
          </>
        ) : (
          <ConnectWall />
        )}
      </main>
    </div>
  );
}
