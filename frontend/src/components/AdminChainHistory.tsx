"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  RefreshCw,
  ExternalLink,
  Loader2,
  History,
  Copy,
  Check,
  AlertCircle,
} from "lucide-react";

// ─── Config ───────────────────────────────────────────────────────────────────

const MEMPOOL_API = "https://mempool.space/api";

// ─── Types ────────────────────────────────────────────────────────────────────

// Bitcoin is the only chain the desk watches directly. Everything else is
// routed through Bitget and settles there, not against an address we poll.
type ChainToken = "BTC";

interface ChainTx {
  id: string;
  chain: "bitcoin";
  token: ChainToken;
  tokenLabel: string;
  sender: string;
  amount: number;
  decimals: number;
  timestamp: number;
  status: "confirmed" | "pending" | "failed";
  explorerUrl: string;
}

// ─── Mempool.space shapes ─────────────────────────────────────────────────────

interface MempoolTx {
  txid: string;
  status: { confirmed: boolean; block_time?: number };
  vin: Array<{ prevout?: { scriptpubkey_address?: string; value: number } }>;
  vout: Array<{ scriptpubkey_address?: string; value: number }>;
}

// ─── Fetch: Bitcoin incoming transactions ─────────────────────────────────────

async function fetchBtcTxs(btcAddress: string): Promise<ChainTx[]> {
  const res = await fetch(`${MEMPOOL_API}/address/${btcAddress}/txs`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`mempool.space returned ${res.status}`);
  const txs = (await res.json()) as MempoolTx[];

  return txs
    .flatMap((tx): ChainTx[] => {
      // Find output(s) credited to our address
      const received = tx.vout.find(
        (o) => o.scriptpubkey_address === btcAddress
      );
      if (!received) return [];

      // First input's sender address
      const sender = tx.vin[0]?.prevout?.scriptpubkey_address;
      // Skip self-sends and unknown senders
      if (!sender || sender === btcAddress) return [];

      return [
        {
          id: tx.txid,
          chain: "bitcoin",
          token: "BTC",
          tokenLabel: "BTC",
          sender,
          amount: received.value / 1e8,
          decimals: 8,
          timestamp: tx.status.block_time
            ? tx.status.block_time * 1000
            : Date.now(),
          status: tx.status.confirmed ? "confirmed" : "pending",
          explorerUrl: `https://mempool.space/tx/${tx.txid}`,
        },
      ];
    })
    .sort((a, b) => b.timestamp - a.timestamp);
}

// ─── Copy Button ──────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="ml-1 text-gray-600 hover:text-gray-400 transition-colors cursor-pointer"
      title="Copy"
    >
      {copied ? (
        <Check size={11} className="text-emerald-400" />
      ) : (
        <Copy size={11} />
      )}
    </button>
  );
}

// ─── Token Badge ──────────────────────────────────────────────────────────────

const TOKEN_PILL: Record<ChainToken, string> = {
  BTC: "text-[#eab308] bg-[#eab308]/10 border-[#eab308]/20",
};

function TokenBadge({ token, label }: { token: ChainToken; label: string }) {
  return (
    <span
      className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${TOKEN_PILL[token]}`}
    >
      {label}
    </span>
  );
}

// ─── Status indicator ─────────────────────────────────────────────────────────

const STATUS_DOT: Record<ChainTx["status"], string> = {
  confirmed: "bg-emerald-400",
  pending:   "bg-yellow-400 animate-pulse",
  failed:    "bg-red-400",
};

const STATUS_TEXT: Record<ChainTx["status"], string> = {
  confirmed: "text-emerald-400",
  pending:   "text-yellow-400",
  failed:    "text-red-400",
};

function StatusDot({ status }: { status: ChainTx["status"] }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
      <span
        className={`text-[11px] font-semibold uppercase tracking-wider ${STATUS_TEXT[status]}`}
      >
        {status}
      </span>
    </div>
  );
}

// ─── AdminChainHistory ────────────────────────────────────────────────────────

export default function AdminChainHistory({
  btcAddress,
}: {
  btcAddress?: string;
}) {
  const [txs, setTxs]           = useState<ChainTx[]>([]);
  const [loading, setLoading]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errors, setErrors]     = useState<string[]>([]);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setErrors([]);

      const [btcRes] = await Promise.allSettled([
        btcAddress ? fetchBtcTxs(btcAddress) : Promise.resolve([]),
      ]);

      setTxs(
        btcRes.status === "fulfilled"
          ? [...btcRes.value].sort((a, b) => b.timestamp - a.timestamp)
          : []
      );

      setErrors(
        btcRes.status === "rejected"
          ? ["Bitcoin (mempool.space): " + (btcRes.reason as Error).message]
          : []
      );

      setLoading(false);
      setRefreshing(false);
    },
    [btcAddress]
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-[#111111] border border-white/[0.07] rounded-2xl overflow-hidden"
    >
      {/* ── Panel header ────────────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-b border-white/[0.07] flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <History size={16} className="text-[#f97316]" />
          <h2 className="text-white font-semibold text-sm">
            On-Chain Transaction History
          </h2>
          {!loading && (
            <span className="text-gray-600 text-xs">
              ({txs.length} records)
            </span>
          )}
        </div>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => load(true)}
          disabled={loading || refreshing}
          className="sm:ml-auto flex items-center gap-1.5 text-gray-400 hover:text-white text-xs transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </motion.button>
      </div>

      {/* ── Address context bar ─────────────────────────────────────────────── */}
      <div className="px-6 py-3 bg-white/[0.02] border-b border-white/[0.04] flex flex-wrap gap-5 text-xs text-gray-500">
        {btcAddress ? (
          <div className="flex items-center gap-1.5">
            <span className="text-gray-600">Watching BTC:</span>
            <span className="font-mono text-gray-400">
              {btcAddress.slice(0, 12)}…{btcAddress.slice(-6)}
            </span>
            <CopyBtn text={btcAddress} />
          </div>
        ) : (
          <span className="text-gray-700 italic">
            Set a BTC deposit address on the Addresses tab to watch it here
          </span>
        )}
      </div>

      {/* ── Error banners ────────────────────────────────────────────────────── */}
      {errors.map((e) => (
        <div
          key={e}
          className="px-6 py-2.5 bg-red-500/5 border-b border-red-500/10 flex items-center gap-2 text-red-400 text-xs"
        >
          <AlertCircle size={13} className="shrink-0" />
          {e}
        </div>
      ))}

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col gap-3 p-6">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-14 bg-white/[0.04] rounded-xl animate-pulse"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      ) : txs.length === 0 ? (
        <div className="px-6 py-20 text-center">
          <History size={32} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No incoming transactions found.</p>
          <p className="text-gray-600 text-xs mt-1">
            Transactions sent to the platform address will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-white/[0.05]">
                <th className="px-6 py-3 text-left font-medium">Date</th>
                <th className="px-6 py-3 text-left font-medium">Token</th>
                <th className="px-6 py-3 text-left font-medium">Amount</th>
                <th className="px-6 py-3 text-left font-medium">From</th>
                <th className="px-6 py-3 text-left font-medium">Status</th>
                <th className="px-6 py-3 text-left font-medium">Explorer</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((tx, i) => (
                <motion.tr
                  key={tx.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.03 * i }}
                  className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                >
                  {/* Date */}
                  <td className="px-6 py-3.5 text-gray-400 whitespace-nowrap text-xs">
                    {new Date(tx.timestamp).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "2-digit",
                    })}
                    <br />
                    <span className="text-gray-600">
                      {new Date(tx.timestamp).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </td>

                  {/* Token */}
                  <td className="px-6 py-3.5">
                    <TokenBadge token={tx.token} label={tx.tokenLabel} />
                  </td>

                  {/* Amount */}
                  <td className="px-6 py-3.5 text-white font-semibold">
                    {tx.token === "BTC"
                      ? tx.amount.toFixed(8)
                      : tx.amount.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 6,
                        })}
                    <span className="text-gray-500 text-xs ml-1">
                      {tx.tokenLabel}
                    </span>
                  </td>

                  {/* From */}
                  <td className="px-6 py-3.5">
                    <div className="flex items-center font-mono text-gray-400 text-xs">
                      {tx.sender.slice(0, 10)}…{tx.sender.slice(-6)}
                      <CopyBtn text={tx.sender} />
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-6 py-3.5">
                    <StatusDot status={tx.status} />
                  </td>

                  {/* Explorer link */}
                  <td className="px-6 py-3.5">
                    <a
                      href={tx.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-gray-500 hover:text-[#f97316] transition-colors text-xs"
                    >
                      {tx.id.slice(0, 8)}…
                      <ExternalLink size={11} />
                    </a>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Footer note ──────────────────────────────────────────────────────── */}
      {!loading && txs.length > 0 && (
        <div className="px-6 py-3 border-t border-white/[0.04] text-gray-600 text-xs">
          Showing up to 50 most recent incoming BTC transactions via{" "}
          <a
            href="https://mempool.space"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-white transition-colors"
          >
            mempool.space
          </a>
        </div>
      )}
    </motion.div>
  );
}
