// Admin: a single screen listing ALL events with filters and inline editing.
import { getTranslations } from "next-intl/server";
import { EventsAdmin, type AdminEventRow } from "@/components/admin/events-admin";
import { loadAllEvents, loadMarket } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AdminEvents() {
  const t = await getTranslations("admin");
  const [events, market] = await Promise.all([loadAllEvents(), loadMarket()]);

  const companyName = (id: string | null | undefined) =>
    id ? (market.companyNameById.get(id) ?? "?") : null;
  const solutionName = (id: string | null | undefined) =>
    id ? (market.solutionNameById.get(id) ?? "?") : null;

  // Flatten each event into a serializable row (all editable fields + display).
  const rows: AdminEventRow[] = events.map((e) => ({
    id: e.id,
    type: e.type,
    year: e.year,
    month: e.month,
    importance: e.importance,
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
    subjectCompanyId: e.subjectCompanyId,
    subjectSolutionId: e.subjectSolutionId,
    // Display helpers
    subjectName:
      solutionName(e.subjectSolutionId) ?? companyName(e.subjectCompanyId) ?? "—",
    subjectKind: e.subjectSolutionId ? "solution" : e.subjectCompanyId ? "company" : null,
  }));

  const companies = [...market.companies]
    .map((c) => ({ id: c.id, label: c.timeline.currentName }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const solutions = [...market.solutions]
    .map((s) => ({ id: s.id, label: s.timeline.currentName }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("events")}</h1>
      <EventsAdmin rows={rows} companies={companies} solutions={solutions} />
    </div>
  );
}
