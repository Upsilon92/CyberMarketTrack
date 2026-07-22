// Public "propose a change" page. ?type=company|solution|tag|event, optional
// &id= for an update. Renders the matching form in proposal mode (submits to
// /api/proposals as PENDING). Open to everyone; rate-limited server-side by IP.
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CompanyForm } from "@/components/admin/company-form";
import { SolutionForm } from "@/components/admin/solution-form";
import { TagForm } from "@/components/admin/tag-form";
import { EventForm } from "@/components/admin/event-form";
import { loadMarket } from "@/lib/queries";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ProposePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; id?: string }>;
}) {
  const { type, id } = await searchParams;
  const locale = (await getLocale()) as "fr" | "en";
  const t = await getTranslations("proposals");
  const market = await loadMarket();

  const companyOptions = [...market.companies]
    .map((c) => ({ id: c.id, label: c.timeline.currentName }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const solutionOptions = [...market.solutions]
    .map((s) => ({ id: s.id, label: s.timeline.currentName }))
    .sort((a, b) => a.label.localeCompare(b.label));

  let title = t("proposeTitle");
  let form: React.ReactNode = null;

  if (type === "company") {
    const c = id ? market.companies.find((x) => x.id === id) : null;
    if (id && !c) notFound();
    title = c ? t("proposeEditTitle", { name: c.timeline.currentName }) : t("proposeNewCompany");
    form = (
      <CompanyForm
        proposalMode
        companyId={c?.id}
        initial={
          c
            ? {
                initialName: c.initialName,
                types: c.types.map((ct) => ct.type),
                foundedYear: String(c.foundedYear),
                foundedMonth: c.foundedMonth != null ? String(c.foundedMonth) : "",
                country: c.country,
                originCountry: c.originCountry ?? "",
                description: c.description ?? "",
                website: c.website ?? "",
                logoUrl: c.logoUrl ?? "",
              }
            : undefined
        }
      />
    );
  } else if (type === "solution") {
    const s = id ? market.solutions.find((x) => x.id === id) : null;
    if (id && !s) notFound();
    const tags = await prisma.tag.findMany({ orderBy: { slug: "asc" } });
    title = s ? t("proposeEditTitle", { name: s.timeline.currentName }) : t("proposeNewSolution");
    form = (
      <SolutionForm
        proposalMode
        solutionId={s?.id}
        companies={companyOptions}
        tags={tags}
        initial={
          s
            ? {
                initialName: s.initialName,
                initialCompanyId: s.initialCompanyId,
                description: s.description ?? "",
                features: s.features ?? "",
                launchYear: s.launchYear != null ? String(s.launchYear) : "",
                launchMonth: s.launchMonth != null ? String(s.launchMonth) : "",
                website: s.website ?? "",
                tagIds: s.tags.map((tag) => tag.id),
              }
            : undefined
        }
      />
    );
  } else if (type === "tag") {
    const tag = id ? await prisma.tag.findUnique({ where: { id } }) : null;
    if (id && !tag) notFound();
    title = tag ? t("proposeEditTitle", { name: locale === "fr" ? tag.labelFr : tag.labelEn }) : t("proposeNewTag");
    form = (
      <TagForm
        proposalMode
        tagId={tag?.id}
        initial={
          tag
            ? {
                slug: tag.slug,
                family: tag.family,
                labelFr: tag.labelFr,
                labelEn: tag.labelEn,
                descriptionFr: tag.descriptionFr ?? "",
                descriptionEn: tag.descriptionEn ?? "",
                category: tag.category ?? "",
              }
            : undefined
        }
      />
    );
  } else if (type === "event") {
    title = t("proposeNewEvent");
    form = <EventForm proposalMode companies={companyOptions} solutions={solutionOptions} />;
  } else {
    notFound();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">{t("proposeHint")}</p>
      </div>
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">{t("proposeCardTitle")}</CardTitle>
        </CardHeader>
        <CardContent>{form}</CardContent>
      </Card>
    </div>
  );
}
