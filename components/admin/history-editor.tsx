"use client";

// =============================================================================
// History editor — the dedicated event screen of each company/solution.
//
// - lists events chronologically, add/edit/delete in place
// - every input change triggers a debounced call to /api/events/preview,
//   which returns the RECALCULATED periods ("here is how the history will be
//   recalculated") plus blocking errors / non-blocking warnings
// - saving an ACQUISITION with outcome ABSORBED proposes creating the
//   SOLUTION_TRANSFER events for the target's current solutions (spec).
//
// Works for both entity kinds; the API and preview do the heavy lifting.
// =============================================================================
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { api, ApiError } from "@/components/admin/api";
import { formatDate, formatRange, type Locale } from "@/lib/date";

// --- Serializable props -------------------------------------------------------

export interface EditorEvent {
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
}

interface PreviewPeriod {
  start: { year: number; month?: number | null } | null;
  end: { year: number; month?: number | null } | null;
  name?: string;
  ownerCompanyId?: string | null;
  ownerNameRaw?: string | null;
  status?: string;
}

interface PreviewResponse {
  errors: string[];
  warnings: string[];
  companyTimeline: {
    namePeriods: PreviewPeriod[];
    ownershipPeriods: PreviewPeriod[];
    statusPeriods: PreviewPeriod[];
  } | null;
  solutionTimeline: {
    namePeriods: PreviewPeriod[];
    ownershipPeriods: PreviewPeriod[];
  } | null;
}

const COMPANY_EVENT_CHOICES = [
  "COMPANY_RENAME",
  "ACQUISITION",
  "CO_INVESTMENT",
  "ABSORPTION",
  "DIVESTMENT",
  "MERGER",
  "SHUTDOWN",
  "FUNDING",
  "OTHER",
];
const IMPORTANCES = ["MAJOR", "MEDIUM", "MINOR"];
const SOLUTION_EVENT_CHOICES = [
  "SOLUTION_RENAME",
  "SOLUTION_TRANSFER",
  "SOLUTION_LAUNCH",
  "SOLUTION_DISCONTINUED",
  "SOLUTION_INTEGRATED",
  "OTHER",
];
const OUTCOMES = ["INVESTOR_OWNED", "AUTONOMOUS", "ABSORBED", "UNKNOWN"];

interface FormState {
  type: string;
  year: string;
  month: string;
  importance: string;
  description: string;
  newName: string;
  acquirerCompanyId: string;
  acquirerNameRaw: string;
  outcome: string;
  withCompanyId: string;
  newOwnerCompanyId: string;
  intoSolutionId: string;
  amount: string;
  round: string;
  note: string;
}

const EMPTY_FORM: FormState = {
  type: "",
  year: "",
  month: "",
  importance: "MEDIUM",
  description: "",
  newName: "",
  acquirerCompanyId: "",
  acquirerNameRaw: "",
  outcome: "",
  withCompanyId: "",
  newOwnerCompanyId: "",
  intoSolutionId: "",
  amount: "",
  round: "",
  note: "",
};

export function HistoryEditor({
  kind,
  entityId,
  entityName,
  events,
  companies,
  fundIds,
  ownedSolutions,
  otherSolutions = [],
}: {
  kind: "company" | "solution";
  entityId: string;
  entityName: string;
  events: EditorEvent[];
  /** All companies (id + derived current name) for the actor selects */
  companies: { id: string; label: string }[];
  /** Ids of companies of type INVESTMENT_FUND (to default outcome) */
  fundIds: string[];
  /** For companies: solutions currently owned (ABSORBED proposal) */
  ownedSolutions: { id: string; label: string }[];
  /** For solutions: other solutions (host targets for SOLUTION_INTEGRATED) */
  otherSolutions?: { id: string; label: string }[];
}) {
  const router = useRouter();
  const locale = useLocale() as Locale;
  const t = useTranslations("admin");
  const tTypes = useTranslations("eventTypes");
  const tOutcomes = useTranslations("outcomes");
  const tStatuses = useTranslations("statuses");
  const tImportances = useTranslations("importances");

  const [editing, setEditing] = useState<string | null>(null); // event id or "new"
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedWarnings, setSavedWarnings] = useState<string[]>([]);
  // ABSORBED proposal state (after saving the acquisition)
  const [proposal, setProposal] = useState<{
    acquirerId: string;
    year: string;
    month: string;
    checked: Record<string, boolean>;
  } | null>(null);

  const companyLabel = useCallback(
    (id: string | null | undefined) =>
      companies.find((c) => c.id === id)?.label ?? id ?? "?",
    [companies]
  );

  const choices = kind === "company" ? COMPANY_EVENT_CHOICES : SOLUTION_EVENT_CHOICES;

  const set = (k: keyof FormState, v: string) => setForm((p) => ({ ...p, [k]: v }));

  // Build the API payload from the form
  const buildPayload = useCallback(() => {
    return {
      type: form.type,
      year: form.year,
      month: form.month === "" ? null : form.month,
      importance: form.importance || "MEDIUM",
      description: form.description,
      subjectCompanyId: kind === "company" ? entityId : null,
      subjectSolutionId: kind === "solution" ? entityId : null,
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
    };
  }, [form, kind, entityId]);

  // ---- Debounced live preview ------------------------------------------------
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!editing || !form.type || !/^\d{4}$/.test(form.year)) {
      setPreview(null);
      return;
    }
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      try {
        const res = await api<PreviewResponse>("/api/events/preview", "POST", {
          event: buildPayload(),
          excludeEventId: editing !== "new" ? editing : undefined,
        });
        setPreview(res);
      } catch {
        setPreview(null); // incomplete form: no preview yet
      }
    }, 400);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [form, editing, buildPayload]);

  // Default outcome to INVESTOR_OWNED when the acquirer is a fund (spec)
  useEffect(() => {
    if (form.type === "ACQUISITION" && form.acquirerCompanyId && !form.outcome) {
      if (fundIds.includes(form.acquirerCompanyId)) set("outcome", "INVESTOR_OWNED");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.acquirerCompanyId, form.type]);

  function startEdit(e?: EditorEvent) {
    setSavedWarnings([]);
    setError(null);
    setProposal(null);
    if (!e) {
      setEditing("new");
      setForm(EMPTY_FORM);
      return;
    }
    setEditing(e.id);
    setForm({
      type: e.type,
      year: String(e.year),
      month: e.month == null ? "" : String(e.month),
      importance: e.importance || "MEDIUM",
      description: e.description ?? "",
      newName: e.newName ?? "",
      acquirerCompanyId: e.acquirerCompanyId ?? "",
      acquirerNameRaw: e.acquirerNameRaw ?? "",
      outcome: e.outcome ?? "",
      withCompanyId: e.withCompanyId ?? "",
      newOwnerCompanyId: e.newOwnerCompanyId ?? "",
      intoSolutionId: e.intoSolutionId ?? "",
      amount: e.amount == null ? "" : String(e.amount),
      round: e.round ?? "",
      note: e.note ?? "",
    });
  }

  async function onSave() {
    setBusy(true);
    setError(null);
    try {
      const payload = buildPayload();
      const res =
        editing === "new"
          ? await api<{ warnings: string[] }>("/api/events", "POST", payload)
          : await api<{ warnings: string[] }>(`/api/events/${editing}`, "PUT", payload);
      setSavedWarnings(res.warnings ?? []);

      // ABSORBED acquisition: propose the solution transfers (spec automatism)
      if (
        kind === "company" &&
        form.type === "ACQUISITION" &&
        form.outcome === "ABSORBED" &&
        form.acquirerCompanyId &&
        ownedSolutions.length > 0
      ) {
        setProposal({
          acquirerId: form.acquirerCompanyId,
          year: form.year,
          month: form.month,
          checked: Object.fromEntries(ownedSolutions.map((s) => [s.id, true])),
        });
      }

      setEditing(null);
      setForm(EMPTY_FORM);
      setPreview(null);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.codes?.length) {
        setError(err.codes.map((c) => t(`issue.${c}` as Parameters<typeof t>[0])).join(" "));
      } else {
        setError(t("genericError"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmProposal() {
    if (!proposal) return;
    setBusy(true);
    try {
      for (const s of ownedSolutions) {
        if (!proposal.checked[s.id]) continue;
        await api("/api/events", "POST", {
          type: "SOLUTION_TRANSFER",
          year: proposal.year,
          month: proposal.month === "" ? null : proposal.month,
          subjectSolutionId: s.id,
          newOwnerCompanyId: proposal.acquirerId,
          description: null,
        });
      }
      setProposal(null);
      router.refresh();
    } catch {
      setError(t("genericError"));
    } finally {
      setBusy(false);
    }
  }

  // ---- Rendering helpers ------------------------------------------------------

  function eventDetails(e: EditorEvent): string {
    switch (e.type) {
      case "COMPANY_RENAME":
      case "SOLUTION_RENAME":
        return `→ ${e.newName}`;
      case "ACQUISITION":
        return `→ ${e.acquirerCompanyId ? companyLabel(e.acquirerCompanyId) : e.acquirerNameRaw} (${e.outcome})`;
      case "CO_INVESTMENT":
        return `+ ${e.acquirerCompanyId ? companyLabel(e.acquirerCompanyId) : e.acquirerNameRaw}`;
      case "ABSORPTION":
        return e.acquirerCompanyId ? `→ ${companyLabel(e.acquirerCompanyId)}` : "";
      case "MERGER":
        return `→ ${companyLabel(e.withCompanyId)}`;
      case "SOLUTION_TRANSFER":
        return `→ ${companyLabel(e.newOwnerCompanyId)}`;
      case "SOLUTION_INTEGRATED":
        return `→ ${otherSolutions.find((s) => s.id === e.intoSolutionId)?.label ?? "?"}`;
      case "FUNDING":
        return `${e.amount ?? "?"} M ${e.round ?? ""}`;
      case "DIVESTMENT":
        return e.note ?? "";
      default:
        return "";
    }
  }

  const sorted = [...events].sort((a, b) => a.year - b.year || (a.month ?? 0) - (b.month ?? 0));

  const previewRows: { title: string; periods: PreviewPeriod[]; labelOf: (p: PreviewPeriod) => string }[] =
    [];
  if (preview?.companyTimeline) {
    previewRows.push(
      { title: t("previewNames"), periods: preview.companyTimeline.namePeriods, labelOf: (p) => p.name ?? "?" },
      {
        title: t("previewOwners"),
        periods: preview.companyTimeline.ownershipPeriods,
        labelOf: (p) => (p.ownerCompanyId ? companyLabel(p.ownerCompanyId) : (p.ownerNameRaw ?? "?")),
      },
      {
        title: t("previewStatuses"),
        periods: preview.companyTimeline.statusPeriods,
        labelOf: (p) => tStatuses(p.status as Parameters<typeof tStatuses>[0]),
      }
    );
  }
  if (preview?.solutionTimeline) {
    previewRows.push(
      { title: t("previewNames"), periods: preview.solutionTimeline.namePeriods, labelOf: (p) => p.name ?? "?" },
      {
        title: t("previewVendors"),
        periods: preview.solutionTimeline.ownershipPeriods,
        labelOf: (p) => companyLabel(p.ownerCompanyId),
      }
    );
  }

  return (
    <div className="space-y-4">
      {/* ABSORBED proposal dialog (inline card, keeps things simple) */}
      {proposal && (
        <Card className="border-amber-500">
          <CardHeader>
            <CardTitle className="text-base">{t("absorbedProposal")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">{t("absorbedProposalHint")}</p>
            {ownedSolutions.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={proposal.checked[s.id] ?? false}
                  onCheckedChange={(checked) =>
                    setProposal((p) =>
                      p ? { ...p, checked: { ...p.checked, [s.id]: checked === true } } : p
                    )
                  }
                />
                {s.label}
              </label>
            ))}
            <div className="flex gap-2">
              <Button size="sm" onClick={confirmProposal} disabled={busy}>
                {t("save")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setProposal(null)}>
                {t("cancel")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {savedWarnings.length > 0 && (
        <div className="text-sm text-amber-600 dark:text-amber-400">
          {t("coherenceWarnings")} :{" "}
          {savedWarnings.map((c) => t(`issue.${c}` as Parameters<typeof t>[0])).join(" ")}
        </div>
      )}

      {/* Event list */}
      <div className="divide-y border rounded-md">
        {sorted.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">—</p>
        )}
        {sorted.map((e) => (
          <div key={e.id} className="p-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="tabular-nums text-muted-foreground w-24 shrink-0">
              {formatDate({ year: e.year, month: e.month }, locale)}
            </span>
            <Badge variant="outline" className="text-[10px]">
              {tTypes(e.type as Parameters<typeof tTypes>[0])}
            </Badge>
            <span>{eventDetails(e)}</span>
            <span className="ml-auto flex gap-1.5">
              <Button size="sm" variant="outline" onClick={() => startEdit(e)}>
                {t("edit")}
              </Button>
              <DeleteEventButton eventId={e.id} />
            </span>
          </div>
        ))}
      </div>

      {editing === null ? (
        <Button onClick={() => startEdit()}>{t("addEvent")}</Button>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {editing === "new" ? t("addEvent") : t("editEvent")} — {entityName}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>{t("fields.eventType")} *</Label>
                <select
                  className="border rounded-md bg-background text-foreground px-2 py-2 text-sm w-full"
                  value={form.type}
                  onChange={(e) => set("type", e.target.value)}
                >
                  <option value="">{t("fields.none")}</option>
                  {choices.map((c) => (
                    <option key={c} value={c}>
                      {tTypes(c as Parameters<typeof tTypes>[0])}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("fields.year")} *</Label>
                <Input type="number" value={form.year} onChange={(e) => set("year", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("fields.month")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={form.month}
                  onChange={(e) => set("month", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("fields.importance")}</Label>
                <select
                  className="border rounded-md bg-background text-foreground px-2 py-2 text-sm w-full"
                  value={form.importance}
                  onChange={(e) => set("importance", e.target.value)}
                >
                  {IMPORTANCES.map((imp) => (
                    <option key={imp} value={imp}>
                      {tImportances(imp as Parameters<typeof tImportances>[0])}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Type-specific fields */}
            {(form.type === "COMPANY_RENAME" || form.type === "SOLUTION_RENAME") && (
              <div className="space-y-1.5">
                <Label>{t("fields.newName")} *</Label>
                <Input value={form.newName} onChange={(e) => set("newName", e.target.value)} />
              </div>
            )}

            {form.type === "ACQUISITION" && (
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{t("fields.acquirer")}</Label>
                  <select
                    className="border rounded-md bg-background text-foreground px-2 py-2 text-sm w-full"
                    value={form.acquirerCompanyId}
                    onChange={(e) => set("acquirerCompanyId", e.target.value)}
                  >
                    <option value="">{t("fields.none")}</option>
                    {companies
                      .filter((c) => c.id !== entityId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("fields.acquirerNameRaw")}</Label>
                  <Input
                    value={form.acquirerNameRaw}
                    onChange={(e) => set("acquirerNameRaw", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>{t("fields.outcome")} *</Label>
                  <select
                    className="border rounded-md bg-background text-foreground px-2 py-2 text-sm w-full"
                    value={form.outcome}
                    onChange={(e) => set("outcome", e.target.value)}
                  >
                    <option value="">{t("fields.none")}</option>
                    {OUTCOMES.map((o) => (
                      <option key={o} value={o}>
                        {tOutcomes(o as Parameters<typeof tOutcomes>[0])}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {form.type === "CO_INVESTMENT" && (
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{t("fields.coInvestor")}</Label>
                  <select
                    className="border rounded-md bg-background text-foreground px-2 py-2 text-sm w-full"
                    value={form.acquirerCompanyId}
                    onChange={(e) => set("acquirerCompanyId", e.target.value)}
                  >
                    <option value="">{t("fields.none")}</option>
                    {companies
                      .filter((c) => c.id !== entityId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("fields.acquirerNameRaw")}</Label>
                  <Input
                    value={form.acquirerNameRaw}
                    onChange={(e) => set("acquirerNameRaw", e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* ABSORPTION has no "absorbed by" picker: a subsidiary is absorbed
                in place by its current owner (implicit), which also distinguishes
                it from an ACQUISITION with an "absorbed" outcome. */}

            {form.type === "MERGER" && (
              <div className="space-y-1.5">
                <Label>{t("fields.withCompany")} *</Label>
                <select
                  className="border rounded-md bg-background text-foreground px-2 py-2 text-sm w-full"
                  value={form.withCompanyId}
                  onChange={(e) => set("withCompanyId", e.target.value)}
                >
                  <option value="">{t("fields.none")}</option>
                  {companies
                    .filter((c) => c.id !== entityId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {form.type === "SOLUTION_TRANSFER" && (
              <div className="space-y-1.5">
                <Label>{t("fields.newOwner")} *</Label>
                <select
                  className="border rounded-md bg-background text-foreground px-2 py-2 text-sm w-full"
                  value={form.newOwnerCompanyId}
                  onChange={(e) => set("newOwnerCompanyId", e.target.value)}
                >
                  <option value="">{t("fields.none")}</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {form.type === "SOLUTION_INTEGRATED" && (
              <div className="space-y-1.5">
                <Label>{t("fields.intoSolution")} *</Label>
                <select
                  className="border rounded-md bg-background text-foreground px-2 py-2 text-sm w-full"
                  value={form.intoSolutionId}
                  onChange={(e) => set("intoSolutionId", e.target.value)}
                >
                  <option value="">{t("fields.none")}</option>
                  {otherSolutions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {form.type === "FUNDING" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{t("fields.amount")}</Label>
                  <Input type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("fields.round")}</Label>
                  <Input value={form.round} onChange={(e) => set("round", e.target.value)} />
                </div>
              </div>
            )}

            {form.type === "DIVESTMENT" && (
              <div className="space-y-1.5">
                <Label>{t("fields.note")}</Label>
                <Input value={form.note} onChange={(e) => set("note", e.target.value)} />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>{t("fields.description")}</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>

            {/* Live preview of the recalculated history */}
            {preview && (
              <div className="border rounded-md p-3 space-y-2 bg-muted/30">
                <p className="text-sm font-medium">{t("livePreview")}</p>
                {preview.errors.length > 0 && (
                  <p className="text-sm text-destructive">
                    {t("coherenceErrors")} :{" "}
                    {preview.errors
                      .map((c) => t(`issue.${c}` as Parameters<typeof t>[0]))
                      .join(" ")}
                  </p>
                )}
                {preview.warnings.length > 0 && (
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    {t("coherenceWarnings")} :{" "}
                    {preview.warnings
                      .map((c) => t(`issue.${c}` as Parameters<typeof t>[0]))
                      .join(" ")}
                  </p>
                )}
                {previewRows.map((row) => (
                  <div key={row.title} className="text-sm flex flex-wrap gap-x-2 gap-y-1">
                    <span className="text-muted-foreground w-28 shrink-0">{row.title}</span>
                    <span className="flex flex-wrap gap-1.5">
                      {row.periods.map((p, i) => (
                        <Badge key={i} variant="secondary" className="font-normal">
                          {row.labelOf(p)} : {formatRange(p.start, p.end, locale)}
                        </Badge>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={onSave}
                disabled={busy || !form.type || !form.year || (preview?.errors.length ?? 0) > 0}
              >
                {busy ? t("saving") : t("save")}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setPreview(null);
                  setError(null);
                }}
              >
                {t("cancel")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DeleteEventButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const t = useTranslations("admin");
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
          await api(`/api/events/${eventId}`, "DELETE");
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
