// Companies list: filters (type, country, DERIVED current status) + sort.
// Displayed names are the derived current names; former names as subtitles.
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { FilterBar, type FilterDef } from "@/components/filter-bar";
import { loadMarket, ownerDisplayName, isStale } from "@/lib/queries";
import { formerNamePeriods } from "@/lib/timeline";
import { formatRange, formatDate, type Locale } from "@/lib/date";
import { countryFlag } from "@/lib/flags";
import { COMPANY_TYPES, COMPANY_STATUSES, type CompanyStatus } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; country?: string; status?: string; sort?: string }>;
}) {
  const { type, country, status, sort = "name" } = await searchParams;
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("companies");
  const tTypes = await getTranslations("companyTypes");
  const tStatuses = await getTranslations("statuses");
  const tCommon = await getTranslations("common");
  const market = await loadMarket();

  let list = market.companies;
  if (type) list = list.filter((c) => c.types.some((ct) => ct.type === type));
  if (country) list = list.filter((c) => c.country === country);
  if (status) list = list.filter((c) => c.timeline.currentStatus === status);

  list = [...list].sort((a, b) => {
    if (sort === "founded") return a.foundedYear - b.foundedYear;
    if (sort === "updated") return b.updatedAt.getTime() - a.updatedAt.getTime();
    return a.timeline.currentName.localeCompare(b.timeline.currentName);
  });

  const countries = [...new Set(market.companies.map((c) => c.country))].sort();

  const filters: FilterDef[] = [
    {
      name: "type",
      label: t("type"),
      value: type ?? "",
      options: COMPANY_TYPES.map((v) => ({ value: v, label: tTypes(v) })),
    },
    {
      name: "country",
      label: tCommon("country"),
      value: country ?? "",
      options: countries.map((c) => ({ value: c, label: `${countryFlag(c)} ${c}` })),
    },
    {
      name: "status",
      label: t("status"),
      value: status ?? "",
      options: COMPANY_STATUSES.map((s) => ({ value: s, label: tStatuses(s) })),
    },
    {
      name: "sort",
      label: t("sortBy"),
      value: sort,
      noAllOption: true,
      options: [
        { value: "name", label: t("sortName") },
        { value: "founded", label: t("sortFounded") },
        { value: "updated", label: t("sortUpdated") },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <FilterBar filters={filters} allLabel={tCommon("all")} resetLabel={tCommon("reset")} />

      {list.length === 0 && <p className="text-muted-foreground">{t("empty")}</p>}

      <div className="grid gap-2">
        {list.map((c) => {
          const formers = formerNamePeriods(c.timeline);
          const owner = c.timeline.currentOwner;
          return (
            <Link key={c.id} href={`/companies/${c.id}`}>
              <Card className="hover:border-primary/50 transition-colors">
                <CardContent className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {countryFlag(c.country)} {c.timeline.currentName}
                    </span>
                    {c.types.map((ct) => (
                      <Badge key={ct.id} variant="outline" className="text-[10px]">
                        {tTypes(ct.type)}
                      </Badge>
                    ))}
                    <StatusBadge status={c.timeline.currentStatus as CompanyStatus} />
                    {isStale(c.updatedAt) && (
                      <Badge variant="destructive" className="text-[10px]">
                        {tCommon("toRecheck")}
                      </Badge>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {tCommon("founded", {
                        date: formatDate({ year: c.foundedYear, month: c.foundedMonth }, locale),
                      })}
                    </span>
                  </div>
                  {(formers.length > 0 || owner) && (
                    <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-x-4">
                      {formers.length > 0 && (
                        <span>
                          {tCommon("formerly", {
                            names: formers
                              .map((p) => `${p.name} (${formatRange(p.start, p.end, locale)})`)
                              .join(", "),
                          })}
                        </span>
                      )}
                      {owner && (
                        <span>
                          → {ownerDisplayName(market, owner.ownerCompanyId, owner.ownerNameRaw)}
                        </span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
