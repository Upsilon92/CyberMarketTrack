"use client";

// Global events management: filterable table of every event with inline edit
// (common fields + the type-specific field) and delete. Reuses the same API
// (/api/events/[id]) and coherence validation as the per-entity history editor.
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/components/admin/api";
import { formatDate, type Locale } from "@/lib/date";
import { EVENT_TYPES, EVENT_IMPORTANCES } from "@/lib/constants";

export interface AdminEventRow {
  id: string;
  type: string;
  year: number;
  month: number | null;
  importance: string;
  description: string | null;
  newName: string | null;
  acquirerCompanyId: string | null;
  acquirerNameRaw: string | null;
  outcome: string | null;
  withCompanyId: string | null;
  newOwnerCompanyId: string | null;
  intoSolutionId: string | null;
  amount: number | null;
  round: string | null;
  note: string | null;
  subjectCompanyId: string | null;
  subjectSolutionId: string | null;
  subjectName: string;
  subjectKind: "company" | "solution" | null;
}

type Opt = { id: string; label: string };
const OUTCOMES = ["INVESTOR_OWNED", "AUTONOMOUS", "ABSORBED", "UNKNOWN"];

export function EventsAdmin({
  rows,
  companies,
  solutions,
}: {
  rows: AdminEventRow[];
  companies: Opt[];
  solutions: Opt[];
}) {
  const router = useRouter();
  const locale = useLocale() as Locale;
  const t = useTranslations("admin");
  const tf = useTranslations("admin.fields");
  const tTypes = useTranslations("eventTypes");
  const tImp = useTranslations("importances");
  const tOutcomes = useTranslations("outcomes");

  const [fType, setFType] = useState("");
  const [fImp, setFImp] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!fType || r.type === fType) &&
        (!fImp || r.importance === fImp) &&
        (!needle || r.subjectName.toLowerCase().includes(needle))
    );
  }, [rows, fType, fImp, q]);

  const companyLabel = (id: string | null) =>
    id ? (companies.find((c) => c.id === id)?.label ?? "?") : "";
  const solutionLabel = (id: string | null) =>
    id ? (solutions.find((s) => s.id === id)?.label ?? "?") : "";

  function detail(r: AdminEventRow): string {
    switch (r.type) {
      case "COMPANY_RENAME":
      case "SOLUTION_RENAME":
        return `→ ${r.newName ?? ""}`;
      case "ACQUISITION":
        return `→ ${r.acquirerCompanyId ? companyLabel(r.acquirerCompanyId) : r.acquirerNameRaw} (${r.outcome})`;
      case "CO_INVESTMENT":
        return `+ ${r.acquirerCompanyId ? companyLabel(r.acquirerCompanyId) : r.acquirerNameRaw}`;
      case "ABSORPTION":
        return r.acquirerCompanyId ? `→ ${companyLabel(r.acquirerCompanyId)}` : "";
      case "MERGER":
        return `→ ${companyLabel(r.withCompanyId)}`;
      case "SOLUTION_TRANSFER":
        return `→ ${companyLabel(r.newOwnerCompanyId)}`;
      case "SOLUTION_INTEGRATED":
        return `→ ${solutionLabel(r.intoSolutionId)}`;
      case "FUNDING":
        return `${r.amount ?? "?"} M ${r.round ?? ""}`;
      default:
        return "";
    }
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {tf("eventType")}
          <select
            className="border rounded-md bg-background text-foreground px-2 py-1.5 text-sm"
            value={fType}
            onChange={(e) => setFType(e.target.value)}
          >
            <option value="">—</option>
            {EVENT_TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {tTypes(ty)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {tf("importance")}
          <select
            className="border rounded-md bg-background text-foreground px-2 py-1.5 text-sm"
            value={fImp}
            onChange={(e) => setFImp(e.target.value)}
          >
            <option value="">—</option>
            {EVENT_IMPORTANCES.map((imp) => (
              <option key={imp} value={imp}>
                {tImp(imp)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground flex-1 min-w-40">
          {t("eventsSearch")}
          <Input value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <span className="text-xs text-muted-foreground pb-2">
          {t("eventsCount", { count: filtered.length })}
        </span>
      </div>

      <div className="divide-y border rounded-md">
        {filtered.map((r) => (
          <div key={r.id}>
            <div className="p-2.5 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground tabular-nums w-20 shrink-0">
                {formatDate({ year: r.year, month: r.month }, locale)}
              </span>
              {r.importance === "MAJOR" && (
                <span className="w-2 h-2 rounded-full bg-emerald-500" title={tImp("MAJOR")} />
              )}
              <Badge variant="outline" className="text-[10px]">
                {tTypes(r.type as Parameters<typeof tTypes>[0])}
              </Badge>
              <span className="font-medium">{r.subjectName}</span>
              <span className="text-muted-foreground">{detail(r)}</span>
              <span className="ml-auto flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(editing === r.id ? null : r.id)}
                >
                  {t("edit")}
                </Button>
                <DeleteEventButton id={r.id} />
              </span>
            </div>
            {editing === r.id && (
              <EditRow
                row={r}
                companies={companies}
                solutions={solutions}
                onDone={() => {
                  setEditing(null);
                  router.refresh();
                }}
                onCancel={() => setEditing(null)}
              />
            )}
          </div>
        ))}
        {filtered.length === 0 && <p className="p-3 text-sm text-muted-foreground">—</p>}
      </div>
    </div>
  );

  function DeleteEventButton({ id }: { id: string }) {
    const [busy, setBusy] = useState(false);
    return (
      <Button
        size="sm"
        variant="destructive"
        disabled={busy}
        onClick={async () => {
          if (!window.confirm(t("deleteEventConfirm"))) return;
          setBusy(true);
          try {
            await api(`/api/events/${id}`, "DELETE");
            router.refresh();
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("delete")}
      </Button>
    );
  }

  // Inline edit form for one event.
  function EditRow({
    row,
    companies,
    solutions,
    onDone,
    onCancel,
  }: {
    row: AdminEventRow;
    companies: Opt[];
    solutions: Opt[];
    onDone: () => void;
    onCancel: () => void;
  }) {
    const [form, setForm] = useState({
      year: String(row.year),
      month: row.month == null ? "" : String(row.month),
      importance: row.importance || "MEDIUM",
      description: row.description ?? "",
      newName: row.newName ?? "",
      acquirerCompanyId: row.acquirerCompanyId ?? "",
      acquirerNameRaw: row.acquirerNameRaw ?? "",
      outcome: row.outcome ?? "",
      withCompanyId: row.withCompanyId ?? "",
      newOwnerCompanyId: row.newOwnerCompanyId ?? "",
      intoSolutionId: row.intoSolutionId ?? "",
      amount: row.amount == null ? "" : String(row.amount),
      round: row.round ?? "",
      note: row.note ?? "",
    });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

    async function save() {
      setBusy(true);
      setError(null);
      try {
        await api(`/api/events/${row.id}`, "PUT", {
          type: row.type,
          year: form.year,
          month: form.month === "" ? null : form.month,
          importance: form.importance,
          description: form.description,
          subjectCompanyId: row.subjectCompanyId,
          subjectSolutionId: row.subjectSolutionId,
          newName: form.newName,
          acquirerCompanyId: form.acquirerCompanyId || null,
          acquirerNameRaw: form.acquirerNameRaw,
          outcome: form.outcome || null,
          withCompanyId: form.withCompanyId || null,
          newOwnerCompanyId: form.newOwnerCompanyId || null,
          intoSolutionId: form.intoSolutionId || null,
          amount: form.amount === "" ? null : form.amount,
          round: form.round,
          note: form.note,
        });
        onDone();
      } catch (e) {
        if (e instanceof ApiError && e.codes?.length)
          setError(e.codes.map((c) => t(`issue.${c}` as Parameters<typeof t>[0])).join(" "));
        else setError(t("genericError"));
      } finally {
        setBusy(false);
      }
    }

    const companySelect = (value: string, onChange: (v: string) => void) => (
      <select
        className="border rounded-md bg-background text-foreground px-2 py-1.5 text-sm w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{tf("none")}</option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
    );

    return (
      <div className="p-3 bg-muted/30 border-t space-y-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            {tf("year")}
            <Input type="number" value={form.year} onChange={(e) => set("year", e.target.value)} />
          </label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            {tf("month")}
            <Input
              type="number"
              min={1}
              max={12}
              value={form.month}
              onChange={(e) => set("month", e.target.value)}
            />
          </label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            {tf("importance")}
            <select
              className="border rounded-md bg-background text-foreground px-2 py-1.5 text-sm"
              value={form.importance}
              onChange={(e) => set("importance", e.target.value)}
            >
              {EVENT_IMPORTANCES.map((imp) => (
                <option key={imp} value={imp}>
                  {tImp(imp)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Type-specific field(s) */}
        {(row.type === "COMPANY_RENAME" || row.type === "SOLUTION_RENAME") && (
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            {tf("newName")}
            <Input value={form.newName} onChange={(e) => set("newName", e.target.value)} />
          </label>
        )}
        {(row.type === "ACQUISITION" || row.type === "CO_INVESTMENT" || row.type === "ABSORPTION") && (
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs text-muted-foreground flex flex-col gap-1">
              {tf("acquirer")}
              {companySelect(form.acquirerCompanyId, (v) => set("acquirerCompanyId", v))}
            </label>
            {row.type !== "ABSORPTION" && (
              <label className="text-xs text-muted-foreground flex flex-col gap-1">
                {tf("acquirerNameRaw")}
                <Input
                  value={form.acquirerNameRaw}
                  onChange={(e) => set("acquirerNameRaw", e.target.value)}
                />
              </label>
            )}
            {row.type === "ACQUISITION" && (
              <label className="text-xs text-muted-foreground flex flex-col gap-1">
                {tf("outcome")}
                <select
                  className="border rounded-md bg-background text-foreground px-2 py-1.5 text-sm"
                  value={form.outcome}
                  onChange={(e) => set("outcome", e.target.value)}
                >
                  <option value="">{tf("none")}</option>
                  {OUTCOMES.map((o) => (
                    <option key={o} value={o}>
                      {tOutcomes(o as Parameters<typeof tOutcomes>[0])}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
        {row.type === "MERGER" && (
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            {tf("withCompany")}
            {companySelect(form.withCompanyId, (v) => set("withCompanyId", v))}
          </label>
        )}
        {row.type === "SOLUTION_TRANSFER" && (
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            {tf("newOwner")}
            {companySelect(form.newOwnerCompanyId, (v) => set("newOwnerCompanyId", v))}
          </label>
        )}
        {row.type === "SOLUTION_INTEGRATED" && (
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            {tf("intoSolution")}
            <select
              className="border rounded-md bg-background text-foreground px-2 py-1.5 text-sm w-full"
              value={form.intoSolutionId}
              onChange={(e) => set("intoSolutionId", e.target.value)}
            >
              <option value="">{tf("none")}</option>
              {solutions
                .filter((s) => s.id !== row.subjectSolutionId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
            </select>
          </label>
        )}
        {row.type === "FUNDING" && (
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-muted-foreground flex flex-col gap-1">
              {tf("amount")}
              <Input type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
            </label>
            <label className="text-xs text-muted-foreground flex flex-col gap-1">
              {tf("round")}
              <Input value={form.round} onChange={(e) => set("round", e.target.value)} />
            </label>
          </div>
        )}
        {row.type === "DIVESTMENT" && (
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            {tf("note")}
            <Input value={form.note} onChange={(e) => set("note", e.target.value)} />
          </label>
        )}

        <label className="text-xs text-muted-foreground flex flex-col gap-1">
          {tf("description")}
          <Textarea rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />
        </label>

        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? t("saving") : t("save")}
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel}>
            {t("cancel")}
          </Button>
        </div>
      </div>
    );
  }
}
