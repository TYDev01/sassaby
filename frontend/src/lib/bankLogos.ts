/**
 * Bank logos.
 *
 * Vendored under public/banks rather than hot-linked, and keyed on the
 * Flutterwave bank code because that is the only stable identifier the two
 * sources share — names disagree ("Kuda" vs "Kuda Bank", "OPay" vs "Opay").
 *
 * Every entry below was checked against the Flutterwave list by name before it
 * was kept: code 303 is Lotus Bank in the logo source but ChamsMobile in
 * Flutterwave, so it was dropped rather than shipped with the wrong mark.
 *
 * Only the banks below have artwork; the NG list runs to ~700 entries, most of
 * them microfinance banks with no published mark. Everything else falls back to
 * a monogram, so the list looks deliberate rather than half-illustrated.
 */

const CODES_WITH_LOGOS = new Set([
  "000026", // Taj Bank Limited
  "000027", // Globus Bank
  "011", // First Bank PLC
  "023", // Citi Bank
  "032", // Union Bank PLC
  "033", // United Bank for Africa
  "035", // Wema Bank PLC
  "044", // Access Bank
  "050", // EcoBank PLC
  "057", // Zenith bank PLC
  "058", // Guaranty Trust Bank
  "068", // Standard Chaterted bank PLC
  "070", // Fidelity Bank
  "076", // Polaris bank
  "082", // Keystone Bank
  "090001", // ASOSavings & Loans
  "090097", // Ekondo MFB
  "090154", // CEMCS Microfinance Bank
  "090267", // Kuda
  "090325", // Sparkle
  "090405", // Moniepoint Microfinance Bank
  "100004", // Opay
  "100033", // PALMPAY
  "214", // First City Monument Bank
  "221", // Stanbic IBTC Bank
  "232", // Sterling Bank PLC
  "327", // Paga
]);

export function bankLogo(code: string): string | null {
  return CODES_WITH_LOGOS.has(code) ? `/banks/${code}.png` : null;
}

/** Words that identify no bank in particular. */
const NOISE = new Set([
  "bank", "banks", "microfinance", "mfb", "limited", "ltd", "plc", "the",
  "and", "of", "nigeria", "company", "co", "services", "service", "finance",
]);

/** Up to two letters, drawn from the words that actually name the bank. */
export function bankInitials(name: string): string {
  const words = name
    .trim()
    .split(/[\s\-_/]+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean);

  const meaningful = words.filter((w) => !NOISE.has(w.toLowerCase()));
  const source = meaningful.length > 0 ? meaningful : words;

  if (source.length === 0) return "?";
  if (source.length === 1) return source[0].slice(0, 2).toUpperCase();
  return (source[0][0] + source[1][0]).toUpperCase();
}

/**
 * A stable colour per bank, so the same bank always wears the same chip and the
 * list reads as varied rather than 670 identical grey squares.
 */
const MONOGRAM_COLORS = [
  "#f97316", "#6366f1", "#22c55e", "#eab308", "#ec4899",
  "#06b6d4", "#8b5cf6", "#ef4444", "#14b8a6", "#f59e0b",
];

export function bankColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return MONOGRAM_COLORS[Math.abs(hash) % MONOGRAM_COLORS.length];
}
