"use client";

// Admin review queue: each PENDING proposal shows its origin, a payload preview,
// and Reject / Approve / "Modify then approve" (expands the matching form in
// review mode, which approves with the edited values).
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/components/admin/api";
import { CompanyForm } from "@/components/admin/company-form";
import { SolutionForm, type TagOption } from "@/components/admin/solution-form";
import { TagForm } from "@/components/admin/tag-form";
import { EventForm, type EntityOption } from "@/components/admin/event-form";

export interface ReviewProposal {
  id: string;
  kind: string;
  entityType: string;
  targetId: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
  note: string | null;
  origin: string;
  sourceIp: string | null;
  createdAt: string;
}

export function ProposalsReview({
  proposals,
  companies,
  solutions,
  tags,
  emptyLabel,
}: {
  proposals: ReviewProposal[];
  companies: EntityOption[];
  solutions: EntityOption[];
  tags: TagOption[];
  emptyLabel: string;
}) {
  const t = useTranslations("proposals");
  const tAdmin = useTranslations("admin");
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [enriching, setEnriching] = useState<string | null>(null);
  const [jsonEditing, setJsonEditing] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  // #4 — resolve entity IDs to human names for a readable preview.
  const companyLabel = useMemo(() => new Map(companies.map((c) => [c.id, c.label])), [companies]);
  const solutionLabel = useMemo(() => new Map(solutions.map((s) => [s.id, s.label])), [solutions]);

  // Rename *Id keys and swap their value for the entity name, so an event
  // proposal shows "acquirer: Bank of America" instead of a raw cuid.
  const COMPANY_KEYS: Record<string, string> = {
    subjectCompanyId: "subject",
    acquirerCompanyId: "acquirer",
    withCompanyId: "mergedWith",
    newOwnerCompanyId: "newOwner",
    parentCompanyId: "parent",
  };
  const SOLUTION_KEYS: Record<string, string> = {
    subjectSolutionId: "subjectSolution",
    intoSolutionId: "intoSolution",
  };

  function displayPayload(p: ReviewProposal): Record<string, unknown> {
    const src = p.payload as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) {
      if (v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
      if (typeof v === "string" && COMPANY_KEYS[k]) out[COMPANY_KEYS[k]] = companyLabel.get(v) ?? v;
      else if (typeof v === "string" && SOLUTION_KEYS[k]) out[SOLUTION_KEYS[k]] = solutionLabel.get(v) ?? v;
      else out[k] = v;
    }
    return out;
  }

  const canEnrich = (p: ReviewProposal) =>
    p.entityType === "Company" || p.entityType === "Bundle" || p.entityType === "Event";

  async function decide(p: ReviewProposal, action: "approve" | "reject") {
    if (action === "reject" && !window.confirm(t("confirmReject"))) return;
    setBusy(p.id);
    try {
      await api(`/api/proposals/${p.id}`, "PUT", { action });
      router.refresh();
    } catch {
      window.alert(tAdmin("genericError"));
    } finally {
      setBusy(null);
    }
  }

  async function enrich(p: ReviewProposal) {
    setEnriching(p.id);
    try {
      await api(`/api/proposals/${p.id}/enrich`, "POST", {});
      router.refresh();
    } catch (e) {
      const detail = e instanceof ApiError && e.detail ? ` (${e.detail})` : "";
      window.alert(t("enrichFailed") + detail);
    } finally {
      setEnriching(null);
    }
  }

  // Raw-JSON editing — works for EVERY proposal type, and is the way to edit a
  // Bundle (which has no single entity form).
  function openJson(p: ReviewProposal) {
    setEditing(null);
    setJsonError(null);
    setJsonText(JSON.stringify(p.payload, null, 2));
    setJsonEditing(p.id);
  }

  async function saveJson(p: ReviewProposal, andApprove: boolean) {
    let payload: unknown;
    try {
      payload = JSON.parse(jsonText);
    } catch {
      setJsonError(t("jsonInvalid"));
      return;
    }
    if (andApprove && !window.confirm(t("confirmApprove"))) return;
    setBusy(p.id);
    setJsonError(null);
    try {
      await api(`/api/proposals/${p.id}`, "PUT", { action: andApprove ? "approve" : "update", payload });
      setJsonEditing(null);
      router.refresh();
    } catch (e) {
      // Schema validation errors come back as { fields }; show them raw.
      const fields = e instanceof ApiError && e.fields ? Object.entries(e.fields) : null;
      setJsonError(
        fields && fields.length
          ? fields.map(([k, v]) => `${k}: ${v}`).join(" · ")
          : e instanceof ApiError
            ? e.message
            : tAdmin("genericError")
      );
    } finally {
      setBusy(null);
    }
  }

  function editForm(p: ReviewProposal) {
    const common = {
      approveProposalId: p.id,
      onDone: () => {
        setEditing(null);
        router.refresh();
      },
    } as const;
    if (p.entityType === "Company") {
      const d = p.payload;
      return (
        <CompanyForm
          {...common}
          companyId={p.targetId ?? undefined}
          initial={{
            initialName: d.initialName ?? "",
            types: d.types ?? [],
            foundedYear: d.foundedYear != null ? String(d.foundedYear) : "",
            foundedMonth: d.foundedMonth != null ? String(d.foundedMonth) : "",
            country: d.country ?? "",
            originCountry: d.originCountry ?? "",
            descriptionFr: d.descriptionFr ?? "",
            descriptionEn: d.descriptionEn ?? "",
            website: d.website ?? "",
            logoUrl: d.logoUrl ?? "",
          }}
        />
      );
    }
    if (p.entityType === "Solution") {
      const d = p.payload;
      return (
        <SolutionForm
          {...common}
          solutionId={p.targetId ?? undefined}
          companies={companies}
          tags={tags}
          initial={{
            initialName: d.initialName ?? "",
            initialCompanyId: d.initialCompanyId ?? "",
            descriptionFr: d.descriptionFr ?? "",
            descriptionEn: d.descriptionEn ?? "",
            features: d.features ?? "",
            launchYear: d.launchYear != null ? String(d.launchYear) : "",
            launchMonth: d.launchMonth != null ? String(d.launchMonth) : "",
            website: d.website ?? "",
            tagIds: d.tagIds ?? [],
          }}
        />
      );
    }
    if (p.entityType === "Tag") {
      const d = p.payload;
      return (
        <TagForm
          {...common}
          tagId={p.targetId ?? undefined}
          initial={{
            slug: d.slug ?? "",
            family: d.family ?? "SOLUTION_TYPE",
            labelFr: d.labelFr ?? "",
            labelEn: d.labelEn ?? "",
            descriptionFr: d.descriptionFr ?? "",
            descriptionEn: d.descriptionEn ?? "",
            category: d.category ?? "",
          }}
        />
      );
    }
    return <EventForm {...common} companies={companies} solutions={solutions} initial={p.payload} />;
  }

  if (proposals.length === 0) return <p className="text-muted-foreground">{emptyLabel}</p>;

  return (
    <div className="space-y-3">
      {proposals.map((p) => (
        <div key={p.id} className="border rounded-md p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={p.origin === "AUTO" ? "secondary" : "default"} className="text-[10px]">
              {p.origin === "AUTO" ? t("originAuto") : t("originUser")}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {p.entityType} · {p.kind}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(p.createdAt).toLocaleString()}
              {p.sourceIp ? ` · ${p.sourceIp}` : ""}
            </span>
          </div>

          {p.note && <p className="text-xs italic text-muted-foreground">“{p.note}”</p>}

          <pre className="text-xs bg-muted/40 rounded p-2 overflow-x-auto max-h-40">
            {JSON.stringify(displayPayload(p), null, 2)}
          </pre>

          {editing === p.id ? (
            <div className="border-t pt-3 mt-1">{editForm(p)}</div>
          ) : jsonEditing === p.id ? (
            <div className="border-t pt-3 mt-1 space-y-2">
              <Textarea
                className="font-mono text-xs min-h-[16rem]"
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                spellCheck={false}
              />
              {jsonError && <p className="text-xs text-destructive">{jsonError}</p>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy === p.id} onClick={() => saveJson(p, false)}>
                  {t("jsonSave")}
                </Button>
                <Button size="sm" variant="secondary" disabled={busy === p.id} onClick={() => saveJson(p, true)}>
                  {t("jsonSaveApprove")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setJsonEditing(null)}>
                  {tAdmin("cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy === p.id || enriching === p.id} onClick={() => decide(p, "approve")}>
                {t("approve")}
              </Button>
              {/* Entity form editor for the typed proposals */}
              {p.entityType !== "Bundle" && (
                <Button size="sm" variant="outline" onClick={() => setEditing(p.id)}>
                  {t("modifyApprove")}
                </Button>
              )}
              {/* Raw-JSON editor — available for EVERY proposal (only way for a Bundle) */}
              <Button size="sm" variant="outline" onClick={() => openJson(p)}>
                {t("editJson")}
              </Button>
              {/* #1 — enrich a (thin) proposal into a complete LLM bundle */}
              {canEnrich(p) && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy === p.id || enriching === p.id}
                  onClick={() => enrich(p)}
                >
                  {enriching === p.id ? t("enriching") : t("enrich")}
                </Button>
              )}
              <Button
                size="sm"
                variant="destructive"
                disabled={busy === p.id || enriching === p.id}
                onClick={() => decide(p, "reject")}
              >
                {t("reject")}
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
