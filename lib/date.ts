// =============================================================================
// Variable-precision date helpers.
//
// Every date in the app is a { year, month? } pair: precision is either the
// year alone or month+year. Never a full JS Date.
//
// Comparison rule (from the spec): a date without a month is treated as the
// START of the year — i.e. (2021) sorts before (2021, March).
//
// Pure functions only: no database access, no side effects.
// =============================================================================

export interface DatePoint {
  year: number;
  /** 1-12, or null/undefined when only the year is known */
  month?: number | null;
}

export type Locale = "fr" | "en";

/**
 * Chronological comparison usable with Array.sort().
 * Returns < 0 if a is before b, 0 if equal, > 0 if after.
 * A missing month counts as month 0 (start of the year).
 */
export function compareDates(a: DatePoint, b: DatePoint): number {
  if (a.year !== b.year) return a.year - b.year;
  return (a.month ?? 0) - (b.month ?? 0);
}

/** Strict equality of two variable-precision dates (same year AND same precision). */
export function sameDate(a: DatePoint, b: DatePoint): boolean {
  return a.year === b.year && (a.month ?? null) === (b.month ?? null);
}

/** True if a is strictly before b. */
export function isBefore(a: DatePoint, b: DatePoint): boolean {
  return compareDates(a, b) < 0;
}

/**
 * Format a date: "2021" (year only) / "mars 2021" (fr) / "March 2021" (en).
 * Month names come from Intl so we never maintain translation arrays.
 */
export function formatDate(d: DatePoint, locale: Locale = "fr"): string {
  if (d.month == null) return String(d.year);
  const monthName = new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-US", {
    month: "long",
  }).format(new Date(Date.UTC(2000, d.month - 1, 1)));
  return `${monthName} ${d.year}`;
}

/**
 * Format a period:
 *  - start + end     -> "2015 – 2019"
 *  - start only      -> "depuis 2023" / "since 2023"
 *  - end only        -> "jusqu'en 2021" / "until 2021"   (unknown start = data gap)
 *  - neither         -> "période inconnue" / "unknown period"
 */
export function formatRange(
  start: DatePoint | null,
  end: DatePoint | null,
  locale: Locale = "fr"
): string {
  const fr = locale === "fr";
  if (start && end) return `${formatDate(start, locale)} – ${formatDate(end, locale)}`;
  if (start) return fr ? `depuis ${formatDate(start, locale)}` : `since ${formatDate(start, locale)}`;
  if (end) return fr ? `jusqu'en ${formatDate(end, locale)}` : `until ${formatDate(end, locale)}`;
  return fr ? "période inconnue" : "unknown period";
}
