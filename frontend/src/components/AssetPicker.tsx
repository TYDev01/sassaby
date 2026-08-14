"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Search, Check, X, AlertTriangle } from "lucide-react";
import Image from "next/image";

import type { AssetSpec } from "@/lib/api";
import { TOKEN_ICON, CHAIN_ICON, CHAIN_LABEL, TOKEN_NAME } from "@/lib/tokenIcons";

/**
 * An asset is a (token, chain) pair, never a bare symbol — USDT on Tron and
 * USDT on Ethereum are different assets with different addresses and fees, and
 * conflating them is how a deposit goes to the wrong network.
 */
export interface SelectedAsset {
  token: string;
  chain: string;
}

export function assetKey(a: SelectedAsset): string {
  return `${a.token}:${a.chain}`;
}

// ─── Token Icon ────────────────────────────────────────────────────────────────

/**
 * The chain badge is not decoration. A row reading "USDT · BNB Smart Chain
 * (BEP20)" is easy to skim past; the same row wearing a BNB badge on its corner
 * is not, and picking the wrong network here loses the deposit.
 */
export function TokenIcon({
  token,
  chain,
  size = 20,
}: {
  token: string;
  chain?: string;
  size?: number;
}) {
  const src = TOKEN_ICON[token];
  const chainSrc = chain ? CHAIN_ICON[chain] : undefined;
  // Only badge it where the network is a real second choice: BTC on Bitcoin
  // needs no badge, USDT on any of four chains does.
  const showBadge = Boolean(chainSrc && chainSrc !== src);
  const badgeSize = Math.round(size * 0.46);

  return (
    <span
      className="relative shrink-0 inline-flex"
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image
          src={src}
          alt=""
          width={size}
          height={size}
          unoptimized
          className="rounded-full object-cover"
        />
      ) : (
        <span
          style={{ width: size, height: size, fontSize: Math.max(8, size * 0.36) }}
          className="rounded-full bg-white/[0.08] border border-white/10 flex items-center justify-center font-bold text-gray-300"
        >
          {token.slice(0, 3)}
        </span>
      )}

      {showBadge && (
        <span
          className="absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-[#111111] bg-[#111111] flex"
          style={{ width: badgeSize, height: badgeSize }}
        >
          <Image
            src={chainSrc as string}
            alt=""
            width={badgeSize}
            height={badgeSize}
            unoptimized
            className="rounded-full object-cover"
          />
        </span>
      )}
    </span>
  );
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

interface ChainGroup {
  chain: string;
  label: string;
  assets: AssetSpec[];
}

/**
 * Group by network, in registry order.
 *
 * The network is the half of the choice that loses money when it is wrong, so
 * it leads: you pick Ethereum, then the token on Ethereum. Picking a token
 * first and a network second is what makes "USDT" feel like one thing when it
 * is four.
 */
function groupByChain(assets: AssetSpec[]): ChainGroup[] {
  const order: string[] = [];
  const byChain = new Map<string, AssetSpec[]>();

  for (const a of assets) {
    if (!byChain.has(a.chain)) {
      byChain.set(a.chain, []);
      order.push(a.chain);
    }
    byChain.get(a.chain)!.push(a);
  }

  return order.map((chain) => ({
    chain,
    label: CHAIN_LABEL[chain] ?? chain,
    assets: byChain.get(chain)!,
  }));
}

// ─── Token row ────────────────────────────────────────────────────────────────

function TokenRow({
  asset,
  chainLabel,
  isSelected,
  onSelect,
}: {
  asset: AssetSpec;
  chainLabel: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  // Only worth a second line where it says something the header did not:
  // "Ethereum (ERC20)" under an Ethereum header earns its place, "Bitcoin"
  // under a Bitcoin header does not.
  const standard = asset.network === chainLabel ? null : asset.network;

  return (
    <button
      role="option"
      aria-selected={isSelected}
      onClick={onSelect}
      className={`
        w-full flex items-center gap-3 pl-6 pr-3 py-2.5 rounded-lg text-left
        transition-colors duration-150 cursor-pointer
        ${isSelected ? "bg-[#f97316]/10" : "hover:bg-white/[0.04]"}
      `}
    >
      {/* No chain badge here — the group header above already says the network. */}
      <TokenIcon token={asset.token} size={26} />

      <span className="flex flex-col min-w-0">
        <span className="flex items-center gap-2">
          <span className="text-white text-sm font-semibold">{asset.token}</span>
          <span className="text-gray-500 text-xs truncate">
            {TOKEN_NAME[asset.token] ?? ""}
          </span>
        </span>
        {standard && (
          <span className="text-[11px] text-gray-600 truncate">{standard}</span>
        )}
      </span>

      <span className="ml-auto flex items-center gap-2 shrink-0">
        {asset.requiresMemo && (
          <span className="hidden sm:flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-full px-2 py-0.5">
            <AlertTriangle size={10} />
            Memo
          </span>
        )}
        {isSelected && <Check size={16} className="text-[#f97316]" />}
      </span>
    </button>
  );
}

// ─── Network group ────────────────────────────────────────────────────────────

function ChainSection({
  group,
  isOpen,
  onToggle,
  selectedKey,
  onSelect,
}: {
  group: ChainGroup;
  isOpen: boolean;
  onToggle: () => void;
  selectedKey: string;
  onSelect: (a: SelectedAsset) => void;
}) {
  const holdsSelection = group.assets.some((a) => assetKey(a) === selectedKey);

  return (
    <div
      className={`rounded-xl border transition-colors duration-150 ${
        isOpen
          ? "border-white/[0.08] bg-white/[0.02]"
          : "border-transparent hover:bg-white/[0.03]"
      }`}
    >
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer"
      >
        <Image
          src={CHAIN_ICON[group.chain] ?? "/tokens/btc.svg"}
          alt=""
          width={30}
          height={30}
          unoptimized
          className="rounded-full shrink-0"
        />

        <span className="flex flex-col min-w-0">
          <span className="text-white text-sm font-semibold">{group.label}</span>
          <span className="text-[11px] text-gray-500 truncate">
            {group.assets.map((a) => a.token).join(" · ")}
          </span>
        </span>

        <span className="ml-auto flex items-center gap-2 shrink-0">
          {holdsSelection && !isOpen && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#f97316]" />
          )}
          <ChevronDown
            size={15}
            className={`text-gray-500 transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div role="listbox" aria-label={group.label} className="px-2 pb-2 flex flex-col gap-0.5">
              {group.assets.map((a) => (
                <TokenRow
                  key={assetKey(a)}
                  asset={a}
                  chainLabel={group.label}
                  isSelected={assetKey(a) === selectedKey}
                  onSelect={() => onSelect({ token: a.token, chain: a.chain })}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function AssetModal({
  assets,
  selected,
  onSelect,
  onClose,
}: {
  assets: AssetSpec[];
  selected: SelectedAsset;
  onSelect: (a: SelectedAsset) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  // Open on the network the current asset sits on, so the modal shows where you
  // already are rather than making you hunt for it.
  const [openChain, setOpenChain] = useState<string | null>(selected.chain);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedKey = assetKey(selected);

  useEffect(() => {
    inputRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);

    // Lock the page behind the modal, and restore whatever the page had set.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const q = query.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!q) return assets;
    return assets.filter(
      (a) =>
        a.token.toLowerCase().includes(q) ||
        a.network.toLowerCase().includes(q) ||
        a.chain.toLowerCase().includes(q) ||
        (CHAIN_LABEL[a.chain] ?? "").toLowerCase().includes(q) ||
        (TOKEN_NAME[a.token] ?? "").toLowerCase().includes(q)
    );
  }, [assets, q]);

  const groups = useMemo(() => groupByChain(matches), [matches]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Select asset and network"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.98 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="
          relative w-full sm:max-w-md max-h-[85vh] sm:max-h-[70vh]
          bg-[#111111] border border-white/[0.08]
          rounded-t-2xl sm:rounded-2xl shadow-2xl
          flex flex-col overflow-hidden
        "
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-white/[0.06]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold text-base">Select asset</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-gray-500 hover:text-white transition-colors cursor-pointer p-1 -mr-1"
            >
              <X size={18} />
            </button>
          </div>

          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
            />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Enter takes the only sensible reading of a search: the first
                // thing it found.
                if (e.key === "Enter" && matches.length > 0) {
                  onSelect({ token: matches[0].token, chain: matches[0].chain });
                  onClose();
                }
              }}
              placeholder="Search asset or network…"
              className="
                w-full bg-[#1a1a1a] border border-white/[0.08] rounded-xl
                pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-gray-600
                focus:outline-none focus:border-[#f97316]/50 transition-colors
              "
            />
          </div>
        </div>

        {/* Networks */}
        <div className="flex-1 overflow-y-auto scrollbar-slim p-2 flex flex-col gap-1">
          {groups.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-10">
              Nothing matches “{query}”.
            </p>
          ) : (
            groups.map((g) => (
              <ChainSection
                key={g.chain}
                group={g}
                // A search has already narrowed things down; collapsing the
                // results behind another click would just hide the answer.
                isOpen={q ? true : openChain === g.chain}
                onToggle={() =>
                  setOpenChain((c) => (c === g.chain ? null : g.chain))
                }
                selectedKey={selectedKey}
                onSelect={(a) => {
                  onSelect(a);
                  onClose();
                }}
              />
            ))
          )}
        </div>

        {/* Footer note — the network is the load-bearing half of the choice. */}
        <div className="px-5 py-3 border-t border-white/[0.06] text-[11px] text-gray-600">
          Send on the exact network shown. A deposit sent over another network
          cannot be credited.
        </div>
      </motion.div>
    </div>,
    document.body
  );
}

// ─── AssetPicker ──────────────────────────────────────────────────────────────

export default function AssetPicker({
  assets,
  selected,
  onSelect,
}: {
  assets: AssetSpec[];
  selected: SelectedAsset;
  onSelect: (a: SelectedAsset) => void;
}) {
  // No SSR guard is needed around the portal: the modal only renders once the
  // trigger has been clicked, which cannot happen during a server render.
  const [open, setOpen] = useState(false);

  return (
    <>
      <motion.button
        whileTap={{ scale: 0.96 }}
        onClick={() => setOpen(true)}
        aria-label="Select asset and network"
        aria-haspopup="dialog"
        className="
          flex items-center gap-2 bg-[#1a1a1a] border border-white/10
          rounded-full px-4 py-2 focus:outline-none
          hover:border-white/20 transition-colors duration-200 cursor-pointer
        "
      >
        <TokenIcon token={selected.token} chain={selected.chain} size={20} />
        <span className="text-white text-base font-semibold tracking-wide">
          {selected.token}
        </span>
        <ChevronDown size={14} className="text-gray-400" />
      </motion.button>

      <AnimatePresence>
        {open && (
          <AssetModal
            key="asset-modal"
            assets={assets}
            selected={selected}
            onSelect={onSelect}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
