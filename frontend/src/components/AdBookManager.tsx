"use client";

/**
 * The desk's Bitget P2P ad book.
 *
 * This is the rate control. Quotes are priced off the desk's published ads, so
 * the price set here is the price customers are quoted — they are the same
 * number, not two numbers kept in sync.
 *
 * Buy-side and sell-side are separate ads, and the gap between them is the
 * desk's margin. There is no percentage fee on top; a single ad prices only one
 * direction.
 */

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Megaphone,
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  fetchBitgetStatus,
  fetchDeskAds,
  fetchMarketBook,
  publishAd,
  repriceAd,
  setAdActive,
  fetchPayMethodIds,
  ApiError,
  BitgetStatus,
  DeskAd,
  MarketAd,
  PublishAdPayload,
} from "@/lib/api";

const FIATS = ["NGN", "GHS", "KES"];
const TOKENS = ["USDT", "USDC"];
/** Bitget accepts only these payment windows. */
const PAY_TIME_LIMITS = ["5", "10"];

// ─── Connection banner ────────────────────────────────────────────────────────

function StatusBanner({ status, onRetry }: { status: BitgetStatus | null; onRetry: () => void }) {
  if (!status) return null;

  if (!status.configured) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />
        <div className="text-sm">
          <p className="font-semibold text-amber-300">Bitget not configured</p>
          <p className="mt-0.5 text-amber-200/70">
            Set BITGET_API_KEY, BITGET_API_SECRET and BITGET_API_PASSPHRASE.
          </p>
        </div>
      </div>
    );
  }

  if (!status.reachable) {
    // The two errors worth naming: a missing key scope, and the account being on
    // the wrong API generation. Both look like "it's broken" otherwise.
    const err = status.error ?? "";
    const isPermission = err.includes("40014");
    const isClassic = err.includes("40084");

    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-400" />
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-red-300">
            {isPermission
              ? "API key is missing the P2P permission"
              : isClassic
              ? "Account is in Classic mode"
              : "Bitget unreachable"}
          </p>
          <p className="mt-0.5 break-words text-red-200/70">
            {isPermission
              ? "Enable UTA P2P read and write on the key in API Key Management, then retry."
              : isClassic
              ? "Ad management needs the Unified Trading Account. Upgrade in Assets."
              : err}
          </p>
          <button
            onClick={onRetry}
            className="mt-2 rounded-lg bg-white/[0.08] px-3 py-1.5 text-xs font-medium text-white hover:bg-white/[0.14]"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm">
      <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
      <span className="text-emerald-200">
        Connected as{" "}
        <span className="font-semibold text-emerald-300">
          {status.merchant?.nickName || "merchant"}
        </span>
        {status.merchant?.accountLevel ? ` · ${status.merchant.accountLevel}` : ""}
        {status.merchant?.completedOrderNum
          ? ` · ${status.merchant.completedOrderNum} trades`
          : ""}
      </span>
    </div>
  );
}

// ─── Publish form ─────────────────────────────────────────────────────────────

interface Draft {
  token: string;
  fiat: string;
  side: "buy" | "sell";
  price: string;
  quantity: string;
  minAmount: string;
  maxAmount: string;
  payMethodId: string;
  userPayMethodId: string;
  payTimeLimit: string;
  remark: string;
}

const EMPTY_DRAFT: Draft = {
  token: "USDT",
  fiat: "NGN",
  side: "sell",
  price: "",
  quantity: "",
  minAmount: "",
  maxAmount: "",
  payMethodId: "",
  userPayMethodId: "",
  payTimeLimit: "10",
  remark: "",
};

function Labelled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-widest text-gray-500">
        {label}
      </span>
      {children}
      {hint && <span className="text-[11px] leading-relaxed text-gray-600">{hint}</span>}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-white/[0.08] bg-[#1a1a1a] px-3.5 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-white/20 focus:outline-none transition-colors";

function PublishForm({ onPublished }: { onPublished: () => void }) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  // Bitget has no payment-method listing endpoint, so the desk's own ad history
  // is the catalogue — the IDs it has actually used before.
  const [knownMethods, setKnownMethods] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    fetchPayMethodIds().then(setKnownMethods).catch(() => {});
  }, [open]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const price = Number(draft.price);
  const quantity = Number(draft.quantity);
  const minAmount = Number(draft.minAmount);
  const maxAmount = Number(draft.maxAmount);

  const problems: string[] = [];
  if (!(price > 0)) problems.push("Price must be greater than zero.");
  if (!(quantity > 0)) problems.push("Quantity must be greater than zero.");
  if (!(minAmount > 0) || !(maxAmount > 0)) problems.push("Order limits must be greater than zero.");
  if (minAmount > 0 && maxAmount > 0 && minAmount > maxAmount)
    problems.push("Minimum cannot exceed maximum.");
  if (!draft.payMethodId.trim()) problems.push("A payment method ID is required.");
  // Selling means the desk receives fiat, so Bitget needs to know which of the
  // desk's own collection methods to show the buyer.
  if (draft.side === "sell" && !draft.userPayMethodId.trim())
    problems.push("Sell-side ads need your own collection method ID.");

  const canSubmit = problems.length === 0 && !busy;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    try {
      const payload: PublishAdPayload = {
        token: draft.token,
        fiat: draft.fiat,
        side: draft.side,
        priceType: "fixed",
        price,
        quantity,
        minAmount,
        maxAmount,
        payMethodIds: [
          {
            payMethodId: draft.payMethodId.trim(),
            ...(draft.userPayMethodId.trim()
              ? { userPayMethodId: draft.userPayMethodId.trim() }
              : {}),
          },
        ],
        payTimeLimit: draft.payTimeLimit,
        ...(draft.remark.trim() ? { remark: draft.remark.trim() } : {}),
      };

      const res = await publishAd(payload);
      toast.success("Ad published", {
        description: res.advId ? `Ad ${res.advId} is live and now prices quotes.` : undefined,
      });
      setDraft(EMPTY_DRAFT);
      setOpen(false);
      onPublished();
    } catch (err) {
      toast.error("Could not publish ad", {
        description: err instanceof ApiError ? err.message : "Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl bg-[#f97316] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#f97316]/20 transition-colors hover:bg-[#ea6c0e]"
      >
        <Plus size={16} />
        Publish an ad
      </button>
    );
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-2xl border border-white/[0.07] bg-[#111] p-5"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">New advertisement</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg p-1 text-gray-500 hover:bg-white/10 hover:text-white"
          aria-label="Close"
        >
          <X size={15} />
        </button>
      </div>

      {/* Side is the load-bearing choice: it decides which half of the desk's
          book this ad prices. */}
      <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#1a1a1a] p-1">
        {(["sell", "buy"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => set("side", s)}
            className={`rounded-lg py-2 text-sm font-semibold transition-colors ${
              draft.side === s ? "bg-[#f97316] text-white" : "text-gray-400 hover:text-white"
            }`}
          >
            {s === "sell" ? "Desk sells crypto" : "Desk buys crypto"}
          </button>
        ))}
      </div>
      <p className="-mt-2 text-[11px] leading-relaxed text-gray-600">
        {draft.side === "sell"
          ? "Prices the buy direction for clients — what they pay you per unit."
          : "Prices the sell direction for clients — what you pay them per unit."}
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <Labelled label="Token">
          <select value={draft.token} onChange={(e) => set("token", e.target.value)} className={inputClass}>
            {TOKENS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </Labelled>
        <Labelled label="Fiat">
          <select value={draft.fiat} onChange={(e) => set("fiat", e.target.value)} className={inputClass}>
            {FIATS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </Labelled>
        <Labelled label="Payment window">
          <select
            value={draft.payTimeLimit}
            onChange={(e) => set("payTimeLimit", e.target.value)}
            className={inputClass}
          >
            {PAY_TIME_LIMITS.map((m) => (
              <option key={m} value={m}>{m} minutes</option>
            ))}
          </select>
        </Labelled>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Labelled label={`Price (${draft.fiat} per ${draft.token})`} hint="This becomes your quoted rate.">
          <input
            type="text"
            inputMode="decimal"
            value={draft.price}
            onChange={(e) => set("price", e.target.value)}
            placeholder="1393"
            className={inputClass}
          />
        </Labelled>
        <Labelled label={`Quantity (${draft.token})`}>
          <input
            type="text"
            inputMode="decimal"
            value={draft.quantity}
            onChange={(e) => set("quantity", e.target.value)}
            placeholder="500"
            className={inputClass}
          />
        </Labelled>
        <Labelled label={`Order limits (${draft.fiat})`}>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              inputMode="decimal"
              value={draft.minAmount}
              onChange={(e) => set("minAmount", e.target.value)}
              placeholder="min"
              className={inputClass}
            />
            <span className="text-gray-600">–</span>
            <input
              type="text"
              inputMode="decimal"
              value={draft.maxAmount}
              onChange={(e) => set("maxAmount", e.target.value)}
              placeholder="max"
              className={inputClass}
            />
          </div>
        </Labelled>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Labelled
          label="Payment method ID"
          hint={
            knownMethods.length
              ? `Previously used: ${knownMethods.join(", ")}`
              : "Bitget's ID for the payment rail, from your P2P payment settings."
          }
        >
          <input
            type="text"
            list="known-pay-methods"
            value={draft.payMethodId}
            onChange={(e) => set("payMethodId", e.target.value)}
            placeholder="e.g. 1"
            className={inputClass}
          />
          <datalist id="known-pay-methods">
            {knownMethods.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Labelled>
        <Labelled
          label={`Your collection method ID${draft.side === "sell" ? "" : " (optional)"}`}
          hint={
            draft.side === "sell"
              ? "Required when selling — the account buyers pay into."
              : "Not needed when buying."
          }
        >
          <input
            type="text"
            value={draft.userPayMethodId}
            onChange={(e) => set("userPayMethodId", e.target.value)}
            placeholder="e.g. 90210"
            className={inputClass}
          />
        </Labelled>
      </div>

      <Labelled label="Remark (optional)">
        <input
          type="text"
          value={draft.remark}
          onChange={(e) => set("remark", e.target.value)}
          placeholder="Shown on the ad"
          className={inputClass}
        />
      </Labelled>

      {problems.length > 0 && (
        <ul className="flex flex-col gap-1 text-[11px] text-amber-400/90">
          {problems.map((p) => (
            <li key={p}>• {p}</li>
          ))}
        </ul>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
          canSubmit
            ? "cursor-pointer bg-[#f97316] text-white hover:bg-[#ea6c0e]"
            : "cursor-not-allowed bg-[#1a1a1a] text-gray-600 border border-[#f97316]/20"
        }`}
      >
        {busy && <Loader2 size={15} className="animate-spin" />}
        {busy ? "Publishing…" : "Publish ad"}
      </button>
    </motion.form>
  );
}

// ─── Own ads ──────────────────────────────────────────────────────────────────

function AdRow({ ad, onChanged }: { ad: DeskAd; onChanged: () => void }) {
  const [price, setPrice] = useState(String(ad.price));
  const [busy, setBusy] = useState(false);

  const dirty = Number(price) > 0 && Number(price) !== ad.price;

  async function handleReprice() {
    if (!dirty || busy) return;
    setBusy(true);
    try {
      await repriceAd(ad.advId, { price: Number(price) });
      toast.success("Ad repriced", { description: "Quotes now use the new price." });
      onChanged();
    } catch (err) {
      toast.error("Could not reprice", {
        description: err instanceof ApiError ? err.message : "Please try again.",
      });
      setPrice(String(ad.price));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">
          {ad.token}/{ad.fiat}
          <span
            className={`ml-2 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              ad.side === "sell"
                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-400"
                : "border-blue-400/20 bg-blue-400/10 text-blue-400"
            }`}
          >
            {ad.side === "sell" ? "desk sells" : "desk buys"}
          </span>
        </p>
        <p className="mt-0.5 flex items-center gap-2 truncate font-mono text-[11px] text-gray-600">
          {ad.advId}
          <span
            className={`rounded px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wider ${
              ad.live
                ? "bg-emerald-400/10 text-emerald-400"
                : "bg-gray-500/15 text-gray-500"
            }`}
          >
            {ad.status || (ad.live ? "live" : "off book")}
          </span>
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        <input
          id={`ad-price-${ad.advId}`}
          type="text"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-28 rounded-lg border border-white/[0.08] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-white/20 focus:outline-none"
        />
        <button
          onClick={handleReprice}
          disabled={!dirty || busy}
          className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
            dirty && !busy
              ? "cursor-pointer bg-[#f97316] text-white hover:bg-[#ea6c0e]"
              : "cursor-not-allowed bg-white/[0.06] text-gray-600"
          }`}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : "Reprice"}
        </button>
        {/* Only a live ad can price a quote — a delisted one is not an offer. */}
        <span
          title={
            ad.live
              ? "On the book — this ad prices quotes"
              : "Off the book on Bitget, so it cannot price quotes"
          }
          className={`rounded-lg px-3 py-2 text-xs font-semibold ${
            ad.live
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-white/[0.06] text-gray-500"
          }`}
        >
          {ad.live ? "Pricing" : "Not pricing"}
        </span>
      </div>
    </div>
  );
}

// ─── Active ads ───────────────────────────────────────────────────────────────

/**
 * The ads that are actually pricing quotes right now.
 *
 * "Your ads" lists everything the desk has ever published, live or not. This is
 * the short answer to the only question that matters mid-shift: what is the
 * customer being quoted off, and can I change it without reading a table.
 */
function ActiveAdsCard({ ads, onChanged }: { ads: DeskAd[]; onChanged: () => void }) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const active = ads.filter((a) => a.live && a.active !== false);

  /** Send the operator to the one editor, rather than growing a second one. */
  function handleEdit(advId: string) {
    const el = document.getElementById(`ad-price-${advId}`) as HTMLInputElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus();
    el.select();
  }

  async function handleRemove(advId: string) {
    setBusy(advId);
    try {
      await setAdActive(advId, false);
      toast.success("Ad removed from pricing", {
        description:
          "Quotes no longer use it. The ad is still live on Bitget — delist it there to stop trading on it.",
      });
      onChanged();
    } catch (err) {
      toast.error("Could not remove the ad", {
        description: err instanceof ApiError ? err.message : "Please try again.",
      });
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#111] lg:sticky lg:top-4">
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3">
        <span className="relative flex h-2 w-2">
          {active.length > 0 && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          )}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${
              active.length > 0 ? "bg-emerald-400" : "bg-gray-600"
            }`}
          />
        </span>
        <h2 className="text-sm font-semibold text-white">Active ads</h2>
        <span className="ml-auto text-[11px] font-medium text-gray-500">
          {active.length} pricing
        </span>
      </div>

      {active.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs leading-relaxed text-gray-500">
          Nothing is pricing quotes. Publish an ad, or set a manual rate.
        </p>
      ) : (
        <div className="divide-y divide-white/[0.05]">
          {active.map((ad) => (
            <div key={ad.advId} className="px-4 py-3">
              <div className="flex items-baseline gap-2">
                <p className="text-sm font-semibold text-white">
                  {ad.token}/{ad.fiat}
                </p>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                    ad.side === "sell"
                      ? "bg-emerald-400/10 text-emerald-400"
                      : "bg-blue-400/10 text-blue-400"
                  }`}
                >
                  {ad.side === "sell" ? "sells" : "buys"}
                </span>
                <span className="ml-auto font-mono text-sm text-white">
                  {ad.price.toLocaleString("en-US")}
                </span>
              </div>

              {confirming === ad.advId ? (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[11px] text-gray-400">Stop pricing off it?</span>
                  <button
                    onClick={() => handleRemove(ad.advId)}
                    disabled={busy === ad.advId}
                    className="ml-auto cursor-pointer rounded-md bg-red-500/15 px-2 py-1 text-[11px] font-semibold text-red-400 hover:bg-red-500/25 disabled:opacity-50"
                  >
                    {busy === ad.advId ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      "Yes, remove"
                    )}
                  </button>
                  <button
                    onClick={() => setConfirming(null)}
                    className="cursor-pointer rounded-md px-2 py-1 text-[11px] font-medium text-gray-500 hover:text-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => handleEdit(ad.advId)}
                    className="cursor-pointer rounded-md bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-gray-300 hover:bg-white/[0.12] hover:text-white"
                  >
                    Edit
                  </button>
                  <span className="text-white/10">|</span>
                  <button
                    onClick={() => setConfirming(ad.advId)}
                    className="cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-medium text-gray-500 hover:text-red-400"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Market reference ─────────────────────────────────────────────────────────

function MarketBook() {
  const [side, setSide] = useState<"buy" | "sell">("sell");
  const [ads, setAds] = useState<MarketAd[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAds(await fetchMarketBook({ token: "USDT", fiat: "NGN", side }));
    } catch {
      setAds([]);
    } finally {
      setLoading(false);
    }
  }, [side]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#111]">
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-6 py-4">
        <TrendingUp size={16} className="text-[#f97316]" />
        <h2 className="text-sm font-semibold text-white">Market — USDT/NGN</h2>
        <div className="ml-auto flex gap-1 rounded-full bg-[#1a1a1a] p-1">
          {(["sell", "buy"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSide(s)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                side === s ? "bg-[#f97316] text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 px-6 py-10 text-sm text-gray-500">
          <Loader2 size={15} className="animate-spin" />
          Loading book…
        </div>
      ) : ads.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-gray-500">
          No market data. Needs the P2P read permission on the API key.
        </p>
      ) : (
        <div className="divide-y divide-white/[0.05]">
          {ads.map((a) => (
            <div key={a.advId} className="flex items-center gap-3 px-6 py-3 text-sm">
              <span className="min-w-0 flex-1 truncate text-gray-300">{a.merchantName}</span>
              <span className="text-gray-500">
                {a.minAmount.toLocaleString()}–{a.maxAmount.toLocaleString()}
              </span>
              <span className="w-24 text-right font-semibold text-white">
                {a.price.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Ad Book Manager ──────────────────────────────────────────────────────────

export default function AdBookManager() {
  const [status, setStatus] = useState<BitgetStatus | null>(null);
  const [ads, setAds] = useState<DeskAd[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, a] = await Promise.allSettled([fetchBitgetStatus(), fetchDeskAds()]);
    if (s.status === "fulfilled") setStatus(s.value);
    if (a.status === "fulfilled") setAds(a.value);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-5">
      <StatusBanner status={status} onRetry={load} />

      {/* Without a published ad and without a manual rate there is no rate
          source at all, and the quote endpoint refuses rather than guessing. */}
      {ads.length === 0 && !loading && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />
          <p className="text-amber-200/80">
            No published ads. Until one exists — or a manual rate is set — the desk
            has no rate source and quotes are refused rather than guessed.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <PublishForm onPublished={load} />
        <button
          onClick={load}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-medium text-gray-300 hover:bg-white/[0.12]"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#111]">
        <div className="flex items-center gap-2 border-b border-white/[0.07] px-6 py-4">
          <Megaphone size={16} className="text-[#f97316]" />
          <h2 className="text-sm font-semibold text-white">Your ads</h2>
          <span className="ml-auto text-[11px] font-medium uppercase tracking-wider text-gray-500">
            Price here = price quoted
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-6 py-10 text-sm text-gray-500">
            <Loader2 size={15} className="animate-spin" />
            Loading ads…
          </div>
        ) : ads.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-gray-500">
            Nothing published yet.
          </p>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {ads.map((ad) => (
              <AdRow key={ad.advId} ad={ad} onChanged={load} />
            ))}
          </div>
        )}
      </div>

        <ActiveAdsCard ads={ads} onChanged={load} />
      </div>

      <MarketBook />
    </div>
  );
}
