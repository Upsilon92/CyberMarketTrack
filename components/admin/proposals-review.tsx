"use client";

// Admin review queue: each PENDING proposal shows its origin, a payload preview,
// and Reject / Approve / "Modify then approve" (expands the matching form in
// review mode, which approves with the edited values).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/components/admin/api";
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
            description: d.description ?? "",
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
            description: d.description ?? "",
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
            {JSON.stringify(
              Object.fromEntries(Object.entries(p.payload).filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && v.length === 0))),
              null,
              2
            )}
          </pre>

          {editing === p.id ? (
            <div className="border-t pt-3 mt-1">{editForm(p)}</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy === p.id} onClick={() => decide(p, "approve")}>
                {t("approve")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(p.id)}>
                {t("modifyApprove")}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy === p.id}
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
