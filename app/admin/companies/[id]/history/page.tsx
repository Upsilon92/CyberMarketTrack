// Dedicated history editor screen for a company (spec F2).
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { HistoryEditor, type EditorEvent } from "@/components/admin/history-editor";
import { loadMarket, solutionsOfCompany } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function CompanyHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("admin");
  const market = await loadMarket();
  const company = market.companies.find((c) => c.id === id);
  if (!company) notFound();

  const events: EditorEvent[] = company.subjectEvents.map((e) => ({
    id: e.id,
    type: e.type,
    year: e.year,
    month: e.month,
    description: e.description,
    newName: e.newName,
    acquirerCompanyId: e.acquirerCompanyId,
    acquirerNameRaw: e.acquirerNameRaw,
    outcome: e.outcome,
    withCompanyId: e.withCompanyId,
    newOwnerCompanyId: e.newOwnerCompanyId,
    intoSolutionId: e.intoSolutionId,
    amount: e.amount,
    round: e.round,
    note: e.note,
  }));

  const companies = [...market.companies]
    .map((c) => ({ id: c.id, label: c.timeline.currentName }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const fundIds = market.companies
    .filter((c) => c.types.some((ct) => ct.type === "INVESTMENT_FUND"))
    .map((c) => c.id);

  const { current } = solutionsOfCompany(market, id);
  const ownedSolutions = current.map((s) => ({ id: s.id, label: s.timeline.currentName }));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">
        {t("historyOf", { name: company.timeline.currentName })}
      </h1>
      <HistoryEditor
        kind="company"
        entityId={id}
        entityName={company.timeline.currentName}
        events={events}
        companies={companies}
        fundIds={fundIds}
        ownedSolutions={ownedSolutions}
      />
    </div>
  );
}
