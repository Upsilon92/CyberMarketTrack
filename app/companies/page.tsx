// Companies list: filters (type, country, DERIVED current status) + sort.
// Displayed names are the derived current names; former names as subtitles.
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { CompanyLogo } from "@/components/company-logo";
import { Flag } from "@/components/flag";
import { MultiFilterBar, type MultiFilterGroup } from "@/components/multi-filter-bar";
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
  const sp = await searchParams;
  const sort = sp.sort ?? "name";
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("companies");
  const tTypes = await getTranslations("companyTypes");
  const tStatuses = await getTranslations("statuses");
  const tCommon = await getTranslations("common");
  const market = await loadMarket();

  // Multi-select: each param is a comma-separated list; OR within a group,
  // AND across groups.
  const selType = sp.type?.split(",").filter(Boolean) ?? [];
  const selCountry = sp.country?.split(",").filter(Boolean) ?? [];
  // Status defaults to "active-ish" companies (hides absorbed/merged/defunct)
  // when the param is absent from the URL. Fully modifiable by the user.
  const DEFAULT_STATUS = ["INDEPENDENT", "INVESTOR_OWNED", "INVESTOR_UNKNOWN", "SUBSIDIARY"];
  const selStatus =
    sp.status === undefined ? DEFAULT_STATUS : sp.status.split(",").filter(Boolean);

  let list = market.companies;
  if (selType.length) list = list.filter((c) => c.types.some((ct) => selType.includes(ct.type)));
  if (selCountry.length) list = list.filter((c) => selCountry.includes(c.country));
  if (selStatus.length) list = list.filter((c) => selStatus.includes(c.timeline.currentStatus));

  list = [...list].sort((a, b) => {
    if (sort === "founded") return a.foundedYear - b.foundedYear;
    if (sort === "updated") return b.updatedAt.getTime() - a.updatedAt.getTime();
    return a.timeline.currentName.localeCompare(b.timeline.currentName);
  });

  const countries = [...new Set(market.companies.map((c) => c.country))].sort();

  const groups: MultiFilterGroup[] = [
    {
      param: "type",
      label: t("type"),
      selected: selType,
      options: COMPANY_TYPES.map((v) => ({ value: v, label: tTypes(v) })),
    },
    {
      param: "country",
      label: tCommon("country"),
      selected: selCountry,
      options: countries.map((c) => ({ value: c, label: `${countryFlag(c)} ${c}` })),
    },
    {
      param: "status",
      label: t("status"),
      selected: selStatus,
      options: COMPANY_STATUSES.map((s) => ({ value: s, label: tStatuses(s) })),
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <MultiFilterBar
        groups={groups}
        sort={{
          label: t("sortBy"),
          value: sort,
          options: [
            { value: "name", label: t("sortName") },
            { value: "founded", label: t("sortFounded") },
            { value: "updated", label: t("sortUpdated") },
          ],
        }}
        resetLabel={tCommon("reset")}
      />

      {list.length === 0 && <p className="text-muted-foreground">{t("empty")}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {list.map((c) => {
          const formers = formerNamePeriods(c.timeline);
          const owners = c.timeline.currentOwners;
          return (
            <Link key={c.id} href={`/companies/${c.id}`}>
              <Card className="card-hover h-full">
                <CardContent className="py-3 flex gap-3">
                  <CompanyLogo
                    name={c.timeline.currentName}
                    logoUrl={c.logoUrl}
                    width={84}
                    height={52}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium flex items-center gap-1.5">
                        <Flag iso={c.country} size="1.4em" />
                        {c.timeline.currentName}
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
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>
                        {tCommon("founded", {
                          date: formatDate({ year: c.foundedYear, month: c.foundedMonth }, locale),
                        })}
                      </span>
                      {owners.length > 0 && (
                        <span>
                          →{" "}
                          {owners
                            .map((o) => ownerDisplayName(market, o.ownerCompanyId, o.ownerNameRaw))
                            .join(", ")}
                        </span>
                      )}
                      {formers.length > 0 && (
                        <span>
                          {tCommon("formerly", {
                            names: formers
                              .map((p) => `${p.name} (${formatRange(p.start, p.end, locale)})`)
                              .join(", "),
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
