// Deal values are stored in MILLIONS of US dollars (Event.amount).
export const DEAL_TYPES = new Set(["ACQUISITION", "CO_INVESTMENT", "MERGER"]);

/** "7,75 Md$" / "450 M$" (fr) — "$7.75B" / "$450M" (en). Null when unknown. */
export function formatDealValue(millions: number | null | undefined, locale: "fr" | "en"): string | null {
  if (millions == null || !Number.isFinite(millions) || millions <= 0) return null;
  if (millions >= 1000) {
    const n = (millions / 1000).toLocaleString(locale, { maximumFractionDigits: 2 });
    return locale === "fr" ? `${n} Md$` : `$${n}B`;
  }
  const n = millions.toLocaleString(locale, { maximumFractionDigits: 1 });
  return locale === "fr" ? `${n} M$` : `$${n}M`;
}
