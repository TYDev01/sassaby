"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DollarSign,
  TrendingUp,
  Activity,
  CheckCircle2,
  Clock,
  XCircle,
  BarChart3,
  RefreshCw,
  ArrowUpRight,
  ShieldAlert,
  Wallet,
  Loader2,
  Sliders,
  Wifi,
  WifiOff,
  History,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import { STATUS_LABEL, STATUS_STYLE } from "@/lib/orderStatus";
import { fetchAdminStats, AdminStats, Order, fetchRateConfig, updateRateConfig, RateConfig, RateMode, fetchDepositAddresses, upsertDepositAddress, deleteDepositAddress, DepositAddress, AssetSpec } from "@/lib/api";
import { MapPin, Trash2, Lock, Megaphone, Inbox } from "lucide-react";
import AdBookManager from "@/components/AdBookManager";
import BitgetOrders from "@/components/BitgetOrders";
import MarketRates from "@/components/MarketRates";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import AdminChainHistory from "@/components/AdminChainHistory";
import { TokenIcon } from "@/components/AssetPicker";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtUSD(n: number) {
  return `$${fmt(n)}`;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent?: string;
  delay?: number;
}

function StatCard({ label, value, sub, icon, accent = "#f97316", delay = 0 }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45, ease: "easeOut" }}
      className="
        bg-[#111111] border border-white/[0.07] rounded-2xl px-6 py-5
        flex flex-col gap-3
      "
    >
      <div className="flex items-center justify-between">
        <p className="text-gray-400 text-xs font-medium uppercase tracking-widest">{label}</p>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${accent}22`, color: accent }}
        >
          {icon}
        </div>
      </div>
      <p className="text-white text-2xl font-bold tracking-tight">{value}</p>
      {sub && <p className="text-gray-500 text-xs">{sub}</p>}
    </motion.div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Order["status"] }) {
  return (
    <span
      className={`text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full border ${STATUS_STYLE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

// ─── Recent Transfers Table ───────────────────────────────────────────────────

function RecentTransfersTable({ transfers }: { transfers: Order[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.45 }}
      className="bg-[#111111] border border-white/[0.07] rounded-2xl overflow-hidden"
    >
      <div className="px-6 py-4 border-b border-white/[0.07] flex items-center gap-2">
        <Activity size={16} className="text-[#f97316]" />
        <h2 className="text-white font-semibold text-sm">Recent Transfers</h2>
      </div>

      {transfers.length === 0 ? (
        <div className="px-6 py-12 text-center text-gray-500 text-sm">
          No transfers yet. Submit your first transfer from the main page.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-white/[0.05]">
                <th className="px-6 py-3 text-left font-medium">ID</th>
                <th className="px-6 py-3 text-left font-medium">Date</th>
                <th className="px-6 py-3 text-left font-medium">Sent</th>
                <th className="px-6 py-3 text-left font-medium">USD Value</th>
                <th className="px-6 py-3 text-left font-medium">Receive</th>
                <th className="px-6 py-3 text-left font-medium">Bank</th>
                <th className="px-6 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t, i) => (
                <motion.tr
                  key={t.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * i }}
                  className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-6 py-3.5 font-mono text-gray-400 text-xs">
                    {t.id.slice(0, 8)}…
                  </td>
                  <td className="px-6 py-3.5 text-gray-400 whitespace-nowrap">
                    {new Date(t.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "2-digit",
                    })}
                  </td>
                  <td className="px-6 py-3.5 text-white font-medium">
                    {fmt(t.sendAmount, 4)} {t.sendToken}
                  </td>
                  <td className="px-6 py-3.5 text-[#f97316] font-semibold">
                    {fmtUSD(t.usdEquivalent)}
                  </td>
                  <td className="px-6 py-3.5 text-white">
                    {fmt(t.receiveAmount)} {t.receiveCurrency}
                  </td>
                  <td className="px-6 py-3.5 text-gray-400">{t.bank}</td>
                  <td className="px-6 py-3.5">
                    <StatusBadge status={t.status} />
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}

// ─── Volume by Token Bar Chart ────────────────────────────────────────────────

const TOKEN_COLORS: Record<string, string> = {
  BTC:  "#f7931a",
  LTC:  "#bfbbbb",
  ETH:  "#627eea",
  BNB:  "#f3ba2f",
  TRX:  "#ef0027",
  SOL:  "#66f9a1",
  USDT: "#26a17b",
  USDC: "#2775ca",
};

function VolumeByTokenChart({ data }: { data: AdminStats["volumeByToken"] }) {
  const chartData = Object.entries(data).map(([token, volume]) => ({ token, volume }));
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, duration: 0.45 }}
      className="bg-[#111111] border border-white/[0.07] rounded-2xl px-6 py-5"
    >
      <div className="flex items-center gap-2 mb-5">
        <BarChart3 size={16} className="text-[#f97316]" />
        <h2 className="text-white font-semibold text-sm">Volume by Token (USD)</h2>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} barCategoryGap="30%">
          <XAxis
            dataKey="token"
            tick={{ fill: "#6b7280", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#6b7280", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `$${(v as number).toLocaleString()}`}
          />
          <Tooltip
            contentStyle={{
              background: "#1a1a1a",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              color: "#fff",
            }}
            formatter={(v) => [`$${fmt(Number(v ?? 0))}`, "Volume"]}
          />
          <Bar dataKey="volume" radius={[6, 6, 0, 0]}>
            {chartData.map((entry) => (
              <Cell key={entry.token} fill={TOKEN_COLORS[entry.token] ?? "#f97316"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

// ─── Volume by Currency Pie Chart ─────────────────────────────────────────────

const CURRENCY_COLORS: Record<string, string> = {
  NGN: "#10b981",
  GHS: "#3b82f6",
  KES: "#a855f7",
};

// ─── Currency Distribution ────────────────────────────────────────────────────

function CurrencyDistributionChart({ data }: { data: AdminStats["volumeByCurrency"] }) {
  const total = Object.values(data).reduce((s, v) => s + v, 0);
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.42, duration: 0.45 }}
      className="bg-[#111111] border border-white/[0.07] rounded-2xl px-6 py-5"
    >
      <div className="flex items-center gap-2 mb-5">
        <TrendingUp size={16} className="text-[#f97316]" />
        <h2 className="text-white font-semibold text-sm">Receive Currency Distribution</h2>
      </div>
      <div className="flex flex-col gap-3">
        {Object.entries(data).map(([currency, volume]) => {
          const pct = total > 0 ? (volume / total) * 100 : 0;
          return (
            <div key={currency}>
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>{currency}</span>
                <span>{fmt(pct, 1)}%</span>
              </div>
              <div className="w-full bg-white/[0.06] rounded-full h-2">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ delay: 0.6, duration: 0.7, ease: "easeOut" }}
                  className="h-2 rounded-full"
                  style={{ backgroundColor: CURRENCY_COLORS[currency] ?? "#f97316" }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─── Admin address ────────────────────────────────────────────────────────────

// ─── Auth gates ───────────────────────────────────────────────────────────────
//
// Operator access is the `isAdmin` flag on the signed-in account, granted in SQL.
// These gates are presentation only — the actual protection lives in the Next.js
// admin proxy routes (src/app/api/_requireAdmin.ts), which authorise the caller
// before attaching ADMIN_API_KEY. The old wallet-address check protected nothing.

function SignInGate() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="flex flex-col items-center justify-center flex-1 py-32 px-6 text-center"
    >
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        className="w-20 h-20 rounded-2xl mb-8 bg-[#f97316]/10 border border-[#f97316]/20 flex items-center justify-center"
      >
        <Lock size={34} className="text-[#f97316]" />
      </motion.div>

      <h2 className="text-white text-2xl font-bold tracking-tight mb-3">
        Sign in to continue
      </h2>
      <p className="text-gray-400 text-sm max-w-xs mb-8 leading-relaxed">
        The operator dashboard requires an account with admin access.
      </p>

      <Link href="/signin?next=/admin">
        <motion.div
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          className="px-8 py-3.5 rounded-xl bg-[#f97316] hover:bg-[#ea6c0e] text-white font-semibold text-sm shadow-lg shadow-[#f97316]/20 transition-all duration-200 cursor-pointer"
        >
          Sign in
        </motion.div>
      </Link>
    </motion.div>
  );
}

function UnauthorisedGate({ email }: { email: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="flex flex-col items-center justify-center flex-1 py-32 px-6 text-center"
    >
      <div className="w-20 h-20 rounded-2xl mb-8 bg-red-500/10 border border-red-500/20 flex items-center justify-center">
        <Lock size={34} className="text-red-400" />
      </div>

      <h2 className="text-white text-2xl font-bold tracking-tight mb-3">
        No operator access
      </h2>
      <p className="text-gray-400 text-sm max-w-sm leading-relaxed">
        <span className="text-gray-300 font-medium">{email}</span> is signed in but
        does not have admin access on this desk.
      </p>
    </motion.div>
  );
}

// ─── Rate Manager ─────────────────────────────────────────────────────────────

const RATE_CURRENCIES: Array<{ code: string; label: string; flag: string }> = [
  { code: "NGN", label: "Nigerian Naira",   flag: "🇳🇬" },
  { code: "GHS", label: "Ghanaian Cedi",    flag: "🇬🇭" },
  { code: "KES", label: "Kenyan Shilling",  flag: "🇰🇪" },
];

function RateManager() {
  const [config, setConfig] = useState<RateConfig | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [savedFlag, setSavedFlag] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchRateConfig()
      .then((cfg) => {
        setConfig(cfg);
        const d: Record<string, string> = {};
        for (const c of RATE_CURRENCIES) d[c.code] = String(cfg.manualRates[c.code] ?? "");
        setDrafts(d);
      })
      .catch(() => {});
  }, []);

  async function handleToggle(currency: string, mode: RateMode) {
    if (!config) return;
    setSaving((s) => ({ ...s, [currency]: true }));
    try {
      const updated = await updateRateConfig({ modes: { [currency]: mode } });
      setConfig(updated);
      toast.success(`${currency} switched to ${mode === "manual" ? "Set Rate" : "API Rate"}`);
    } catch {
      toast.error("Failed to update rate mode");
    } finally {
      setSaving((s) => ({ ...s, [currency]: false }));
    }
  }

  async function handleSaveRate(currency: string) {
    const value = parseFloat(drafts[currency]);
    if (!value || value <= 0) { toast.error("Enter a valid rate"); return; }
    setSaving((s) => ({ ...s, [currency]: true }));
    try {
      const updated = await updateRateConfig({
        manualRates: { [currency]: value },
        modes: { [currency]: "manual" },
      });
      setConfig(updated);
      setSavedFlag((s) => ({ ...s, [currency]: true }));
      setTimeout(() => setSavedFlag((s) => ({ ...s, [currency]: false })), 2000);
      toast.success(`${currency} rate set to ${value.toLocaleString()}`);
    } catch {
      toast.error("Failed to save rate");
    } finally {
      setSaving((s) => ({ ...s, [currency]: false }));
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45, duration: 0.45 }}
      className="bg-[#111111] border border-white/[0.07] rounded-2xl overflow-hidden"
    >
      <div className="px-6 py-4 border-b border-white/[0.07] flex items-center gap-2">
        <Sliders size={16} className="text-[#f97316]" />
        <h2 className="text-white font-semibold text-sm">Rate Manager</h2>
        <span className="ml-auto text-[11px] text-gray-500 font-medium uppercase tracking-wider">
          USD → Fiat conversion rate
        </span>
      </div>

      {!config ? (
        <div className="px-6 py-10 flex items-center justify-center gap-2 text-gray-500 text-sm">
          <Loader2 size={16} className="animate-spin" />
          Loading rate config…
        </div>
      ) : (
        <div className="divide-y divide-white/[0.05]">
          {RATE_CURRENCIES.map((cur) => {
            const mode: RateMode = config.modes[cur.code] ?? "api";
            const isManual = mode === "manual";
            const isSaving = saving[cur.code];
            const isSaved  = savedFlag[cur.code];

            return (
              <div key={cur.code} className="px-4 sm:px-6 py-5 flex flex-col gap-4">
                {/* Currency label */}
                <div className="flex items-center gap-3 min-w-[160px]">
                  <span className="text-xl">{cur.flag}</span>
                  <div>
                    <p className="text-white text-sm font-semibold">{cur.code}</p>
                    <p className="text-gray-500 text-xs">{cur.label}</p>
                  </div>
                </div>

                {/* Mode toggle */}
                <div className="flex items-center gap-1 rounded-xl bg-[#1a1a1a] border border-white/[0.08] p-1">
                  <button
                    onClick={() => { if (isManual) handleToggle(cur.code, "api"); }}
                    disabled={isSaving}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
                      !isManual
                        ? "bg-[#f97316] text-white shadow"
                        : "text-gray-500 hover:text-gray-300"
                    } disabled:opacity-50`}
                  >
                    <Wifi size={12} />
                    API Rate
                  </button>
                  <button
                    onClick={() => { if (!isManual) handleToggle(cur.code, "manual"); }}
                    disabled={isSaving}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
                      isManual
                        ? "bg-[#6366f1] text-white shadow"
                        : "text-gray-500 hover:text-gray-300"
                    } disabled:opacity-50`}
                  >
                    <WifiOff size={12} />
                    Set Rate
                  </button>
                </div>

                {/* Rate input */}
                <div className="flex items-center gap-2 flex-1 flex-wrap">
                  <div className="relative flex-1 max-w-[200px]">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-medium pointer-events-none">
                      1 USD =
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={drafts[cur.code] ?? ""}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [cur.code]: e.target.value }))
                      }
                      placeholder={String(config.manualRates[cur.code] ?? "")}
                      className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-lg pl-16 pr-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-[#6366f1]/60 transition-colors"
                    />
                  </div>
                  <span className="text-gray-500 text-xs font-medium w-8">{cur.code}</span>
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={() => handleSaveRate(cur.code)}
                    disabled={isSaving || !drafts[cur.code]}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
                      isSaved
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : "bg-[#6366f1]/20 text-[#818cf8] border border-[#6366f1]/30 hover:bg-[#6366f1]/30"
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    {isSaving ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : isSaved ? (
                      "Saved ✓"
                    ) : (
                      "Apply"
                    )}
                  </motion.button>
                </div>

                {/* Active rate indicator */}
                <div className="text-right min-w-[110px]">
                  <p className="text-[11px] text-gray-500 uppercase tracking-wider">Active rate</p>
                  <p className={`text-sm font-bold mt-0.5 ${isManual ? "text-[#818cf8]" : "text-[#f97316]"}`}>
                    {isManual
                      ? `${(config.manualRates[cur.code] ?? 0).toLocaleString("en-US")} ${cur.code}`
                      : "Live (API)"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 -mb-3">
      <h2 className="text-white text-sm font-semibold">{title}</h2>
      <p className="text-gray-500 text-xs">{hint}</p>
    </div>
  );
}

// ─── Bitget P2P ───────────────────────────────────────────────────────────────

/**
 * The desk's own trading, shown beside the customer figures and never added to
 * them. Selling a customer's USDT on P2P is the same value crossing twice; one
 * combined total would describe neither book.
 */
function P2PSection({ p2p }: { p2p?: AdminStats["p2p"] }) {
  if (!p2p) return null;

  if (!p2p.available) {
    return (
      <>
        <SectionLabel title="Bitget P2P" hint="The desk rebalancing against customer flow" />
        <div className="flex items-start gap-2.5 rounded-2xl border border-white/[0.07] bg-[#111111] px-6 py-5 text-sm">
          <ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-400" />
          <div>
            <p className="text-gray-300 font-medium">P2P figures unavailable</p>
            <p className="text-gray-500 text-xs mt-0.5">
              {p2p.error ?? "Bitget could not be reached."} Customer figures above are
              unaffected.
            </p>
          </div>
        </div>
      </>
    );
  }

  const fiat = Object.entries(p2p.volumeByFiat);

  return (
    <>
      <SectionLabel
        title="Bitget P2P"
        hint={
          p2p.truncated
            ? "Completed trades — showing the most recent 1,000, so totals are a floor"
            : "All completed trades — the desk rebalancing against customer flow"
        }
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="P2P Volume"
          value={fmtUSD(p2p.volumeUSD)}
          sub={`Bought ${fmtUSD(p2p.boughtUSD)} · sold ${fmtUSD(p2p.soldUSD)}`}
          icon={<TrendingUp size={18} />}
          accent="#22c55e"
        />
        <StatCard
          label="P2P Trades"
          value={`${p2p.completedOrders.toLocaleString()}${p2p.truncated ? "+" : ""}`}
          sub={`${p2p.pendingOrders} awaiting action`}
          icon={<Megaphone size={18} />}
          accent="#6366f1"
          delay={0.05}
        />
        <StatCard
          label="Fiat Moved"
          value={
            fiat.length > 0
              ? fiat
                  .map(([c, v]) => `${v.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${c}`)
                  .join(" · ")
              : "—"
          }
          sub="Across completed P2P orders"
          icon={<DollarSign size={18} />}
          accent="#eab308"
          delay={0.1}
        />
        <StatCard
          label="P2P Fees"
          value={fmtUSD(p2p.feesUSD)}
          sub="Charged by Bitget"
          icon={<ArrowUpRight size={18} />}
          accent="#ef4444"
          delay={0.15}
        />
      </div>
    </>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`bg-white/[0.05] rounded-xl animate-pulse ${className ?? ""}`} />
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-56" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

// ─── Deposit Address Manager ──────────────────────────────────────────────────
//
// Keyed on (token, chain), not token alone — USDT lives on five networks at five
// different addresses. The asset list comes from the backend registry so this
// panel never drifts from what the API will actually accept.

interface AddrDraft {
  address: string;
  label: string;
  memo: string;
  kind: "self" | "bitget";
}

const EMPTY_DRAFT: AddrDraft = { address: "", label: "", memo: "", kind: "self" };

function DepositAddressManager() {
  const [assets, setAssets] = useState<AssetSpec[]>([]);
  const [map, setMap] = useState<Record<string, DepositAddress>>({});
  const [drafts, setDrafts] = useState<Record<string, AddrDraft>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [savedFlag, setSavedFlag] = useState<Record<string, boolean>>({});
  const [loadingInit, setLoadingInit] = useState(true);

  useEffect(() => {
    fetchDepositAddresses()
      .then((data) => {
        setAssets(data.supported ?? []);
        setMap(data.addresses ?? {});
        const d: Record<string, AddrDraft> = {};
        for (const a of data.supported ?? []) {
          const key = `${a.token}:${a.chain}`;
          const existing = data.addresses?.[key];
          d[key] = {
            address: existing?.address ?? "",
            label: existing?.label ?? "",
            memo: existing?.memo ?? "",
            kind: "self",
          };
        }
        setDrafts(d);
      })
      .catch(() => {})
      .finally(() => setLoadingInit(false));
  }, []);

  function patchDraft(key: string, patch: Partial<AddrDraft>) {
    setDrafts((d) => ({ ...d, [key]: { ...(d[key] ?? EMPTY_DRAFT), ...patch } }));
  }

  async function handleSave(asset: AssetSpec) {
    const key = `${asset.token}:${asset.chain}`;
    const draft = drafts[key];
    if (!draft?.address.trim()) { toast.error("Enter a deposit address"); return; }
    // A missing memo on a chain that needs one loses client funds, so refuse it
    // here rather than discovering it after a deposit goes astray.
    if (asset.requiresMemo && !draft.memo.trim()) {
      toast.error(`${asset.network} requires a memo/tag`, {
        description: "Deposits without it can be lost and need manual recovery.",
      });
      return;
    }

    setSaving((s) => ({ ...s, [key]: true }));
    try {
      const saved = await upsertDepositAddress({
        token: asset.token,
        chain: asset.chain,
        address: draft.address.trim(),
        memo: draft.memo.trim(),
        label: draft.label.trim(),
        kind: draft.kind,
      });
      setMap((m) => ({ ...m, [key]: saved }));
      setSavedFlag((s) => ({ ...s, [key]: true }));
      setTimeout(() => setSavedFlag((s) => ({ ...s, [key]: false })), 2000);
      toast.success(`${asset.token} on ${asset.network} saved`);
    } catch {
      toast.error(`Failed to save ${asset.token} address`);
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  }

  async function handleDelete(asset: AssetSpec) {
    const key = `${asset.token}:${asset.chain}`;
    setDeleting((s) => ({ ...s, [key]: true }));
    try {
      await deleteDepositAddress(asset.token, asset.chain);
      setMap((m) => { const n = { ...m }; delete n[key]; return n; });
      setDrafts((d) => ({ ...d, [key]: EMPTY_DRAFT }));
      toast.success(`${asset.token} on ${asset.network} removed`);
    } catch {
      toast.error(`Failed to remove ${asset.token} address`);
    } finally {
      setDeleting((s) => ({ ...s, [key]: false }));
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.45 }}
      className="bg-[#111111] border border-white/[0.07] rounded-2xl overflow-hidden"
    >
      <div className="px-6 py-4 border-b border-white/[0.07] flex items-center gap-2">
        <MapPin size={16} className="text-[#f97316]" />
        <h2 className="text-white font-semibold text-sm">Deposit Address Manager</h2>
        <span className="ml-auto text-[11px] text-gray-500 font-medium uppercase tracking-wider">
          Per token &amp; network
        </span>
      </div>

      {loadingInit ? (
        <div className="px-6 py-10 flex items-center justify-center gap-2 text-gray-500 text-sm">
          <Loader2 size={16} className="animate-spin" />
          Loading addresses…
        </div>
      ) : (
        <div className="divide-y divide-white/[0.05]">
          {assets.map((asset) => {
            const key = `${asset.token}:${asset.chain}`;
            const existing = map[key];
            const draft = drafts[key] ?? EMPTY_DRAFT;
            const isSaving = saving[key];
            const isDeleting = deleting[key];
            const isSaved = savedFlag[key];
            const hasExisting = !!existing?.address;

            return (
              <div key={key} className="px-4 sm:px-6 py-5 flex flex-col gap-3">
                {/* Asset header */}
                <div className="flex items-center gap-3">
                  <TokenIcon token={asset.token} chain={asset.chain} size={32} />
                  <div className="min-w-0">
                    <p className="text-white text-sm font-semibold">{asset.token}</p>
                    <p className="text-gray-500 text-xs truncate">{asset.network}</p>
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                    {/* Chains without a monitor adapter cannot be auto-detected —
                        deposits there must route via Bitget or be checked by hand. */}
                    {!asset.monitored && (
                      <span className="hidden sm:inline text-[11px] text-amber-400/90 bg-amber-400/10 border border-amber-400/20 rounded-full px-2.5 py-0.5">
                        No auto-detect
                      </span>
                    )}
                    {hasExisting && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2.5 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Active
                      </span>
                    )}
                  </div>
                </div>

                {/* Address + label */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={draft.address}
                    onChange={(e) => patchDraft(key, { address: e.target.value })}
                    placeholder={`${asset.token} address on ${asset.network}…`}
                    className="flex-1 bg-[#1a1a1a] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white font-mono placeholder:text-gray-600 focus:outline-none focus:border-white/20 transition-colors"
                  />
                  <input
                    type="text"
                    value={draft.label}
                    onChange={(e) => patchDraft(key, { label: e.target.value })}
                    placeholder="Label (optional)"
                    className="w-full sm:w-40 bg-[#1a1a1a] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-white/20 transition-colors"
                  />
                </div>

                {/* Memo + custody */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={draft.memo}
                    onChange={(e) => patchDraft(key, { memo: e.target.value })}
                    placeholder={asset.requiresMemo ? "Memo / tag (required)" : "Memo / tag (optional)"}
                    className={`flex-1 bg-[#1a1a1a] border rounded-lg px-4 py-2.5 text-sm text-white font-mono placeholder:text-gray-600 focus:outline-none transition-colors ${
                      asset.requiresMemo && !draft.memo.trim()
                        ? "border-amber-500/40 focus:border-amber-500/70"
                        : "border-white/[0.08] focus:border-white/20"
                    }`}
                  />
                  <select
                    value={draft.kind}
                    onChange={(e) => patchDraft(key, { kind: e.target.value as "self" | "bitget" })}
                    className="w-full sm:w-40 bg-[#1a1a1a] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-white/20 transition-colors cursor-pointer"
                  >
                    <option value="self">Self-custody</option>
                    <option value="bitget">Bitget</option>
                  </select>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={() => handleSave(asset)}
                    disabled={isSaving || !draft.address.trim()}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
                      isSaved
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : "bg-[#6366f1]/20 text-[#818cf8] border border-[#6366f1]/30 hover:bg-[#6366f1]/30"
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    {isSaving ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : isSaved ? (
                      "Saved ✓"
                    ) : (
                      "Save Address"
                    )}
                  </motion.button>

                  {hasExisting && (
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      onClick={() => handleDelete(asset)}
                      disabled={isDeleting}
                      className="px-4 py-2 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all duration-200 cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      Remove
                    </motion.button>
                  )}

                  {hasExisting && (
                    <p className="ml-auto text-[11px] text-gray-600 font-mono truncate max-w-[200px]">
                      {existing.address.slice(0, 10)}…{existing.address.slice(-6)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [tab, setTab] = useState<"overview" | "history" | "addresses" | "ads" | "orders" | "rates">("overview");

  const isAuthorised = !!user?.isAdmin;
  const isWrongAddress = !!user && !user.isAdmin;

  // The BTC receiving address is admin config now, not a connected wallet.
  const [btcDepositAddress, setBtcDepositAddress] = useState<string | undefined>();
  useEffect(() => {
    if (!isAuthorised) return;
    fetchDepositAddresses()
      .then((d) => setBtcDepositAddress(d.addresses["BTC:bitcoin"]?.address))
      .catch(() => {});
  }, [isAuthorised]);

  // Warn once when a signed-in account lacks operator access.
  const toastedRef = useRef(false);
  useEffect(() => {
    if (isWrongAddress && !toastedRef.current) {
      toastedRef.current = true;
      toast.error("No operator access", {
        description: `${user?.email} does not have admin access on this desk.`,
        duration: 6000,
      });
    }
    if (!isWrongAddress) toastedRef.current = false;
  }, [isWrongAddress, user?.email]);

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const data = await fetchAdminStats();
      setStats(data);
      setLastUpdated(new Date());
    } catch {
      setError("Unable to connect to the backend. Check that the server is running and NEXT_PUBLIC_API_URL is set correctly.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthorised) return;
    load();
    const interval = setInterval(() => load(true), 15000);
    return () => clearInterval(interval);
  }, [load, isAuthorised]);

  // ── Auth gates ────────────────────────────────────────────────────────────
  if (authLoading) return null;
  if (!user) {
    return (
      <div className="relative z-10 min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center">
          <SignInGate />
        </main>
      </div>
    );
  }

  if (isWrongAddress) {
    return (
      <div className="relative z-10 min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center">
          <UnauthorisedGate email={user?.email ?? ""} />
        </main>
      </div>
    );
  }

  return (
    <div className="relative z-10 min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 px-4 sm:px-6 pt-28 sm:pt-32 pb-20 max-w-[1280px] mx-auto w-full">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-6"
        >
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Admin Dashboard</h1>
            <p className="text-gray-500 text-sm mt-1">
              {tab === "overview"
                ? lastUpdated
                  ? `Last updated ${lastUpdated.toLocaleTimeString()}`
                  : "Real-time transfer metrics"
                : tab === "history"
                ? "Incoming on-chain transactions to the platform address"
                : "Manage per-token deposit addresses shown to users"}
            </p>
          </div>
          {tab === "overview" && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => load(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.06] border border-white/10 text-gray-300 text-sm hover:text-white hover:bg-white/[0.1] transition-all duration-200 cursor-pointer"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              Refresh
            </motion.button>
          )}
        </motion.div>

        {/* Tab navigation */}
        <div className="flex items-center gap-0 mb-8 border-b border-white/[0.06]">
          {(["overview", "history", "addresses", "ads", "orders", "rates"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-3 sm:px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-all duration-200 cursor-pointer capitalize ${
                tab === t
                  ? "border-[#f97316] text-white"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {t === "overview" ? (
                <BarChart3 size={14} />
              ) : t === "history" ? (
                <History size={14} />
              ) : t === "ads" ? (
                <Megaphone size={14} />
              ) : t === "orders" ? (
                <Inbox size={14} />
              ) : t === "rates" ? (
                <TrendingUp size={14} />
              ) : (
                <MapPin size={14} />
              )}
              {t === "addresses"
                ? "Addresses"
                : t === "ads"
                ? "Ad book"
                : t === "rates"
                ? "Market"
                : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <>
            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mb-6 px-5 py-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-2"
                >
                  <XCircle size={16} />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {loading ? (
              <DashboardSkeleton />
        ) : stats ? (
          <div className="flex flex-col gap-8">
            {/* ── Customer orders, from the site ────────────────────────────── */}
            <SectionLabel
              title="Customer orders"
              hint="Placed on the site — the desk's own business"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Total Volume"
                value={fmtUSD(stats.totalVolumeUSD)}
                sub="Cumulative USD transacted"
                icon={<DollarSign size={18} />}
                delay={0}
              />
              <StatCard
                label="Total Transactions"
                value={stats.totalTransactions.toLocaleString()}
                sub={`Avg ${fmtUSD(stats.avgTransactionUSD)} per tx`}
                icon={<Activity size={18} />}
                accent="#6366f1"
                delay={0.05}
              />
              <StatCard
                label="Total Fees Collected"
                value={fmtUSD(stats.totalFeesUSD)}
                sub="Protocol revenue (USD)"
                icon={<TrendingUp size={18} />}
                accent="#10b981"
                delay={0.1}
              />
              <StatCard
                label="Total Paid Out"
                value={fmtUSD(stats.totalReceivedUSD)}
                sub="Net amount disbursed"
                icon={<ArrowUpRight size={18} />}
                accent="#eab308"
                delay={0.15}
              />
            </div>

            {/* ── Status KPI Cards ──────────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Completed"
                value={stats.completedTransactions.toLocaleString()}
                sub={`${stats.totalTransactions > 0 ? ((stats.completedTransactions / stats.totalTransactions) * 100).toFixed(1) : "0"}% success rate`}
                icon={<CheckCircle2 size={18} />}
                accent="#10b981"
                delay={0.2}
              />
              <StatCard
                label="Pending / Processing"
                value={stats.pendingTransactions.toLocaleString()}
                sub="In-flight transactions"
                icon={<Clock size={18} />}
                accent="#eab308"
                delay={0.25}
              />
              <StatCard
                label="Failed"
                value={stats.failedTransactions.toLocaleString()}
                sub="Requires investigation"
                icon={<XCircle size={18} />}
                accent="#ef4444"
                delay={0.3}
              />
              <StatCard
                label="Avg Transaction"
                value={fmtUSD(stats.avgTransactionUSD)}
                sub="Mean USD value per tx"
                icon={<BarChart3 size={18} />}
                accent="#a855f7"
                delay={0.35}
              />
            </div>

            {/* ── Bitget P2P, kept separate on purpose ──────────────────────── */}
            <P2PSection p2p={stats.p2p} />

            {/* ── Charts Row ────────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <VolumeByTokenChart data={stats.volumeByToken} />
              <CurrencyDistributionChart data={stats.volumeByCurrency} />
            </div>
            {/* ── Rate Manager ───────────────────────────────────────────── */}
            <RateManager />
            {/* ── Recent Transfers Table ─────────────────────────────────────── */}
            <RecentTransfersTable transfers={stats.recentTransfers} />
            </div>
          ) : null}
          </>
        )}

        {tab === "history" && (
          <AdminChainHistory btcAddress={btcDepositAddress} />
        )}

        {tab === "addresses" && (
          <DepositAddressManager />
        )}

        {tab === "ads" && <AdBookManager />}

        {tab === "orders" && <BitgetOrders />}

        {tab === "rates" && <MarketRates />}
      </main>
    </div>
  );
}
