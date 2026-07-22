// Solution page: description, features, three tag families, derived vendor,
// timeline, ownership history, and the "similar solutions" block ranked by
// shared tags (SOLUTION_TYPE first, refined by shared SCOPE).
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown";
import { TagBadge } from "@/components/tag-badge";
import { EventLine } from "@/components/event-line";
import { PeriodBands, toSegments, type BandRow } from "@/components/period-bands";
import {
  loadMarket,
  loadAllEvents,
  ownerDisplayName,
  isStale,
  solutionsIntegratedInto,
} from "@/lib/queries";
import { DeleteButton } from "@/components/admin/delete-button";
import { auth } from "@/lib/auth";
import { formerNamePeriods } from "@/lib/timeline";
import { formatDate, formatRange, type Locale } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function SolutionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("solution");
  const tCommon = await getTranslations("common");
  const tSolStatuses = await getTranslations("solutionStatuses");
  const tAdmin = await getTranslations("admin");
  const tProp = await getTranslations("proposals");
  const isAdmin = (await auth())?.user?.role === "ADMIN";

  const market = await loadMarket();
  const solution = market.solutions.find((s) => s.id === id);
  if (!solution) notFound();

  const tl = solution.timeline;
  const formers = formerNamePeriods(tl);
  const vendorName = ownerDisplayName(market, tl.currentOwnerCompanyId);

  // Integration relationships (derived from SOLUTION_INTEGRATED events)
  const hostSolution = tl.integratedIntoSolutionId
    ? market.solutions.find((s) => s.id === tl.integratedIntoSolutionId)
    : null;
  const integratedSolutions = solutionsIntegratedInto(market, id);

  const allEvents = await loadAllEvents();
  const solutionEvents = allEvents.filter((e) => e.subjectSolutionId === id);

  // ---- Similar solutions: ranked by shared tags -----------------------------
  // Priority to shared SOLUTION_TYPE tags (weight 10), refined by shared
  // SCOPE (weight 3) and shared CAPABILITY (weight 1).
  const myTagIds = new Set(solution.tags.map((tag) => tag.id));
  const similar = market.solutions
    .filter((s) => s.id !== id)
    .map((s) => {
      let score = 0;
      let shared = 0;
      for (const tag of s.tags) {
        if (!myTagIds.has(tag.id)) continue;
        shared++;
        score += tag.family === "SOLUTION_TYPE" ? 10 : tag.family === "SCOPE" ? 3 : 1;
      }
      return { solution: s, score, shared };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const compareIds = [id, ...similar.map((x) => x.solution.id)].join(",");

  const tCompany = await getTranslations("company");
  const bands: BandRow[] = [
    { label: tCompany("names"), segments: toSegments(tl.namePeriods, (p) => p.name) },
    {
      label: t("vendor"),
      segments: toSegments(tl.ownershipPeriods, (p) => ownerDisplayName(market, p.ownerCompanyId)),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{tl.currentName}</h1>
          <Badge variant={tl.currentStatus === "ACTIVE" ? "default" : "secondary"}>
            {tSolStatuses(tl.currentStatus)}
          </Badge>
          {/* When integrated, link to the host solution */}
          {hostSolution && (
            <Badge variant="outline" className="gap-1">
              →
              <Link href={`/solutions/${hostSolution.id}`} className="text-primary hover:underline">
                {t("integratedInto", { name: hostSolution.timeline.currentName })}
              </Link>
            </Badge>
          )}
          {isStale(solution.updatedAt) && <Badge variant="destructive">{tCommon("toRecheck")}</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          {t("vendor")} :{" "}
          <Link href={`/companies/${tl.currentOwnerCompanyId}`} className="text-primary hover:underline">
            {vendorName}
          </Link>
          {solution.launchYear && (
            <>
              {" · "}
              {tCommon("launched", {
                date: formatDate({ year: solution.launchYear, month: solution.launchMonth }, locale),
              })}
            </>
          )}
          {solution.website && (
            <>
              {" · "}
              <a href={solution.website} className="text-primary hover:underline" rel="noopener noreferrer" target="_blank">
                {tCommon("website")} ↗
              </a>
            </>
          )}
        </p>
        {formers.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {tCommon("formerly", {
              names: formers
                .map((p) => `${p.name} (${formatRange(p.start, p.end, locale)})`)
                .join(", "),
            })}
          </p>
        )}
        <div className="flex flex-wrap gap-1">
          {solution.tags.map((tag) => (
            <TagBadge key={tag.id} tag={tag} locale={locale} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {tCommon("lastUpdated", { date: solution.updatedAt.toLocaleDateString(locale) })}
        </p>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Link href={`/admin/solutions/${solution.id}`}>
              <Button size="sm" variant="outline">
                {tAdmin("edit")}
              </Button>
            </Link>
            <Link href={`/admin/solutions/${solution.id}/history`}>
              <Button size="sm" variant="outline">
                {tAdmin("history")}
              </Button>
            </Link>
            <DeleteButton path={`/api/solutions/${solution.id}`} redirectTo="/solutions" />
          </div>
        )}
        {!isAdmin && (
          <div className="pt-1">
            <Link href={`/propose?type=solution&id=${solution.id}`}>
              <Button size="sm" variant="outline">
                {tProp("proposeChange")}
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Description & features */}
      {solution.description && (
        <Card>
          <CardHeader>
            <CardTitle>{t("description")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Markdown>{solution.description}</Markdown>
          </CardContent>
        </Card>
      )}
      {solution.features && (
        <Card>
          <CardHeader>
            <CardTitle>{t("features")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Markdown>{solution.features}</Markdown>
          </CardContent>
        </Card>
      )}

      {/* Ownership history */}
      <Card>
        <CardHeader>
          <CardTitle>{t("vendorHistory")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <ul className="space-y-1">
            {tl.ownershipPeriods.map((p, i) => (
              <li key={i}>
                <Link href={`/companies/${p.ownerCompanyId}`} className="text-primary hover:underline">
                  {ownerDisplayName(market, p.ownerCompanyId)}
                </Link>{" "}
                <span className="text-muted-foreground">({formatRange(p.start, p.end, locale)})</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Integrated solutions (this solution is a host) — derived */}
      {integratedSolutions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("integrates")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <ul className="space-y-1">
              {integratedSolutions.map((s) => {
                const since = s.timeline.statusPeriods.find((p) => p.status === "INTEGRATED")?.start
                  ?.year;
                return (
                  <li key={s.id}>
                    <Link href={`/solutions/${s.id}`} className="text-primary hover:underline">
                      {s.timeline.currentName}
                    </Link>{" "}
                    {since && (
                      <span className="text-muted-foreground">
                        ({t("sinceYear", { year: since })})
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>{t("timeline")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="timeline">
            <TabsList>
              <TabsTrigger value="timeline">{tCompany("timelineView")}</TabsTrigger>
              <TabsTrigger value="bands">{tCompany("bandsView")}</TabsTrigger>
            </TabsList>
            <TabsContent value="timeline" className="pt-3">
              <div className="divide-y [&>*]:py-2.5">
                {solutionEvents.length === 0 && (
                  <p className="text-sm text-muted-foreground">{tCommon("noResults")}</p>
                )}
                {solutionEvents.map((e) => (
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

      {/* Similar solutions */}
      {similar.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t("similarSolutions")}</CardTitle>
            <Link href={`/comparators/new?solutions=${compareIds}`}>
              <Button size="sm" variant="outline">
                {t("compareThese")}
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="text-sm">
            <ul className="space-y-1.5">
              {similar.map(({ solution: s, shared }) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2">
                  <Link href={`/solutions/${s.id}`} className="text-primary hover:underline">
                    {s.timeline.currentName}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {ownerDisplayName(market, s.timeline.currentOwnerCompanyId)} ·{" "}
                    {t("sharedTags", { count: shared })}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
