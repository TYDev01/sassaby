"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DollarSign,
  TrendingUp,
  Activity,
  CheckCircle2,
  Clock,
  XCircle,
  BarChart3,
  Layers,
  RefreshCw,
  ArrowUpRight,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import Navbar from "@/components/Navbar";
import { fetchAdminStats, AdminStats, Transfer } from "@/lib/api";

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

const STATUS_STYLES: Record<Transfer["status"], string> = {
  completed: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  pending: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  processing: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  failed: "text-red-400 bg-red-400/10 border-red-400/20",
};

function StatusBadge({ status }: { status: Transfer["status"] }) {
  return (
    <span
      className={`text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full border ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

// ─── Recent Transfers Table ───────────────────────────────────────────────────

function RecentTransfersTable({ transfers }: { transfers: Transfer[] }) {
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
                <th className="px-6 py-3 text-left font-medium">Method</th>
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
                  <td className="px-6 py-3.5 text-gray-400 capitalize">
                    {t.paymentMethod.replace("_", " ")}
                  </td>
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
  STX: "#f97316",
  USDCx: "#6366f1",
  BTC: "#eab308",
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

function VolumeByMethodChart({ data }: { data: AdminStats["volumeByMethod"] }) {
  const chartData = Object.entries(data).map(([method, volume]) => ({
    method: method.replace("_", " "),
    volume,
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.45 }}
      className="bg-[#111111] border border-white/[0.07] rounded-2xl px-6 py-5"
    >
      <div className="flex items-center gap-2 mb-5">
        <Layers size={16} className="text-[#f97316]" />
        <h2 className="text-white font-semibold text-sm">Volume by Payment Method (USD)</h2>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="volume"
            nameKey="method"
            cx="50%"
            cy="50%"
            outerRadius={70}
            innerRadius={40}
            paddingAngle={3}
          >
            {chartData.map((_, i) => (
              <Cell
                key={i}
                fill={["#f97316", "#6366f1", "#10b981"][i % 3]}
              />
            ))}
          </Pie>
          <Legend
            formatter={(v) => <span style={{ color: "#9ca3af", fontSize: 12 }}>{v}</span>}
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
        </PieChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

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

// ─── Admin Dashboard ──────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const data = await fetchAdminStats();
      setStats(data);
      setLastUpdated(new Date());
    } catch {
      setError("Unable to connect to the backend. Make sure the server is running on port 4000.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 15000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <Navbar />

      <main className="flex-1 px-6 pt-32 pb-20 max-w-[1280px] mx-auto w-full">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start justify-between mb-8"
        >
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Admin Dashboard</h1>
            <p className="text-gray-500 text-sm mt-1">
              {lastUpdated
                ? `Last updated ${lastUpdated.toLocaleTimeString()}`
                : "Real-time transfer metrics"}
            </p>
          </div>
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
        </motion.div>

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
            {/* ── Primary KPI Cards ─────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

            {/* ── Charts Row ────────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <VolumeByTokenChart data={stats.volumeByToken} />
              <VolumeByMethodChart data={stats.volumeByMethod} />
              <CurrencyDistributionChart data={stats.volumeByCurrency} />
            </div>

            {/* ── Recent Transfers Table ─────────────────────────────────────── */}
            <RecentTransfersTable transfers={stats.recentTransfers} />
          </div>
        ) : null}
      </main>
    </div>
  );
}
