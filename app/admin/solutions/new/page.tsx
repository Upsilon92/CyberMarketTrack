import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { loadMarket } from "@/lib/queries";
import { SolutionForm } from "@/components/admin/solution-form";

export const dynamic = "force-dynamic";

export default async function NewSolutionPage() {
  const t = await getTranslations("admin");
  const market = await loadMarket();
  const tags = await prisma.tag.findMany({ orderBy: { slug: "asc" } });
  const companies = [...market.companies]
    .map((c) => ({ id: c.id, label: c.timeline.currentName }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("newSolution")}</h1>
      <SolutionForm companies={companies} tags={tags} />
    </div>
  );
}
