// Dedicated history editor screen for a solution.
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { HistoryEditor, type EditorEvent } from "@/components/admin/history-editor";
import { PrependHistoryForm } from "@/components/admin/prepend-history-form";
import { loadMarket, ownerDisplayName } from "@/lib/queries";

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
    importance: e.importance,
    descriptionFr: e.descriptionFr,
    descriptionEn: e.descriptionEn,
    url1: e.url1,
    url2: e.url2,
    newName: e.newName,
    acquirerCompanyId: e.acquirerCompanyId,
    acquirerNameRaw: e.acquirerNameRaw,
    acquiredNameRaw: e.acquiredNameRaw,
    parentCompanyId: e.parentCompanyId,
    outcome: e.outcome,
    withCompanyId: e.withCompanyId,
    newOwnerCompanyId: e.newOwnerCompanyId,
    intoSolutionId: e.intoSolutionId,
    amount: e.amount,
    round: e.round,
    note: e.note,
    fromCountry: e.fromCountry,
    newCountry: e.newCountry,
    newCity: e.newCity,
  }));

  const companies = [...market.companies]
    .map((c) => ({ id: c.id, label: c.timeline.currentName }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const fundIds = market.companies
    .filter((c) => c.types.some((ct) => ct.type === "INVESTMENT_FUND"))
    .map((c) => c.id);

  // Other solutions = potential hosts for a SOLUTION_INTEGRATED event
  const otherSolutions = [...market.solutions]
    .filter((s) => s.id !== id)
    .map((s) => ({ id: s.id, label: s.timeline.currentName }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="space-y-4">
      <Link href={`/solutions/${id}`}>
        <Button variant="outline" size="sm">
          ← {t("backToSolution")}
        </Button>
      </Link>
      <h1 className="text-xl font-bold">
        {t("historyOf", { name: solution.timeline.currentName })}
      </h1>
      <PrependHistoryForm
        solutionId={id}
        currentName={solution.initialName}
        currentVendorLabel={ownerDisplayName(market, solution.initialCompanyId)}
        companies={companies}
      />
      <HistoryEditor
        kind="solution"
        entityId={id}
        entityName={solution.timeline.currentName}
        events={events}
        companies={companies}
        fundIds={fundIds}
        ownedSolutions={[]}
        otherSolutions={otherSolutions}
      />
    </div>
  );
}
