// New comparator: either empty (with optional pre-selected solutions coming
// from the "Compare these solutions" button), or generated from a tag family
// (checks matrix / coverage matrix templates).
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadMarket } from "@/lib/queries";
import {
  buildCatalog,
  generateChecksTemplate,
  generateCoverageTemplate,
} from "@/lib/comparator-data";
import { emptyContent } from "@/lib/comparator";
import { ComparatorEditor } from "@/components/comparator/editor";
import { TemplateGeneratorForm } from "@/components/comparator/template-generator";

export const dynamic = "force-dynamic";

export default async function NewComparatorPage({
  searchParams,
}: {
  searchParams: Promise<{ solutions?: string; family?: string; tag?: string; mode?: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/login?callbackUrl=/comparators/new");

  const { solutions, family, tag, mode } = await searchParams;
  const locale = (await getLocale()) as "fr" | "en";
  const t = await getTranslations("comparators");
  const market = await loadMarket();
  const catalog = await buildCatalog();

  // Template generation from a tag family
  let content = emptyContent();
  if (family && mode === "coverage") {
    content = await generateCoverageTemplate(family, tag ?? null, market);
  } else if (family) {
    content = await generateChecksTemplate(family, tag ?? null, market);
  } else if (solutions) {
    // Pre-selection from "Compare these solutions"
    const ids = solutions.split(",").filter(Boolean);
    content.items = market.solutions
      .filter((s) => ids.includes(s.id))
      .map((s) => ({ kind: "solution" as const, id: s.id }));
    content.defaultAttributes = ["vendor", "tags"];
  }

  const allTags = await prisma.tag.findMany({ orderBy: { slug: "asc" } });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("new")}</h1>

      <TemplateGeneratorForm
        tags={allTags.map((tg) => ({
          slug: tg.slug,
          family: tg.family,
          label: locale === "fr" ? tg.labelFr : tg.labelEn,
        }))}
      />

      <ComparatorEditor initialName="" initialContent={content} catalog={catalog} canEdit />
    </div>
  );
}
