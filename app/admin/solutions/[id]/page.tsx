// Solution edit page: intrinsic fields + tags + aliases.
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { loadMarket } from "@/lib/queries";
import { SolutionForm } from "@/components/admin/solution-form";
import { AliasManager } from "@/components/admin/alias-manager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function EditSolutionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("admin");
  const [solution, market, allTags] = await Promise.all([
    prisma.solution.findUnique({
      where: { id },
      include: { tags: true, aliases: true },
    }),
    loadMarket(),
    prisma.tag.findMany({ orderBy: { slug: "asc" } }),
  ]);
  if (!solution) notFound();

  const companies = [...market.companies]
    .map((c) => ({ id: c.id, label: c.timeline.currentName }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">
          {t("edit")} — {solution.initialName}
        </h1>
        <Link href={`/admin/solutions/${id}/history`}>
          <Button variant="outline">{t("history")}</Button>
        </Link>
      </div>

      <SolutionForm
        solutionId={id}
        companies={companies}
        tags={allTags}
        initial={{
          initialName: solution.initialName,
          initialCompanyId: solution.initialCompanyId,
          description: solution.description ?? "",
          features: solution.features ?? "",
          launchYear: solution.launchYear == null ? "" : String(solution.launchYear),
          launchMonth: solution.launchMonth == null ? "" : String(solution.launchMonth),
          website: solution.website ?? "",
          tagIds: solution.tags.map((tag) => tag.id),
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{(await getTranslations("admin.aliases"))("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <AliasManager solutionId={id} aliases={solution.aliases} />
        </CardContent>
      </Card>
    </div>
  );
}
