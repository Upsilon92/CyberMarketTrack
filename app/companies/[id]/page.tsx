// Company page: general info, derived current owner(s), revenues, solutions
// (current + former, derived), unified visual timeline + period bands, and the
// fund portfolio.
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/status-badge";
import { CompanyLogo } from "@/components/company-logo";
import { Flag } from "@/components/flag";
import { LogoDownloadButton } from "@/components/logo-download-button";
import { Markdown } from "@/components/markdown";
import { RevenueChart } from "@/components/revenue-chart";
import { EventTimeline } from "@/components/event-timeline";
import { PeriodBands, toSegments, type BandRow } from "@/components/period-bands";
import {
  loadMarket,
  loadAllEvents,
  ownerDisplayName,
  solutionsOfCompany,
  portfolioOfFund,
  isStale,
} from "@/lib/queries";
import { formerNamePeriods, type OwnershipPeriod } from "@/lib/timeline";
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

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("company");
  const tCommon = await getTranslations("common");
  const tTypes = await getTranslations("companyTypes");
  const tStatuses = await getTranslations("statuses");
  const tOwnership = await getTranslations("ownership");

  const market = await loadMarket();
  const company = market.companies.find((c) => c.id === id);
  if (!company) notFound();

  const tl = company.timeline;
  const isFund = company.types.some((ct) => ct.type === "INVESTMENT_FUND");
  const formers = formerNamePeriods(tl);

  const { current: currentSolutions, former: formerSolutions } = solutionsOfCompany(market, id);

  const allEvents = await loadAllEvents();
  // The company's own history (it is the subject) AND the acquisitions it made
  // (it is the acquirer) are woven into a single chronological timeline.
  const companyEvents = allEvents.filter(
    (e) =>
      e.subjectCompanyId === id ||
      ((e.type === "ACQUISITION" || e.type === "CO_INVESTMENT") && e.acquirerCompanyId === id)
  );

  // ---- Period bands: one segment row per open owner would be noisy, so the
  // owners row shows the full ownership history (parallel periods overlap). ----
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
          <CompanyLogo name={tl.currentName} logoUrl={company.logoUrl} width={140} height={72} />
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Flag iso={company.country} size="1.5em" />
            {tl.currentName}
          </h1>
          {company.types.map((ct) => (
            <Badge key={ct.id} variant="outline">
              {tTypes(ct.type)}
            </Badge>
          ))}
          <StatusBadge status={tl.currentStatus as CompanyStatus} />
          {isStale(company.updatedAt) && <Badge variant="destructive">{tCommon("toRecheck")}</Badge>}
          {company.logoUrl && (
            <span className="ml-auto">
              <LogoDownloadButton name={tl.currentName} logoUrl={company.logoUrl} />
            </span>
          )}
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

        {/* Current owner(s) — may be several (co-investment) */}
        <Card>
          <CardHeader>
            <CardTitle>{t("currentOwner")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {tl.currentOwners.length > 0 ? (
              <ul className="space-y-1.5">
                {tl.currentOwners.map((owner, i) => {
                  const label = (
                    <OwnershipLabel
                      period={owner}
                      ownerName={ownerDisplayName(market, owner.ownerCompanyId, owner.ownerNameRaw)}
                      locale={locale}
                    />
                  );
                  return (
                    <li key={i}>
                      {owner.ownerCompanyId ? (
                        <Link href={`/companies/${owner.ownerCompanyId}`} className="text-primary hover:underline">
                          {label}
                        </Link>
                      ) : (
                        label
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <span className="text-muted-foreground">{tOwnership("independent")}</span>
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
          <CardTitle>{t("currentSolutions")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          {currentSolutions.length === 0 && <p className="text-muted-foreground">{t("noSolutions")}</p>}
          <ul className="space-y-1">
            {currentSolutions.map((s) => {
              // "Solution types" tags shown in parentheses after the name.
              const typeTags = s.tags
                .filter((tag) => tag.family === "SOLUTION_TYPE")
                .map((tag) => (locale === "fr" ? tag.labelFr : tag.labelEn));
              return (
                <li key={s.id}>
                  <Link href={`/solutions/${s.id}`} className="text-primary hover:underline">
                    {s.timeline.currentName}
                  </Link>
                  {typeTags.length > 0 && (
                    <span className="text-muted-foreground"> ({typeTags.join(", ")})</span>
                  )}
                </li>
              );
            })}
          </ul>
          {formerSolutions.length > 0 && (
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
      {/* Unified history: timeline + period bands + acquired companies */}
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
            <TabsContent value="timeline" className="pt-4">
              {companyEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">{tCommon("noResults")}</p>
              ) : (
                <EventTimeline events={companyEvents} highlightAcquirerId={id} />
              )}
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
