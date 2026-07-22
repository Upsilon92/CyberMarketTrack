"use client";

// Shared submit branch for entity forms so the same form serves three modes:
//  - admin (default): the caller runs its normal create/update
//  - proposalMode: submit the values as a PENDING proposal (public)
//  - approveProposalId: approve an existing proposal with these (edited) values
import { api } from "@/components/admin/api";

export interface ProposalContext {
  proposalMode?: boolean;
  approveProposalId?: string;
  entityType: "Company" | "Solution" | "Event" | "Tag";
  targetId?: string | null;
  note?: string;
}

/** Handles proposal/review submit; returns true if handled (skip admin path). */
export async function maybeSubmitProposal(
  ctx: ProposalContext | undefined,
  payload: unknown
): Promise<boolean> {
  if (!ctx) return false;
  if (ctx.approveProposalId) {
    await api(`/api/proposals/${ctx.approveProposalId}`, "PUT", { action: "approve", payload });
    return true;
  }
  if (ctx.proposalMode) {
    await api("/api/proposals", "POST", {
      kind: ctx.targetId ? "UPDATE" : "CREATE",
      entityType: ctx.entityType,
      targetId: ctx.targetId ?? null,
      payload,
      note: ctx.note,
    });
    return true;
  }
  return false;
}
