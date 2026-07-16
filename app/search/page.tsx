// Global search results: companies + solutions, matching current names,
// ALL historical names (derived from rename events) and aliases.
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { SearchBar } from "@/components/search-bar";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { searchAll, ownerDisplayName, loadMarket } from "@/lib/queries";
import { formerNamePeriods } from "@/lib/timeline";
import { formatRange, type Locale } from "@/lib/date";
import { countryFlag } from "@/lib/flags";
import type { CompanyStatus } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("search");
  const results = await searchAll(q);
  const market = await loadMarket();

  return (
    <div className="space-y-6">
      <SearchBar initialQuery={q} />
      <h1 className="text-xl font-semibold">{t("title", { query: q })}</h1>

      {results.companies.length === 0 && results.solutions.length === 0 && (
        <p className="text-muted-foreground">{t("empty", { query: q })}</p>
      )}

      {results.companies.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground uppercase">{t("companies")}</h2>
          <div className="grid gap-2">
            {results.companies.map(({ company: c, match }) => {
              const formers = formerNamePeriods(c.timeline);
              return (
                <Link key={c.id} href={`/companies/${c.id}`}>
                  <Card className="card-hover">
                    <CardContent className="py-3 flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {countryFlag(c.country)} {c.timeline.currentName}
                      </span>
                      <StatusBadge status={c.timeline.currentStatus as CompanyStatus} />
                      {formers.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {formers
                            .map((p) => `${p.name} (${formatRange(p.start, p.end, locale)})`)
                            .join(", ")}
                        </span>
                      )}
                      {match.kind === "alias" && (
                        <span className="text-xs text-primary">{t("matchedAlias", { name: match.name })}</span>
                      )}
                      {match.kind === "former" && (
                        <span className="text-xs text-primary">
                          {t("matchedFormerName", { name: match.name })}
                        </span>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {results.solutions.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground uppercase">{t("solutions")}</h2>
          <div className="grid gap-2">
            {results.solutions.map(({ solution: s, match }) => {
              const formers = formerNamePeriods(s.timeline);
              const vendor = ownerDisplayName(market, s.timeline.currentOwnerCompanyId);
              return (
                <Link key={s.id} href={`/solutions/${s.id}`}>
                  <Card className="card-hover">
                    <CardContent className="py-3 flex flex-wrap items-center gap-2">
                      <span className="font-medium">{s.timeline.currentName}</span>
                      <span className="text-xs text-muted-foreground">{vendor}</span>
                      {formers.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {formers
                            .map((p) => `${p.name} (${formatRange(p.start, p.end, locale)})`)
                            .join(", ")}
                        </span>
                      )}
                      {match.kind === "alias" && (
                        <span className="text-xs text-primary">{t("matchedAlias", { name: match.name })}</span>
                      )}
                      {match.kind === "former" && (
                        <span className="text-xs text-primary">
                          {t("matchedFormerName", { name: match.name })}
                        </span>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
