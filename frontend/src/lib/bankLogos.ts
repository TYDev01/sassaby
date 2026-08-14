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
  "000029", // Lotus Bank
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

/**
 * The banks a payout is actually likely to go to.
 *
 * Kept apart from CODES_WITH_LOGOS on purpose. Logo availability is an accident
 * of what a third-party icon set happens to publish — going by that put CEMCS
 * Microfinance at the top of the list while Providus, Jaiz, Unity, Suntrust,
 * Titan and PremiumTrust sat hundreds of rows down. Which banks matter is a
 * judgement about Nigerian banking, so it is written down as one.
 *
 * Codes are Flutterwave's, each checked against a live /api/banks?country=NG
 * response. A bank listed here with no artwork simply wears its monogram.
 */
const COMMON_BANK_CODES = new Set([
  // Commercial and retail banks
  "044", // Access Bank
  "023", // Citi Bank
  "050", // EcoBank PLC
  "070", // Fidelity Bank
  "011", // First Bank PLC
  "214", // First City Monument Bank
  "000027", // Globus Bank
  "058", // Guaranty Trust Bank
  "301", // Jaiz Bank
  "082", // Keystone Bank
  "000029", // Lotus Bank
  "000036", // Optimus Bank
  "000030", // Parallex Bank
  "076", // Polaris bank
  "000031", // PremiumTrust Bank
  "101", // ProvidusBank PLC
  "221", // Stanbic IBTC Bank
  "068", // Standard Chaterted bank PLC
  "232", // Sterling Bank PLC
  "100", // Suntrust Bank
  "000026", // Taj Bank Limited
  "000025", // Titan Trust Bank
  "032", // Union Bank PLC
  "033", // United Bank for Africa
  "215", // Unity Bank PLC
  "035", // Wema Bank PLC
  "057", // Zenith bank PLC
  // Neobanks and wallets that carry real payout volume
  "090267", // Kuda
  "100004", // Opay
  "100033", // PALMPAY
  "090405", // Moniepoint Microfinance Bank
  "090325", // Sparkle
  "100026", // Carbon
  "090110", // VFD Micro Finance Bank
  "090175", // Rubies Microfinance Bank
  "090551", // Fairmoney Microfinance Bank Ltd
]);

export function isCommonBank(code: string): boolean {
  return COMMON_BANK_CODES.has(code);
}
