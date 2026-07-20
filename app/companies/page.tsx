// Companies list: filters (type, country, DERIVED current status) + sort.
// Displayed names are the derived current names; former names as subtitles.
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { CompanyLogo } from "@/components/company-logo";
import { Flag } from "@/components/flag";
import { MultiFilterBar, type MultiFilterGroup } from "@/components/multi-filter-bar";
import { LiveListFilter, type LiveListItem } from "@/components/live-list-filter";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { loadMarket, ownerDisplayName, isStale } from "@/lib/queries";
import { formerNamePeriods } from "@/lib/timeline";
import { formatRange, formatDate, type Locale } from "@/lib/date";
import { countryFlag } from "@/lib/flags";
import { CONTINENTS, continentOf } from "@/lib/continents";
import { COMPANY_TYPES, type CompanyStatus } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    continent?: string;
    country?: string;
    status?: string;
    sort?: string;
  }>;
}) {
  const sp = await searchParams;
  const sort = sp.sort ?? "name";
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("companies");
  const tTypes = await getTranslations("companyTypes");
  const tContinents = await getTranslations("continents");
  const tCommon = await getTranslations("common");
  const tAdmin = await getTranslations("admin");
  const isAdmin = (await auth())?.user?.role === "ADMIN";
  const market = await loadMarket();

  // Multi-select: each param is a comma-separated list; OR within a group,
  // AND across groups.
  const selType = sp.type?.split(",").filter(Boolean) ?? [];
  const selContinent = sp.continent?.split(",").filter(Boolean) ?? [];
  const selCountry = sp.country?.split(",").filter(Boolean) ?? [];

  // Status is now two buckets: "existing" (still around) vs "gone" (absorbed /
  // merged / defunct). Defaults to "existing" when the param is absent.
  const STATUS_BUCKETS: Record<string, string[]> = {
    existing: ["INDEPENDENT", "INVESTOR_OWNED", "INVESTOR_UNKNOWN", "SUBSIDIARY"],
    gone: ["ABSORBED", "MERGED", "DEFUNCT"],
  };
  const selStatus = sp.status === undefined ? ["existing"] : sp.status.split(",").filter(Boolean);
  const allowedStatuses = new Set(selStatus.flatMap((b) => STATUS_BUCKETS[b] ?? []));

  let list = market.companies;
  if (selType.length) list = list.filter((c) => c.types.some((ct) => selType.includes(ct.type)));
  // Country (if any) is the most specific; otherwise fall back to continent.
  if (selCountry.length) list = list.filter((c) => selCountry.includes(c.country));
  else if (selContinent.length) {
    list = list.filter((c) => {
      const k = continentOf(c.country);
      return k !== null && selContinent.includes(k);
    });
  }
  if (selStatus.length) list = list.filter((c) => allowedStatuses.has(c.timeline.currentStatus));

  list = [...list].sort((a, b) => {
    if (sort === "founded") return a.foundedYear - b.foundedYear;
    if (sort === "updated") return b.updatedAt.getTime() - a.updatedAt.getTime();
    return a.timeline.currentName.localeCompare(b.timeline.currentName);
  });

  const countries = [...new Set(market.companies.map((c) => c.country))].sort();
  const continentsPresent = CONTINENTS.filter((k) => countries.some((c) => continentOf(c) === k));
  // Countries shown in the country group: only those within the selected
  // continent(s) — so the user picks a continent first, then refines by country.
  const countryOptions = countries
    .filter((c) => !selContinent.length || selContinent.includes(continentOf(c) ?? ""))
    .map((c) => ({ value: c, label: `${countryFlag(c)} ${c}` }));

  const groups: MultiFilterGroup[] = [
    {
      param: "type",
      label: t("type"),
      selected: selType,
      options: COMPANY_TYPES.map((v) => ({ value: v, label: tTypes(v) })),
    },
    {
      param: "continent",
      label: tCommon("continent"),
      selected: selContinent,
      options: continentsPresent.map((k) => ({ value: k, label: tContinents(k) })),
    },
    // The country group only appears once a continent is chosen.
    ...(selContinent.length
      ? [
          {
            param: "country",
            label: tCommon("country"),
            selected: selCountry,
            options: countryOptions,
          },
        ]
      : []),
    {
      param: "status",
      label: t("status"),
      selected: selStatus,
      options: [
        { value: "existing", label: t("statusExisting") },
        { value: "gone", label: t("statusGone") },
      ],
    },
  ];

  // Server-rendered cards + a searchable string (current name + former names +
  // aliases), handed to the live name filter (client-side, instant).
  const items: LiveListItem[] = list.map((c) => {
    const formers = formerNamePeriods(c.timeline);
    const owners = c.timeline.currentOwners;
    const search = [
      c.timeline.currentName,
      ...formers.map((p) => p.name),
      ...c.aliases.map((a) => a.name),
    ]
      .join(" ")
      .toLowerCase();
    const node = (
      <Link href={`/companies/${c.id}`}>
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
    return { id: c.id, search, node };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        {isAdmin && (
          <Link href="/admin/companies/new">
            <Button size="sm">+ {tAdmin("newCompany")}</Button>
          </Link>
        )}
      </div>
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

      <LiveListFilter items={items} placeholder={t("searchPlaceholder")} emptyLabel={t("empty")} />
    </div>
  );
}
