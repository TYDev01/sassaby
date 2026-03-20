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

const ADMIN_STX = process.env.NEXT_PUBLIC_ADMIN_ADDRESS ?? "";
const HIRO_API = "https://api.hiro.so";
const MEMPOOL_API = "https://mempool.space/api";

// Exact contract prefix for USDCx — must match Backend STACKS_USDC_CONTRACT env var.
const USDC_CONTRACT_PREFIX = (
  process.env.NEXT_PUBLIC_STACKS_USDC_CONTRACT ??
  "SP120SBRBQJ00MCWS7TM5R8WJNTTKD5K0HFRC2CNE.usdcx"
).toLowerCase();

// ─── Types ────────────────────────────────────────────────────────────────────

type ChainToken = "STX" | "USDCx" | "BTC" | "Token";

interface ChainTx {
  id: string;
  chain: "stacks" | "bitcoin";
  token: ChainToken;
  tokenLabel: string;
  sender: string;
  amount: number;
  decimals: number;
  timestamp: number;
  status: "confirmed" | "pending" | "failed";
  explorerUrl: string;
}

// ─── Hiro API shapes ──────────────────────────────────────────────────────────

interface HiroStxEvent {
  type: string;
  amount: string;
  sender: string;
  recipient: string;
}

interface HiroFtEvent {
  asset_identifier: string;
  amount: string;
  sender: string;
  recipient: string;
}

interface HiroTxWithTransfers {
  tx: {
    tx_id: string;
    tx_status: string;
    block_time: number;
    sender_address: string;
    tx_type: string;
  };
  stx_received: string;
  events: {
    stx: HiroStxEvent[];
    ft: HiroFtEvent[];
  };
}

// ─── Mempool.space shapes ─────────────────────────────────────────────────────

interface MempoolTx {
  txid: string;
  status: { confirmed: boolean; block_time?: number };
  vin: Array<{ prevout?: { scriptpubkey_address?: string; value: number } }>;
  vout: Array<{ scriptpubkey_address?: string; value: number }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function classifyFtToken(assetId: string): { token: ChainToken; label: string; decimals: number } {
  const lower = assetId.toLowerCase();
  // Use the same exact prefix the backend uses (STACKS_USDC_CONTRACT) so
  // classification is consistent across the stack.
  if (lower.startsWith(USDC_CONTRACT_PREFIX)) {
    return { token: "USDCx", label: "USDCx", decimals: 6 };
  }
  // Extract the human-readable symbol after the last "::"
  const sym = assetId.split("::").pop() ?? assetId;
  return { token: "Token", label: sym.slice(0, 10), decimals: 6 };
}

function txStatus(raw: string): ChainTx["status"] {
  if (raw === "success") return "confirmed";
  if (raw === "pending") return "pending";
  return "failed";
}

// ─── Fetch: Stacks incoming transactions ──────────────────────────────────────

async function fetchStacksTxs(): Promise<ChainTx[]> {
  const url =
    `${HIRO_API}/extended/v1/address/${ADMIN_STX}/transactions_with_transfers` +
    `?limit=50&offset=0`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Stacks API returned ${res.status}`);

  const json = (await res.json()) as { results: HiroTxWithTransfers[] };
  const out: ChainTx[] = [];

  for (const item of json.results) {
    const blockTime = item.tx.block_time;
    const timestamp = blockTime > 0 ? blockTime * 1000 : Date.now();
    const status = txStatus(item.tx.tx_status);
    const explorerUrl = `https://explorer.hiro.so/txid/${item.tx.tx_id}?chain=mainnet`;

    // ── Incoming STX ───────────────────────────────────────────────────────────
    if (Number(item.stx_received) > 0) {
      const stxEvent = item.events?.stx?.find((e) => e.recipient === ADMIN_STX);
      out.push({
        id: item.tx.tx_id,
        chain: "stacks",
        token: "STX",
        tokenLabel: "STX",
        sender: stxEvent?.sender ?? item.tx.sender_address,
        amount: Number(item.stx_received) / 1_000_000,
        decimals: 6,
        timestamp,
        status,
        explorerUrl,
      });
    }

    // ── Incoming FT (USDCx, etc.) ──────────────────────────────────────────────
    for (const ft of item.events?.ft ?? []) {
      if (ft.recipient !== ADMIN_STX) continue;
      const { token, label, decimals } = classifyFtToken(ft.asset_identifier);
      out.push({
        id: `${item.tx.tx_id}::${ft.asset_identifier}`,
        chain: "stacks",
        token,
        tokenLabel: label,
        sender: ft.sender,
        amount: Number(ft.amount) / Math.pow(10, decimals),
        decimals,
        timestamp,
        status,
        explorerUrl,
      });
    }
  }

  return out.sort((a, b) => b.timestamp - a.timestamp);
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
  STX:   "text-[#f97316] bg-[#f97316]/10 border-[#f97316]/20",
  USDCx: "text-[#6366f1] bg-[#6366f1]/10 border-[#6366f1]/20",
  BTC:   "text-[#eab308] bg-[#eab308]/10 border-[#eab308]/20",
  Token: "text-gray-400  bg-gray-400/10  border-gray-400/20",
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

// ─── Filter pills ─────────────────────────────────────────────────────────────

type Filter = "all" | ChainToken;

const FILTER_BTNS: { key: Filter; label: string }[] = [
  { key: "all",   label: "All" },
  { key: "STX",   label: "STX" },
  { key: "USDCx", label: "USDCx" },
  { key: "BTC",   label: "BTC" },
];

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
  const [filter, setFilter]     = useState<Filter>("all");

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setErrors([]);

      const [stacksRes, btcRes] = await Promise.allSettled([
        fetchStacksTxs(),
        btcAddress ? fetchBtcTxs(btcAddress) : Promise.resolve([]),
      ]);

      const combined: ChainTx[] = [
        ...(stacksRes.status === "fulfilled" ? stacksRes.value : []),
        ...(btcRes.status === "fulfilled" ? btcRes.value : []),
      ].sort((a, b) => b.timestamp - a.timestamp);

      setTxs(combined);

      const errs: string[] = [];
      if (stacksRes.status === "rejected")
        errs.push("Stacks (Hiro API): " + (stacksRes.reason as Error).message);
      if (btcRes.status === "rejected")
        errs.push("Bitcoin (mempool.space): " + (btcRes.reason as Error).message);
      setErrors(errs);

      setLoading(false);
      setRefreshing(false);
    },
    [btcAddress]
  );

  useEffect(() => {
    load();
  }, [load]);

  const visible =
    filter === "all" ? txs : txs.filter((t) => t.token === filter);

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
              ({visible.length} records)
            </span>
          )}
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1 sm:ml-2">
          {FILTER_BTNS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                filter === f.key
                  ? "bg-[#f97316] text-white"
                  : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.05]"
              }`}
            >
              {f.label}
            </button>
          ))}
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
        <div className="flex items-center gap-1.5">
          <span className="text-gray-600">Watching STX:</span>
          <span className="font-mono text-gray-400">
            {ADMIN_STX.slice(0, 12)}…{ADMIN_STX.slice(-6)}
          </span>
          <CopyBtn text={ADMIN_STX} />
        </div>
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
            Connect admin wallet to also see BTC transactions
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
      ) : visible.length === 0 ? (
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
              {visible.map((tx, i) => (
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
          Showing up to 50 most recent incoming transactions · STX &amp; tokens
          via{" "}
          <a
            href="https://docs.hiro.so/en/apis/stacks-blockchain-api"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-white transition-colors"
          >
            Hiro Stacks API
          </a>{" "}
          · BTC via{" "}
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
