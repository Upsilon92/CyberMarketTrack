// Tag directory: the three families, SCOPE tags grouped by category, each tag
// listing its tagged solutions (derived current names).
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TagBadge } from "@/components/tag-badge";
import { loadMarket } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import { TAG_FAMILIES, SCOPE_CATEGORIES } from "@/lib/constants";
import type { Tag } from "@/lib/generated/prisma/client";

export const dynamic = "force-dynamic";

export default async function TagsPage() {
  const locale = (await getLocale()) as "fr" | "en";
  const t = await getTranslations("tags");
  const tFamilies = await getTranslations("tagFamilies");
  const tScopeCat = await getTranslations("scopeCategories");
  const market = await loadMarket();
  const tags = await prisma.tag.findMany({ orderBy: { slug: "asc" } });

  const label = (tag: Tag) => (locale === "fr" ? tag.labelFr : tag.labelEn);

  function solutionsFor(tagId: string) {
    return market.solutions.filter((s) => s.tags.some((tag) => tag.id === tagId));
  }

  function TagBlock({ tag }: { tag: Tag }) {
    const sols = solutionsFor(tag.id);
    return (
      <div id={tag.slug} className="space-y-1.5 scroll-mt-20">
        <div className="flex items-center gap-2">
          <TagBadge tag={tag} locale={locale} />
          <span className="text-xs text-muted-foreground">
            {t("solutionsTagged", { count: sols.length })}
          </span>
        </div>
        {(locale === "fr" ? tag.descriptionFr : tag.descriptionEn) && (
          <p className="text-xs text-muted-foreground pl-1">
            {locale === "fr" ? tag.descriptionFr : tag.descriptionEn}
          </p>
        )}
        {sols.length > 0 && (
          <ul className="text-sm pl-1 space-y-0.5">
            {sols.map((s) => (
              <li key={s.id}>
                <Link href={`/solutions/${s.id}`} className="text-primary hover:underline">
                  {s.timeline.currentName}
                </Link>{" "}
                <span className="text-xs text-muted-foreground">
                  ({market.companyNameById.get(s.timeline.currentOwnerCompanyId) ?? "?"})
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {TAG_FAMILIES.map((family) => {
        const familyTags = tags.filter((tag) => tag.family === family);
        if (familyTags.length === 0) return null;

        return (
          <Card key={family}>
            <CardHeader>
              <CardTitle>{tFamilies(family)}</CardTitle>
            </CardHeader>
            <CardContent>
              {family === "SCOPE" ? (
                // Scopes grouped by category (Local, Directory, IdP, Cloud, SaaS)
                <div className="space-y-5">
                  {SCOPE_CATEGORIES.map((cat) => {
                    const catTags = familyTags.filter((tag) => tag.category === cat);
                    if (catTags.length === 0) return null;
                    return (
                      <div key={cat} className="space-y-3">
                        <h3 className="text-sm font-medium text-muted-foreground uppercase">
                          {tScopeCat(cat)}
                        </h3>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {catTags.map((tag) => (
                            <TagBlock key={tag.id} tag={tag} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {/* Scopes without category */}
                  {familyTags.some((tag) => !tag.category) && (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {familyTags
                        .filter((tag) => !tag.category)
                        .map((tag) => (
                          <TagBlock key={tag.id} tag={tag} />
                        ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {familyTags.map((tag) => (
                    <TagBlock key={tag.id} tag={tag} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
