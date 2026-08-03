"use client";

// Field-level diff review (item 4): shows current vs proposed per field and lets
// the admin choose keep-current / take-proposed, and include/exclude each new
// sub-entity of a bundle. Approving applies exactly the chosen values.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/components/admin/api";
import type { ProposalDiff, FieldDiff, SubEntityDiff } from "@/lib/proposal-diff";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fmtVal(v: any): string {
  if (v === null || v === undefined || v === "") return "∅";
  if (Array.isArray(v)) return v.join(", ");
  const s = String(v);
  return s.length > 160 ? s.slice(0, 160) + "…" : s;
}
// Default: take proposed only when the current value is empty (safe fill); a
// conflicting non-empty current value defaults to KEEP (admin decides).
const empty = (v: unknown) => v === null || v === undefined || v === "";
const defaultTake = (f: FieldDiff) => !f.same && empty(f.current) && !empty(f.proposed);

export function ProposalDiffReview({
  proposalId,
  diff,
  onDone,
}: {
  proposalId: string;
  diff: ProposalDiff;
  onDone: () => void;
}) {
  const t = useTranslations("proposals");
  const tAdmin = useTranslations("admin");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changed = (fields: FieldDiff[] | undefined) => (fields ?? []).filter((f) => !f.same);

  // ---- state --------------------------------------------------------------
  const [entityTake, setEntityTake] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(changed(diff.fields).map((f) => [f.key, diff.kind === "entity" && defaultTake(f)]))
  );
  const [companyTake, setCompanyTake] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(changed(diff.fields).map((f) => [f.key, diff.kind === "bundle" && defaultTake(f)]))
  );
  const initSub = (subs: SubEntityDiff[] | undefined) =>
    (subs ?? []).map((s) => ({
      include: true,
      take: Object.fromEntries(changed(s.fields).map((f) => [f.key, defaultTake(f)])) as Record<string, boolean>,
    }));
  const [eventState, setEventState] = useState(() => initSub(diff.events));
  const [solutionState, setSolutionState] = useState(() => initSub(diff.solutions));

  const companyFields = useMemo(() => changed(diff.fields), [diff]);

  function buildResolution() {
    if (diff.kind === "entity") {
      return { takeFields: Object.keys(entityTake).filter((k) => entityTake[k]) };
    }
    return {
      companyTakeFields: Object.keys(companyTake).filter((k) => companyTake[k]),
      events: (diff.events ?? []).map((s, i) => ({
        index: i,
        include: eventState[i]?.include ?? false,
        takeFields: s.existingId ? Object.keys(eventState[i]?.take ?? {}).filter((k) => eventState[i].take[k]) : undefined,
      })),
      solutions: (diff.solutions ?? []).map((s, i) => ({
        index: i,
        include: solutionState[i]?.include ?? false,
        takeFields: s.existingId ? Object.keys(solutionState[i]?.take ?? {}).filter((k) => solutionState[i].take[k]) : undefined,
      })),
    };
  }

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/proposals/${proposalId}/resolve`, "POST", buildResolution());
      onDone();
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : tAdmin("genericError"));
    } finally {
      setBusy(false);
    }
  }

  // ---- render helpers -----------------------------------------------------
  const fieldRows = (fields: FieldDiff[], take: Record<string, boolean>, setTake: (k: string, v: boolean) => void) => (
    <div className="space-y-1">
      {fields.map((f) => (
        <div key={f.key} className="grid grid-cols-[8rem_1fr_1fr_auto] items-start gap-2 text-xs py-1 border-b border-border/50">
          <span className="font-medium">{f.key}</span>
          <span className={`min-w-0 break-words ${take[f.key] ? "text-muted-foreground line-through" : ""}`}>
            {fmtVal(f.current)}
          </span>
          <span className={`min-w-0 break-words ${take[f.key] ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}>
            {fmtVal(f.proposed)}
          </span>
          <label className="flex items-center gap-1 whitespace-nowrap">
            <input type="checkbox" checked={!!take[f.key]} onChange={(e) => setTake(f.key, e.target.checked)} />
            <span className="text-[10px] text-muted-foreground">{t("diffTake")}</span>
          </label>
        </div>
      ))}
    </div>
  );

  return (
    <div className="border-t pt-3 mt-1 space-y-4">
      <div className="grid grid-cols-[8rem_1fr_1fr_auto] gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>{t("diffField")}</span>
        <span>{t("diffCurrent")}</span>
        <span>{t("diffProposed")}</span>
        <span />
      </div>

      {/* Company / single entity fields */}
      {companyFields.length > 0 && (
        <div className="space-y-1">
          {diff.kind === "bundle" && <p className="text-xs font-semibold">{t("diffCompanyFields")}</p>}
          {fieldRows(
            companyFields,
            diff.kind === "entity" ? entityTake : companyTake,
            (k, v) => (diff.kind === "entity" ? setEntityTake((s) => ({ ...s, [k]: v })) : setCompanyTake((s) => ({ ...s, [k]: v })))
          )}
        </div>
      )}

      {/* Bundle events */}
      {diff.kind === "bundle" && (diff.events ?? []).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold">{t("diffEvents")}</p>
          {(diff.events ?? []).map((s, i) => (
            <div key={i} className="rounded-md border p-2 space-y-1.5">
              <label className="flex items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={eventState[i]?.include ?? false}
                  onChange={(e) => setEventState((st) => st.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))}
                />
                {s.title}
                <Badge variant="outline" className="text-[9px]">
                  {s.isNew ? t("diffNew") : t("diffMatch")}
                </Badge>
              </label>
              {!s.isNew && eventState[i]?.include && changed(s.fields).length > 0 &&
                fieldRows(changed(s.fields), eventState[i].take, (k, v) =>
                  setEventState((st) => st.map((x, j) => (j === i ? { ...x, take: { ...x.take, [k]: v } } : x)))
                )}
            </div>
          ))}
        </div>
      )}

      {/* Bundle solutions */}
      {diff.kind === "bundle" && (diff.solutions ?? []).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold">{t("diffSolutions")}</p>
          {(diff.solutions ?? []).map((s, i) => (
            <div key={i} className="rounded-md border p-2 space-y-1.5">
              <label className="flex items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={solutionState[i]?.include ?? false}
                  onChange={(e) => setSolutionState((st) => st.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))}
                />
                {s.title}
                <Badge variant="outline" className="text-[9px]">
                  {s.isNew ? t("diffNew") : t("diffMatch")}
                </Badge>
              </label>
              {!s.isNew && solutionState[i]?.include && changed(s.fields).length > 0 &&
                fieldRows(changed(s.fields), solutionState[i].take, (k, v) =>
                  setSolutionState((st) => st.map((x, j) => (j === i ? { ...x, take: { ...x.take, [k]: v } } : x)))
                )}
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={approve}>
          {t("diffApprove")}
        </Button>
        <Button size="sm" variant="outline" onClick={onDone}>
          {tAdmin("cancel")}
        </Button>
      </div>
    </div>
  );
}
