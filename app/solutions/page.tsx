// Solutions list: multi-select tag filters (the three families filter
// independently) + current-vendor filter. Names/vendors are derived.
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { TagBadge } from "@/components/tag-badge";
import { CompanyLogo } from "@/components/company-logo";
import { Flag } from "@/components/flag";
import { MultiTagFilter } from "@/components/multi-tag-filter";
import { loadMarket, ownerDisplayName } from "@/lib/queries";
import { formerNamePeriods } from "@/lib/timeline";
import { formatRange, type Locale } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { TAG_FAMILIES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function SolutionsPage({
  searchParams,
}: {
  searchParams: Promise<{ types?: string; capabilities?: string; scopes?: string; vendor?: string }>;
}) {
  const sp = await searchParams;
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("solutions");
  const tFamilies = await getTranslations("tagFamilies");
  const tCommon = await getTranslations("common");
  const market = await loadMarket();
  const allTags = await prisma.tag.findMany({ orderBy: { slug: "asc" } });

  // Selected tag slugs per family (comma-separated in the URL)
  const selected: Record<string, string[]> = {
    SOLUTION_TYPE: sp.types?.split(",").filter(Boolean) ?? [],
    CAPABILITY: sp.capabilities?.split(",").filter(Boolean) ?? [],
    SCOPE: sp.scopes?.split(",").filter(Boolean) ?? [],
  };

  let list = market.solutions;
  // Each family filters separately: the solution must carry at least one
  // selected tag of every family that has a selection.
  for (const family of TAG_FAMILIES) {
    const sel = selected[family];
    if (sel.length > 0) {
      list = list.filter((s) => s.tags.some((tag) => tag.family === family && sel.includes(tag.slug)));
    }
  }
  if (sp.vendor) list = list.filter((s) => s.timeline.currentOwnerCompanyId === sp.vendor);

  list = [...list].sort((a, b) => a.timeline.currentName.localeCompare(b.timeline.currentName));

  const vendors = [...new Set(market.solutions.map((s) => s.timeline.currentOwnerCompanyId))]
    .map((cid) => ({ value: cid, label: market.companyNameById.get(cid) ?? "?" }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const familyParams: Record<string, string> = {
    SOLUTION_TYPE: "types",
    CAPABILITY: "capabilities",
    SCOPE: "scopes",
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <MultiTagFilter
        groups={TAG_FAMILIES.map((family) => ({
          param: familyParams[family],
          label: tFamilies(family),
          selected: selected[family],
          options: allTags
            .filter((tag) => tag.family === family)
            .map((tag) => ({ value: tag.slug, label: locale === "fr" ? tag.labelFr : tag.labelEn })),
        }))}
        vendor={{
          label: t("vendor"),
          value: sp.vendor ?? "",
          options: vendors,
          allLabel: tCommon("all"),
        }}
        resetLabel={tCommon("reset")}
      />

      {list.length === 0 && <p className="text-muted-foreground">{t("empty")}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {list.map((s) => {
          const formers = formerNamePeriods(s.timeline);
          const vendor = market.companies.find((c) => c.id === s.timeline.currentOwnerCompanyId);
          return (
            <Link key={s.id} href={`/solutions/${s.id}`}>
              <Card className="card-hover h-full">
                <CardContent className="py-3 flex gap-3">
                  {/* Editor (vendor) logo */}
                  <CompanyLogo
                    name={vendor?.timeline.currentName ?? "?"}
                    logoUrl={vendor?.logoUrl}
                    width={72}
                    height={44}
                  />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{s.timeline.currentName}</span>
                      {formers.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {tCommon("formerly", {
                            names: formers
                              .map((p) => `${p.name} (${formatRange(p.start, p.end, locale)})`)
                              .join(", "),
                          })}
                        </span>
                      )}
                    </div>
                    {/* Editor: flag + name */}
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                      {vendor && <Flag iso={vendor.country} size="1.2em" />}
                      {ownerDisplayName(market, s.timeline.currentOwnerCompanyId)}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {s.tags.map((tag) => (
                        <TagBadge key={tag.id} tag={tag} locale={locale} />
                      ))}
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
