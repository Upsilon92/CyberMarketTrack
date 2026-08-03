// =============================================================================
// Apply a proposal with per-field CHOICES from the diff review: for each field
// the admin keeps the current value or takes the proposed one, and for each new
// sub-entity (bundle) decides whether to include it. See buildProposalDiff.
// =============================================================================
import { prisma } from "@/lib/prisma";
import { buildProposalDiff } from "@/lib/proposal-diff";
import { applyBundle } from "@/lib/proposals";

export interface Resolution {
  takeFields?: string[]; // entity UPDATE: fields to take from the proposal
  companyTakeFields?: string[]; // bundle company fields to take
  events?: { index: number; include: boolean; takeFields?: string[] }[];
  solutions?: { index: number; include: boolean; takeFields?: string[] }[];
}

export async function resolveProposal(
  p: { entityType: string; kind: string; targetId: string | null; payload: unknown },
  res: Resolution
): Promise<string> {
  const diff = await buildProposalDiff(p);
  if (!diff) throw new Error("no-diff");

  // ---- Single entity (Company / Solution / Event UPDATE) --------------------
  if (diff.kind === "entity") {
    if (!p.targetId) throw new Error("no-target");
    const take = new Set(res.takeFields ?? []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    for (const f of diff.fields ?? []) if (take.has(f.key)) data[f.key] = f.proposed ?? null;
    // `country` is required — never clear it.
    if (p.entityType === "Company" && (data.country == null || data.country === "")) delete data.country;
    if (Object.keys(data).length) {
      if (p.entityType === "Company") await prisma.company.update({ where: { id: p.targetId }, data });
      else if (p.entityType === "Solution") await prisma.solution.update({ where: { id: p.targetId }, data });
      else await prisma.event.update({ where: { id: p.targetId }, data });
    }
    return p.targetId;
  }

  // ---- Bundle ---------------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = p.payload as any;
  const existingId: string = payload?.company?.existingId ?? p.targetId;
  if (!existingId) throw new Error("no-target");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const newEvents: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const newSolutions: any[] = [];

  await prisma.$transaction(async (tx) => {
    // Company scalar fields
    const cTake = new Set(res.companyTakeFields ?? []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cdata: any = {};
    for (const f of diff.fields ?? []) if (cTake.has(f.key)) cdata[f.key] = f.proposed ?? null;
    if (cdata.country == null || cdata.country === "") delete cdata.country; // required
    if (Object.keys(cdata).length) await tx.company.update({ where: { id: existingId }, data: cdata });

    // Events
    for (const decision of res.events ?? []) {
      const sub = diff.events?.[decision.index];
      if (!sub || !decision.include) continue;
      if (sub.existingId) {
        const take = new Set(decision.takeFields ?? []);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = {};
        for (const f of sub.fields) if (take.has(f.key)) data[f.key] = f.proposed ?? null;
        if (Object.keys(data).length) await tx.event.update({ where: { id: sub.existingId }, data });
      } else {
        newEvents.push(sub.proposed);
      }
    }

    // Solutions
    for (const decision of res.solutions ?? []) {
      const sub = diff.solutions?.[decision.index];
      if (!sub || !decision.include) continue;
      if (sub.existingId) {
        const take = new Set(decision.takeFields ?? []);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = {};
        for (const f of sub.fields) if (take.has(f.key)) data[f.key] = f.proposed ?? null;
        if (Object.keys(data).length) await tx.solution.update({ where: { id: sub.existingId }, data });
      } else {
        newSolutions.push(sub.proposed);
      }
    }
  });

  // Create the included NEW sub-entities via applyBundle (handles counterparty
  // creation, tags, etc.). dedup avoids re-creating anything already present.
  if (newEvents.length || newSolutions.length) {
    await applyBundle({ company: { existingId }, events: newEvents, solutions: newSolutions }, { dedup: true });
  }

  return existingId;
}
