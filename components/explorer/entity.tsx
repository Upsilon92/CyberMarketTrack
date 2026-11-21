"use client";

// Shared Explorer building blocks: a company "chip" (logo + name + flag, always
// shown together as requested) and event label/format helpers.
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { CompanyLogo } from "@/components/company-logo";
import { Flag } from "@/components/flag";
import { countryName } from "@/lib/countries";
import type { XCompany, XEvent } from "@/lib/explorer-model";

export function EntityChip({
  company,
  name,
  size = 28,
  link = true,
  className = "",
}: {
  company?: XCompany | null;
  name?: string; // fallback when the company is only known by name
  size?: number;
  link?: boolean;
  className?: string;
}) {
  const locale = useLocale() as "fr" | "en";
  const label = company?.name ?? name ?? "?";
  const inner = (
    <span className={`inline-flex items-center gap-2 min-w-0 ${className}`}>
      <CompanyLogo name={label} logoUrl={company?.logo ?? null} width={Math.round(size * 2.2)} height={size} />
      <span className="truncate font-medium">{label}</span>
      {company?.country && (
        <Flag iso={company.country} size="1.1em" title={countryName(company.country, locale)} className="shrink-0" />
      )}
    </span>
  );
  if (!link || !company) return inner;
  return (
    <Link href={`/companies/${company.id}`} className="min-w-0 hover:underline underline-offset-2">
      {inner}
    </Link>
  );
}

const MONTHS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function useFormatters() {
  const locale = useLocale() as "fr" | "en";
  const t = useTranslations("explorer");
  const date = (e: { year: number; month: number | null }) =>
    e.month ? `${(locale === "fr" ? MONTHS_FR : MONTHS_EN)[e.month - 1]} ${e.year}` : String(e.year);
  const amount = (m: number | null) => {
    if (!m) return null;
    if (m >= 1000) return t("amountB", { n: (m / 1000).toLocaleString(locale, { maximumFractionDigits: 2 }) });
    return t("amountM", { n: m.toLocaleString(locale) });
  };
  return { locale, date, amount };
}

/** Short, human sentence for an event ("Cisco rachète Splunk"). */
export function useEventLabel() {
  const t = useTranslations("explorer");
  return (e: XEvent, name: (id: string | null, raw: string | null) => string) => {
    const acq = name(e.acqId, e.acqRaw);
    const tgt = name(e.tgtId, e.tgtRaw);
    switch (e.type) {
      case "ACQUISITION":
        return t("evAcquisition", { acq, tgt });
      case "CO_INVESTMENT":
        return t("evCoInvestment", { acq, tgt });
      case "ABSORPTION":
        return t("evAbsorption", { acq, tgt });
      case "MERGER":
        return t("evMerger", { acq, tgt });
      case "SPINOFF":
        return t("evSpinoff", { acq, tgt });
      case "FUNDING":
        return t("evFunding", { tgt, round: e.round ?? "" });
      case "IPO":
        return t("evIpo", { tgt });
      case "DELISTING":
        return t("evDelisting", { tgt });
      case "COMPANY_RENAME":
        return t("evRename", { tgt, newName: e.newName ?? "?" });
      default:
        return t("evOther", { tgt });
    }
  };
}

/** Color family for an event marker. */
export function eventTone(e: XEvent, asBuyer: boolean): string {
  if (e.type === "FUNDING") return "bg-teal-500";
  if (e.type === "IPO" || e.type === "DELISTING") return "bg-sky-500";
  if (e.type === "COMPANY_RENAME") return "bg-blue-500";
  if (e.type === "MERGER") return "bg-amber-500";
  return asBuyer ? "bg-fuchsia-500" : "bg-violet-500";
}
