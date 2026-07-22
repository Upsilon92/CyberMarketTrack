// Market news: reverse-chronological feed of ALL events, filterable by event
// type, year and company — turns the base into a market-watch tool.
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DeleteButton } from "@/components/admin/delete-button";
import { EventLine } from "@/components/event-line";
import { FilterBar, type FilterDef } from "@/components/filter-bar";
import { auth } from "@/lib/auth";
import { loadAllEvents, loadMarket } from "@/lib/queries";
import { EVENT_TYPES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; year?: string; company?: string }>;
}) {
  const { type, year, company } = await searchParams;
  const t = await getTranslations("news");
  const tTypes = await getTranslations("eventTypes");
  const tCommon = await getTranslations("common");
  const tAdmin = await getTranslations("admin");
  const tProp = await getTranslations("proposals");
  const isAdmin = (await auth())?.user?.role === "ADMIN";
  const [events, market] = await Promise.all([loadAllEvents(), loadMarket()]);

  let list = events;
  if (type) list = list.filter((e) => e.type === type);
  if (year) list = list.filter((e) => e.year === Number(year));
  if (company) {
    // The company can be the subject OR the actor of the event
    list = list.filter(
      (e) =>
        e.subjectCompanyId === company ||
        e.acquirerCompanyId === company ||
        e.withCompanyId === company ||
        e.newOwnerCompanyId === company
    );
  }

  const years = [...new Set(events.map((e) => e.year))].sort((a, b) => b - a);
  const companies = [...market.companies]
    .map((c) => ({ value: c.id, label: c.timeline.currentName }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const filters: FilterDef[] = [
    {
      name: "type",
      label: t("eventType"),
      value: type ?? "",
      options: EVENT_TYPES.map((v) => ({ value: v, label: tTypes(v) })),
    },
    {
      name: "year",
      label: t("year"),
      value: year ?? "",
      options: years.map((y) => ({ value: String(y), label: String(y) })),
    },
    {
      name: "company",
      label: t("companyFilter"),
      value: company ?? "",
      options: companies,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {isAdmin ? (
          <Link href="/admin/events/new">
            <Button size="sm">+ {tAdmin("addEvent")}</Button>
          </Link>
        ) : (
          <Link href="/propose?type=event">
            <Button size="sm" variant="outline">
              {tProp("proposeAddEvent")}
            </Button>
          </Link>
        )}
      </div>

      <FilterBar filters={filters} allLabel={tCommon("all")} resetLabel={tCommon("reset")} />

      {list.length === 0 && <p className="text-muted-foreground">{t("empty")}</p>}

      <Card>
        <CardContent className="divide-y [&>*]:py-3">
          {list.map((e) => (
            <div key={e.id} className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <EventLine event={e} logoSide="right" />
                {e.description && (
                  <p className="text-xs text-muted-foreground mt-1 sm:ml-28">{e.description}</p>
                )}
              </div>
              {isAdmin && (
                <div className="shrink-0 flex items-center gap-2">
                  {(e.subjectCompanyId || e.subjectSolutionId) && (
                    <Link
                      href={
                        e.subjectCompanyId
                          ? `/admin/companies/${e.subjectCompanyId}/history`
                          : `/admin/solutions/${e.subjectSolutionId}/history`
                      }
                    >
                      <Button size="sm" variant="outline">
                        {tAdmin("edit")}
                      </Button>
                    </Link>
                  )}
                  <DeleteButton path={`/api/events/${e.id}`} confirmKey="deleteEventConfirm" />
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
