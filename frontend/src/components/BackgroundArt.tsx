/**
 * Decorative spot illustrations painted behind the whole app.
 *
 * Thin line-art in a spread of accent hues, kept at low opacity so it reads as
 * texture rather than content. Pieces are allowed to overlap each other —
 * the layering is intentional. Purely cosmetic: fixed, non-interactive and
 * hidden from assistive tech. The heavier pieces only appear from `lg` up,
 * where there is empty gutter space beside the 600px card stack.
 */

/** Accent palette — one hue per motif so overlaps stay legible. */
const C = {
  orange: "#f97316",
  sky: "#38bdf8",
  emerald: "#34d399",
  violet: "#a78bfa",
  rose: "#fb7185",
  cyan: "#22d3ee",
  pink: "#f472b6",
  blue: "#60a5fa",
  yellow: "#facc15",
  purple: "#c084fc",
  lime: "#4ade80",
  teal: "#2dd4bf",
  indigo: "#818cf8",
} as const;

type Art = { className?: string; color: string };

/** Stack of coins — the "crypto in" side of the bridge. */
function CoinStack({ className, color }: Art) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={className}>
      <g stroke={color} strokeWidth="2" strokeLinecap="round">
        <ellipse cx="60" cy="34" rx="34" ry="13" />
        <path d="M26 34v14c0 7.2 15.2 13 34 13s34-5.8 34-13V34" />
        <path d="M26 55v14c0 7.2 15.2 13 34 13s34-5.8 34-13V55" />
        <path d="M26 76v14c0 7.2 15.2 13 34 13s34-5.8 34-13V76" />
      </g>
      <circle cx="60" cy="34" r="5" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

/** Bank facade — the "fiat out" side of the bridge. */
function BankBuilding({ className, color }: Art) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={className}>
      <g stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 44 60 18l48 26" />
        <path d="M18 44v46M42 44v46M78 44v46M102 44v46" />
        <path d="M8 96h104M14 104h92" />
        <path d="M56 62h8" />
      </g>
      <circle cx="60" cy="34" r="4" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

/** Two arcs chasing each other — the swap motif. */
function ExchangeArrows({ className, color }: Art) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={className}>
      <g stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 52a38 38 0 0 1 66-22" />
        <path d="M88 12v18H70" />
        <path d="M98 68a38 38 0 0 1-66 22" />
        <path d="M32 108V90h18" />
      </g>
    </svg>
  );
}

/** Node graph — value hopping across the network. */
function NodeGraph({ className, color }: Art) {
  return (
    <svg viewBox="0 0 140 100" fill="none" className={className}>
      <g stroke={color} strokeWidth="1.6" strokeLinecap="round">
        <path d="M18 74 52 30l36 34 34-42" />
        <circle cx="18" cy="74" r="6" />
        <circle cx="52" cy="30" r="6" />
        <circle cx="88" cy="64" r="6" />
        <circle cx="122" cy="22" r="6" />
      </g>
    </svg>
  );
}

/** Receipt / statement slip. */
function Receipt({ className, color }: Art) {
  return (
    <svg viewBox="0 0 100 120" fill="none" className={className}>
      <g stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 12h64v96l-10-8-11 8-11-8-11 8-11-8-10 8V12Z" />
        <path d="M32 38h36M32 56h36M32 74h22" />
      </g>
    </svg>
  );
}

/** Shield with a check — custody / safety. */
function ShieldCheck({ className, color }: Art) {
  return (
    <svg viewBox="0 0 110 120" fill="none" className={className}>
      <g stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M55 10 16 26v32c0 26 17 44 39 52 22-8 39-26 39-52V26L55 10Z" />
        <path d="M39 60l12 12 22-24" />
      </g>
    </svg>
  );
}

/** Payment card. */
function CreditCard({ className, color }: Art) {
  return (
    <svg viewBox="0 0 140 96" fill="none" className={className}>
      <g stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="8" y="14" width="124" height="72" rx="10" />
        <path d="M8 38h124" />
        <path d="M26 62h26M26 72h14" />
        <circle cx="106" cy="66" r="10" />
        <circle cx="120" cy="66" r="10" />
      </g>
    </svg>
  );
}

/** Wallet with a card peeking out. */
function Wallet({ className, color }: Art) {
  return (
    <svg viewBox="0 0 130 100" fill="none" className={className}>
      <g stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 30a8 8 0 0 1 8-8h74a8 8 0 0 1 8 8" />
        <rect x="14" y="30" width="102" height="54" rx="10" />
        <path d="M116 48h-18a8 8 0 0 0 0 16h18" />
        <circle cx="100" cy="56" r="2.5" fill={color} stroke="none" />
      </g>
    </svg>
  );
}

/** Globe with meridians — cross-border rails. */
function Globe({ className, color }: Art) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={className}>
      <g stroke={color} strokeWidth="1.8" strokeLinecap="round">
        <circle cx="60" cy="60" r="46" />
        <ellipse cx="60" cy="60" rx="20" ry="46" />
        <path d="M16 44h88M16 76h88" />
        <path d="M60 14v92" />
      </g>
    </svg>
  );
}

/** Linked hex blocks — the chain itself. */
function BlockChain({ className, color }: Art) {
  const hex = "M22 6 38 15v18L22 42 6 33V15L22 6Z";
  return (
    <svg viewBox="0 0 130 96" fill="none" className={className}>
      <g stroke={color} strokeWidth="1.8" strokeLinejoin="round">
        <g transform="translate(4 6)"><path d={hex} /></g>
        <g transform="translate(48 6)"><path d={hex} /></g>
        <g transform="translate(26 46)"><path d={hex} /></g>
        <g transform="translate(70 46)"><path d={hex} /></g>
        <path d="M46 30h10M74 30 62 52M96 36 82 52" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** Rising bar chart with a trend line — rates over time. */
function TrendChart({ className, color }: Art) {
  return (
    <svg viewBox="0 0 130 110" fill="none" className={className}>
      <g stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 12v84h104" />
        <path d="M34 84V62M58 84V46M82 84V54M106 84V28" />
        <path d="M34 52 58 34l24 8 24-22" />
        <path d="M92 20h16v16" />
      </g>
    </svg>
  );
}

/** QR code — the BTC deposit flow. */
function QrCode({ className, color }: Art) {
  return (
    <svg viewBox="0 0 110 110" fill="none" className={className}>
      <g stroke={color} strokeWidth="2" strokeLinejoin="round">
        <rect x="10" y="10" width="30" height="30" rx="4" />
        <rect x="70" y="10" width="30" height="30" rx="4" />
        <rect x="10" y="70" width="30" height="30" rx="4" />
        <path d="M22 22h6v6h-6zM82 22h6v6h-6zM22 82h6v6h-6z" />
        <path d="M56 10v18M56 44h-14M70 56h30M70 70v30M84 84h16M56 70v30" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** Padlock — escrow. */
function Lock({ className, color }: Art) {
  return (
    <svg viewBox="0 0 100 120" fill="none" className={className}>
      <g stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M30 50V36a20 20 0 0 1 40 0v14" />
        <rect x="16" y="50" width="68" height="56" rx="12" />
        <path d="M50 70v16" />
      </g>
    </svg>
  );
}

/** Stopwatch — settlement speed. */
function Stopwatch({ className, color }: Art) {
  return (
    <svg viewBox="0 0 110 120" fill="none" className={className}>
      <g stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="55" cy="68" r="40" />
        <path d="M42 12h26M55 12v16M55 68l20-16" />
        <path d="M88 34l10-10" />
      </g>
    </svg>
  );
}

/** Small dot matrix — classic SaaS background filler. */
function DotGrid({ className, color, id }: Art & { id: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={className}>
      <defs>
        <pattern id={id} width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.6" fill={color} />
        </pattern>
      </defs>
      <rect width="100" height="100" fill={`url(#${id})`} />
    </svg>
  );
}

export default function BackgroundArt() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none"
    >
      {/* Colour wash anchoring the art to the page corners */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 45% at 10% 6%, rgba(249,115,22,0.07) 0%, transparent 70%), " +
            "radial-gradient(50% 45% at 90% 90%, rgba(56,189,248,0.06) 0%, transparent 70%), " +
            "radial-gradient(45% 40% at 88% 12%, rgba(167,139,250,0.05) 0%, transparent 70%), " +
            "radial-gradient(45% 40% at 8% 88%, rgba(52,211,153,0.05) 0%, transparent 70%)",
        }}
      />

      {/* ── Corner anchors ──────────────────────────────────────────────────
          Below `sm` the 600px card stack fills the viewport, so the large
          pieces would smudge behind the inputs — mobile keeps the wash and
          the dot grids only. */}
      <CoinStack
        color={C.orange}
        className="bg-art-float absolute left-6 top-24 hidden w-40 opacity-[0.09] sm:block lg:left-16 lg:w-48"
      />
      <BankBuilding
        color={C.sky}
        className="bg-art-float-slow absolute right-6 bottom-28 hidden w-44 opacity-[0.09] sm:block lg:right-16 lg:w-52"
      />

      {/* ── Left gutter cluster (lg+) — pieces deliberately overlap ───────── */}
      <ExchangeArrows
        color={C.emerald}
        className="bg-art-float-slow absolute left-24 bottom-32 hidden w-28 opacity-[0.08] lg:block xl:left-40 xl:w-32"
      />
      <TrendChart
        color={C.lime}
        className="bg-art-sway absolute left-4 bottom-[26%] hidden w-28 opacity-[0.06] lg:block xl:left-16"
      />
      <Wallet
        color={C.yellow}
        className="bg-art-float absolute left-[7%] top-[44%] hidden w-28 opacity-[0.07] lg:block"
      />
      <Receipt
        color={C.rose}
        className="bg-art-float absolute left-[15%] top-[54%] hidden w-20 opacity-[0.07] lg:block"
      />
      <Stopwatch
        color={C.pink}
        className="bg-art-float-slow absolute left-[3%] top-[16%] hidden w-20 opacity-[0.06] xl:block"
      />

      {/* ── Right gutter cluster (lg+) ────────────────────────────────────── */}
      <NodeGraph
        color={C.violet}
        className="bg-art-float absolute right-24 top-32 hidden w-36 opacity-[0.08] lg:block xl:right-44 xl:w-44"
      />
      <BlockChain
        color={C.purple}
        className="bg-art-sway absolute right-[6%] top-[26%] hidden w-32 opacity-[0.07] lg:block"
      />
      <CreditCard
        color={C.pink}
        className="bg-art-float-slow absolute right-[4%] top-[46%] hidden w-32 opacity-[0.07] lg:block"
      />
      <Globe
        color={C.blue}
        className="bg-art-float absolute right-[17%] top-[52%] hidden w-24 opacity-[0.06] xl:block"
      />
      <ShieldCheck
        color={C.cyan}
        className="bg-art-float-slow absolute right-[16%] bottom-[18%] hidden w-24 opacity-[0.07] xl:block"
      />
      <QrCode
        color={C.teal}
        className="bg-art-float absolute right-[9%] bottom-[6%] hidden w-20 opacity-[0.06] xl:block"
      />
      <Lock
        color={C.indigo}
        className="bg-art-sway absolute right-[27%] bottom-[8%] hidden w-16 opacity-[0.05] xl:block"
      />

      {/* ── Dot matrices — the only art that survives down to mobile ──────── */}
      <DotGrid
        id="bg-art-dots-a"
        color={C.orange}
        className="absolute right-4 top-[10%] w-16 opacity-[0.09] lg:right-8 lg:top-[14%] lg:w-24"
      />
      <DotGrid
        id="bg-art-dots-b"
        color={C.cyan}
        className="absolute left-4 bottom-[6%] w-14 opacity-[0.08] lg:left-10 lg:bottom-[8%] lg:w-20"
      />
      <DotGrid
        id="bg-art-dots-c"
        color={C.violet}
        className="absolute left-[26%] top-[6%] hidden w-16 opacity-[0.07] xl:block"
      />
    </div>
  );
}
