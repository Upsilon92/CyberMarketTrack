// Company page: general info, derived current owner, revenues, solutions
// (current + former, derived), unified timeline (vertical + period bands),
// fund portfolio, and the "as of year" view (?at=YYYY).
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/status-badge";
import { Markdown } from "@/components/markdown";
import { RevenueChart } from "@/components/revenue-chart";
import { EventLine } from "@/components/event-line";
import { PeriodBands, toSegments, type BandRow } from "@/components/period-bands";
import { AsOfSelect } from "@/components/as-of-select";
import {
  loadMarket,
  loadAllEvents,
  ownerDisplayName,
  solutionsOfCompany,
  portfolioOfFund,
  isStale,
} from "@/lib/queries";
import { formerNamePeriods, periodAt, type OwnershipPeriod } from "@/lib/timeline";
import { formatDate, formatRange, type Locale } from "@/lib/date";
import { countryFlag } from "@/lib/flags";
import type { CompanyStatus } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** Ownership label adapted to the ownership type (spec wording). */
async function OwnershipLabel({
  period,
  ownerName,
  locale,
}: {
  period: OwnershipPeriod;
  ownerName: string;
  locale: Locale;
}) {
  const t = await getTranslations("ownership");
  const range = formatRange(period.start, period.end, locale);
  if (period.ownershipType === "ABSORBED") {
    return t("ABSORBED", { owner: ownerName, date: period.start ? formatDate(period.start, locale) : "?" });
  }
  const key = ["INVESTOR_OWNED", "AUTONOMOUS", "SUBSIDIARY"].includes(period.ownershipType)
    ? period.ownershipType
    : "UNKNOWN";
  return t(key, { owner: ownerName, range });
}

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ at?: string }>;
}) {
  const { id } = await params;
  const { at } = await searchParams;
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("company");
  const tCommon = await getTranslations("common");
  const tTypes = await getTranslations("companyTypes");
  const tStatuses = await getTranslations("statuses");

  const market = await loadMarket();
  const company = market.companies.find((c) => c.id === id);
  if (!company) notFound();

  const tl = company.timeline;
  const isFund = company.types.some((ct) => ct.type === "INVESTMENT_FUND");

  // ---- "As of" view: derive the state at the requested year -----------------
  const atYear = at && /^\d{4}$/.test(at) ? Number(at) : null;
  const atDate = atYear ? { year: atYear, month: 12 } : null; // end of that year
  const nameAt = atDate ? periodAt(tl.namePeriods, atDate)?.name : null;
  const ownerAt = atDate ? periodAt(tl.ownershipPeriods, atDate) : null;
  const statusAt = atDate ? (periodAt(tl.statusPeriods, atDate)?.status ?? null) : null;

  const displayedName = atDate ? (nameAt ?? "—") : tl.currentName;
  const displayedOwner = atDate ? ownerAt : tl.currentOwner;
  const displayedStatus = atDate ? statusAt : tl.currentStatus;

  const formers = formerNamePeriods(tl);

  // ---- Solutions owned (derived) — at the selected date if any --------------
  const { current: currentSolutions, former: formerSolutions } = solutionsOfCompany(market, id);
  const solutionsAt = atDate
    ? market.solutions.filter((s) => periodAt(s.timeline.ownershipPeriods, atDate)?.ownerCompanyId === id)
    : currentSolutions;

  // ---- Events of this company (for the vertical timeline) -------------------
  const allEvents = await loadAllEvents();
  const companyEvents = allEvents.filter((e) => e.subjectCompanyId === id);
  const acquisitionsMade = allEvents.filter(
    (e) => e.type === "ACQUISITION" && e.acquirerCompanyId === id
  );

  // ---- Period bands ----------------------------------------------------------
  const bands: BandRow[] = [
    { label: t("names"), segments: toSegments(tl.namePeriods, (p) => p.name) },
    {
      label: t("owners"),
      segments: toSegments(tl.ownershipPeriods, (p) =>
        ownerDisplayName(market, p.ownerCompanyId, p.ownerNameRaw)
      ),
    },
    {
      label: t("statusesDim"),
      segments: toSegments(tl.statusPeriods, (p) => tStatuses(p.status)),
    },
  ];

  const portfolio = isFund ? portfolioOfFund(market, id) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">
            {countryFlag(company.country)} {displayedName}
          </h1>
          {company.types.map((ct) => (
            <Badge key={ct.id} variant="outline">
              {tTypes(ct.type)}
            </Badge>
          ))}
          {displayedStatus && <StatusBadge status={displayedStatus as CompanyStatus} />}
          {isStale(company.updatedAt) && (
            <Badge variant="destructive">{tCommon("toRecheck")}</Badge>
          )}
          <div className="ml-auto">
            <AsOfSelect minYear={company.foundedYear} value={atYear ?? undefined} />
          </div>
        </div>
        {formers.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {tCommon("formerly", {
              names: formers
                .map((p) => `${p.name} (${formatRange(p.start, p.end, locale)})`)
                .join(", "),
            })}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {tCommon("lastUpdated", { date: company.updatedAt.toLocaleDateString(locale) })}
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* General info */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{t("generalInfo")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
              <span>
                {tCommon("founded", {
                  date: formatDate({ year: company.foundedYear, month: company.foundedMonth }, locale),
                })}
              </span>
              <span>
                {tCommon("country")} : {countryFlag(company.country)} {company.country}
              </span>
              {company.originCountry && (
                <span>
                  {tCommon("originCountry")} : {countryFlag(company.originCountry)}{" "}
                  {company.originCountry}
                </span>
              )}
              {company.website && (
                <a href={company.website} className="text-primary hover:underline" rel="noopener noreferrer" target="_blank">
                  {tCommon("website")} ↗
                </a>
              )}
            </div>
            {company.description && <Markdown>{company.description}</Markdown>}
          </CardContent>
        </Card>

        {/* Current (or as-of) owner */}
        <Card>
          <CardHeader>
            <CardTitle>{t("currentOwner")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {displayedOwner ? (
              <div className="space-y-1">
                {displayedOwner.ownerCompanyId ? (
                  <Link
                    href={`/companies/${displayedOwner.ownerCompanyId}`}
                    className="text-primary hover:underline"
                  >
                    <OwnershipLabel
                      period={displayedOwner}
                      ownerName={ownerDisplayName(
                        market,
                        displayedOwner.ownerCompanyId,
                        displayedOwner.ownerNameRaw
                      )}
                      locale={locale}
                    />
                  </Link>
                ) : (
                  <OwnershipLabel
                    period={displayedOwner}
                    ownerName={ownerDisplayName(
                      market,
                      displayedOwner.ownerCompanyId,
                      displayedOwner.ownerNameRaw
                    )}
                    locale={locale}
                  />
                )}
              </div>
            ) : (
              <span className="text-muted-foreground">
                {(await getTranslations("ownership"))("independent")}
              </span>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Revenues */}
      {company.revenues.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("revenues")}</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueChart revenues={company.revenues} />
          </CardContent>
        </Card>
      )}

      {/* Portfolio (funds only) */}
      {portfolio && (portfolio.current.length > 0 || portfolio.past.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>{t("portfolio")}</CardTitle>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <h3 className="font-medium mb-2 text-muted-foreground">{t("portfolioCurrent")}</h3>
              <ul className="space-y-1">
                {portfolio.current.map(({ company: c, sinceYear }) => (
                  <li key={c.id}>
                    <Link href={`/companies/${c.id}`} className="text-primary hover:underline">
                      {c.timeline.currentName}
                    </Link>{" "}
                    {sinceYear && (
                      <span className="text-muted-foreground">
                        ({tCommon("since", { date: String(sinceYear) })})
                      </span>
                    )}
                  </li>
                ))}
                {portfolio.current.length === 0 && <li className="text-muted-foreground">—</li>}
              </ul>
            </div>
            <div>
              <h3 className="font-medium mb-2 text-muted-foreground">{t("portfolioPast")}</h3>
              <ul className="space-y-1">
                {portfolio.past.map(({ company: c, fromYear, toYear }) => (
                  <li key={c.id}>
                    <Link href={`/companies/${c.id}`} className="text-primary hover:underline">
                      {c.timeline.currentName}
                    </Link>{" "}
                    <span className="text-muted-foreground">
                      ({fromYear ?? "?"} – {toYear ?? "?"})
                    </span>
                  </li>
                ))}
                {portfolio.past.length === 0 && <li className="text-muted-foreground">—</li>}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Solutions (derived ownership) */}
      <Card>
        <CardHeader>
          <CardTitle>{atDate ? `${t("currentSolutions")} (${atYear})` : t("currentSolutions")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          {solutionsAt.length === 0 && <p className="text-muted-foreground">{t("noSolutions")}</p>}
          <ul className="space-y-1">
            {solutionsAt.map((s) => (
              <li key={s.id}>
                <Link href={`/solutions/${s.id}`} className="text-primary hover:underline">
                  {atDate
                    ? (periodAt(s.timeline.namePeriods, atDate)?.name ?? s.timeline.currentName)
                    : s.timeline.currentName}
                </Link>
              </li>
            ))}
          </ul>
          {!atDate && formerSolutions.length > 0 && (
            <>
              <h3 className="font-medium text-muted-foreground pt-2">{t("formerSolutions")}</h3>
              <ul className="space-y-1">
                {formerSolutions.map((s) => (
                  <li key={s.id}>
                    <Link href={`/solutions/${s.id}`} className="text-primary hover:underline">
                      {s.timeline.currentName}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {/* Acquisitions made */}
      {acquisitionsMade.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("acquisitionsMade")}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y [&>*]:py-2">
            {acquisitionsMade.map((e) => (
              <EventLine key={e.id} event={e} showTypeBadge={false} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Unified timeline */}
      <Card>
        <CardHeader>
          <CardTitle>{t("timeline")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="timeline">
            <TabsList>
              <TabsTrigger value="timeline">{t("timelineView")}</TabsTrigger>
              <TabsTrigger value="bands">{t("bandsView")}</TabsTrigger>
            </TabsList>
            <TabsContent value="timeline" className="pt-3">
              <div className="divide-y [&>*]:py-2.5">
                {companyEvents.length === 0 && (
                  <p className="text-sm text-muted-foreground">{tCommon("noResults")}</p>
                )}
                {companyEvents.map((e) => (
                  <div key={e.id}>
                    <EventLine event={e} />
                    {e.description && (
                      <p className="text-xs text-muted-foreground mt-1 ml-28">{e.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="bands" className="pt-3">
              <PeriodBands rows={bands} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
