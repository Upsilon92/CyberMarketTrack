"use client";

// Compact event form used for PROPOSING a new event and for admin review of an
// event proposal. Produces a payload matching eventSchema. (The admin's own rich
// timeline editor stays on the entity history pages.)
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/components/admin/api";
import { maybeSubmitProposal } from "@/components/proposal-submit";
import { EVENT_TYPES, EVENT_IMPORTANCES, ACQUISITION_OUTCOMES } from "@/lib/constants";

export interface EntityOption {
  id: string;
  label: string;
}

const ACTOR_TYPES = ["ACQUISITION", "CO_INVESTMENT"];

export function EventForm({
  companies,
  solutions,
  proposalMode,
  approveProposalId,
  initial,
  onDone,
}: {
  companies: EntityOption[];
  solutions: EntityOption[];
  proposalMode?: boolean;
  approveProposalId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initial?: Record<string, any>;
  onDone?: () => void;
}) {
  const router = useRouter();
  const t = useTranslations("admin");
  const tf = useTranslations("admin.fields");
  const tTypes = useTranslations("eventTypes");
  const tOutcomes = useTranslations("outcomes");
  const tProp = useTranslations("proposals");

  const [f, setF] = useState({
    subjectKind: initial?.subjectSolutionId ? "solution" : "company",
    subjectCompanyId: initial?.subjectCompanyId ?? "",
    subjectSolutionId: initial?.subjectSolutionId ?? "",
    type: initial?.type ?? "ACQUISITION",
    year: initial?.year != null ? String(initial.year) : "",
    month: initial?.month != null ? String(initial.month) : "",
    importance: initial?.importance ?? "MEDIUM",
    newName: initial?.newName ?? "",
    acquirerCompanyId: initial?.acquirerCompanyId ?? "",
    outcome: initial?.outcome ?? "",
    withCompanyId: initial?.withCompanyId ?? "",
    newOwnerCompanyId: initial?.newOwnerCompanyId ?? "",
    intoSolutionId: initial?.intoSolutionId ?? "",
    amount: initial?.amount != null ? String(initial.amount) : "",
    round: initial?.round ?? "",
    note: initial?.note ?? "",
    description: initial?.description ?? "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposeNote, setProposeNote] = useState("");
  const [done, setDone] = useState(false);

  const isSolutionSubject = ["SOLUTION_RENAME", "SOLUTION_TRANSFER", "SOLUTION_LAUNCH", "SOLUTION_DISCONTINUED", "SOLUTION_INTEGRATED"].includes(f.type);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        type: f.type,
        year: f.year === "" ? null : Number(f.year),
        month: f.month === "" ? null : Number(f.month),
        importance: f.importance,
        description: f.description || null,
        subjectCompanyId: isSolutionSubject ? null : f.subjectCompanyId || null,
        subjectSolutionId: isSolutionSubject ? f.subjectSolutionId || null : null,
        newName: f.newName || null,
        acquirerCompanyId: f.acquirerCompanyId || null,
        acquirerNameRaw: null,
        outcome: f.outcome || null,
        withCompanyId: f.withCompanyId || null,
        newOwnerCompanyId: f.newOwnerCompanyId || null,
        intoSolutionId: f.intoSolutionId || null,
        amount: f.amount === "" ? null : Number(f.amount),
        round: f.round || null,
        note: f.note || null,
      };
      const handled = await maybeSubmitProposal(
        proposalMode || approveProposalId
          ? { proposalMode, approveProposalId, entityType: "Event", targetId: null, note: proposeNote }
          : undefined,
        payload
      );
      if (handled) {
        if (onDone) onDone();
        else setDone(true);
        return;
      }
      await api("/api/events", "POST", payload);
      router.push("/news");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError && err.codes ? err.codes.join(", ") : t("genericError"));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <p className="text-sm text-emerald-600 dark:text-emerald-400">{tProp("submitted")}</p>;
  }

  const companySelect = (value: string, on: (v: string) => void, label: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <select
        className="border rounded-md bg-background text-foreground px-2 py-2 text-sm w-full"
        value={value}
        onChange={(e) => on(e.target.value)}
      >
        <option value="">{tf("none")}</option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-2xl">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-1.5">
        <Label>{tf("eventType")} *</Label>
        <select
          className="border rounded-md bg-background text-foreground px-2 py-2 text-sm w-full"
          value={f.type}
          onChange={(e) => set("type", e.target.value)}
        >
          {EVENT_TYPES.map((v) => (
            <option key={v} value={v}>
              {tTypes(v)}
            </option>
          ))}
        </select>
      </div>

      {/* Subject: a solution for solution-events, otherwise a company */}
      {isSolutionSubject ? (
        <div className="space-y-1.5">
          <Label>{tf("initialCompany")} (solution) *</Label>
          <select
            className="border rounded-md bg-background text-foreground px-2 py-2 text-sm w-full"
            value={f.subjectSolutionId}
            onChange={(e) => set("subjectSolutionId", e.target.value)}
            required
          >
            <option value="">{tf("none")}</option>
            {solutions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        companySelect(f.subjectCompanyId, (v) => set("subjectCompanyId", v), tf("initialCompany"))
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label>{tf("year")} *</Label>
          <Input type="number" value={f.year} onChange={(e) => set("year", e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>{tf("month")}</Label>
          <Input type="number" min={1} max={12} value={f.month} onChange={(e) => set("month", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{tf("importance")}</Label>
          <select
            className="border rounded-md bg-background text-foreground px-2 py-2 text-sm w-full"
            value={f.importance}
            onChange={(e) => set("importance", e.target.value)}
          >
            {EVENT_IMPORTANCES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(f.type === "COMPANY_RENAME" || f.type === "SOLUTION_RENAME") && (
        <div className="space-y-1.5">
          <Label>{tf("newName")} *</Label>
          <Input value={f.newName} onChange={(e) => set("newName", e.target.value)} />
        </div>
      )}

      {ACTOR_TYPES.includes(f.type) && (
        <>
          {companySelect(f.acquirerCompanyId, (v) => set("acquirerCompanyId", v), tf("acquirer"))}
          {f.type === "ACQUISITION" && (
            <div className="space-y-1.5">
              <Label>{tf("outcome")} *</Label>
              <select
                className="border rounded-md bg-background text-foreground px-2 py-2 text-sm w-full"
                value={f.outcome}
                onChange={(e) => set("outcome", e.target.value)}
              >
                <option value="">{tf("none")}</option>
                {ACQUISITION_OUTCOMES.map((v) => (
                  <option key={v} value={v}>
                    {tOutcomes(v)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      {f.type === "MERGER" && companySelect(f.withCompanyId, (v) => set("withCompanyId", v), tf("withCompany"))}
      {f.type === "SOLUTION_TRANSFER" && companySelect(f.newOwnerCompanyId, (v) => set("newOwnerCompanyId", v), tf("newOwner"))}

      <div className="space-y-1.5">
        <Label>{tf("description")}</Label>
        <Textarea rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} />
      </div>

      {proposalMode && (
        <div className="space-y-1.5">
          <Label>{tProp("note")}</Label>
          <Textarea rows={2} value={proposeNote} onChange={(e) => setProposeNote(e.target.value)} />
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? t("saving") : proposalMode ? tProp("submit") : t("save")}
        </Button>
        <Button type="button" variant="outline" onClick={() => (onDone ? onDone() : router.back())}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
