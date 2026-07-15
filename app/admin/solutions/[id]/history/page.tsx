// Dedicated history editor screen for a solution.
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { HistoryEditor, type EditorEvent } from "@/components/admin/history-editor";
import { loadMarket } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function SolutionHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("admin");
  const market = await loadMarket();
  const solution = market.solutions.find((s) => s.id === id);
  if (!solution) notFound();

  const events: EditorEvent[] = solution.events.map((e) => ({
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

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">
        {t("historyOf", { name: solution.timeline.currentName })}
      </h1>
      <HistoryEditor
        kind="solution"
        entityId={id}
        entityName={solution.timeline.currentName}
        events={events}
        companies={companies}
        fundIds={fundIds}
        ownedSolutions={[]}
      />
    </div>
  );
}
