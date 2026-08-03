// =============================================================================
// Field-level DIFF model for reviewing a proposal against the CURRENT state of
// the entity it targets. Lets the admin see, per field, the current value vs the
// proposed value and choose which to keep (see components/admin/proposal-diff-
// review.tsx). Covers Company / Solution / Event UPDATE and Bundle proposals.
// =============================================================================
import { prisma } from "@/lib/prisma";

// Fields compared per entity (scalar, review-worthy — structural ids excluded).
export const COMPANY_DIFF_FIELDS = [
  "foundedYear", "foundedMonth", "country", "originCountry", "descriptionFr", "descriptionEn", "website",
] as const;
export const SOLUTION_DIFF_FIELDS = ["descriptionFr", "descriptionEn", "website", "launchYear", "features"] as const;
export const EVENT_DIFF_FIELDS = [
  "descriptionFr", "descriptionEn", "url1", "url2", "month", "importance", "outcome", "amount", "round", "note", "newName",
] as const;

export interface FieldDiff {
  key: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  current: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proposed: any;
  same: boolean; // current and proposed are equivalent (nothing to decide)
}

export interface SubEntityDiff {
  title: string;
  existingId?: string; // set when the proposed sub-entity matches an existing one
  isNew: boolean;
  fields: FieldDiff[];
  // The raw proposed object (bundle solution/event), for building the resolution.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proposed: any;
}

export interface ProposalDiff {
  // "entity" = single Company/Solution/Event UPDATE; "bundle" = company + subs.
  kind: "entity" | "bundle";
  entityType?: string; // for "entity"
  fields?: FieldDiff[]; // for "entity" (single) OR the bundle company
  solutions?: SubEntityDiff[]; // bundle
  events?: SubEntityDiff[]; // bundle
}

const empty = (v: unknown) => v === null || v === undefined || v === "";
function same(a: unknown, b: unknown): boolean {
  if (empty(a) && empty(b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  return a === b;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function diffFields(keys: readonly string[], current: any, proposed: any): FieldDiff[] {
  return keys.map((key) => {
    const cur = current?.[key] ?? null;
    const pro = proposed?.[key] ?? null;
    return { key, current: cur, proposed: pro, same: same(cur, pro) };
  });
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Build the diff model for a PENDING proposal, or null when there's nothing to
 * compare (a pure CREATE with no existing target).
 */
export async function buildProposalDiff(p: {
  entityType: string;
  kind: string;
  targetId: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
}): Promise<ProposalDiff | null> {
  const d = p.payload;

  if (p.entityType === "Company" && p.kind === "UPDATE" && p.targetId) {
    const c = await prisma.company.findUnique({ where: { id: p.targetId } });
    if (!c) return null;
    return { kind: "entity", entityType: "Company", fields: diffFields(COMPANY_DIFF_FIELDS, c, d) };
  }

  if (p.entityType === "Solution" && p.kind === "UPDATE" && p.targetId) {
    const s = await prisma.solution.findUnique({ where: { id: p.targetId } });
    if (!s) return null;
    return { kind: "entity", entityType: "Solution", fields: diffFields(SOLUTION_DIFF_FIELDS, s, d) };
  }

  if (p.entityType === "Event" && p.kind === "UPDATE" && p.targetId) {
    const e = await prisma.event.findUnique({ where: { id: p.targetId } });
    if (!e) return null;
    return { kind: "entity", entityType: "Event", fields: diffFields(EVENT_DIFF_FIELDS, e, d) };
  }

  if (p.entityType === "Bundle") {
    const existingId: string | null = d?.company?.existingId ?? p.targetId ?? null;
    if (!existingId) return null; // CREATE bundle: everything new, no diff
    const company = await prisma.company.findUnique({ where: { id: existingId } });
    if (!company) return null;

    const [existingSols, existingEvents] = await Promise.all([
      prisma.solution.findMany({ where: { initialCompanyId: existingId }, select: { id: true, initialName: true, descriptionFr: true, descriptionEn: true, website: true, launchYear: true, features: true } }),
      prisma.event.findMany({ where: { subjectCompanyId: existingId } }),
    ]);
    const solByName = new Map(existingSols.map((s) => [norm(s.initialName), s]));
    const eventByKey = new Map(existingEvents.map((e) => [`${e.type}|${e.year}`, e]));

    const solutions: SubEntityDiff[] = (d.solutions ?? []).map((s: Record<string, unknown>) => {
      const match = s.initialName ? solByName.get(norm(String(s.initialName))) : undefined;
      return {
        title: String(s.initialName ?? "?"),
        existingId: match?.id,
        isNew: !match,
        fields: match ? diffFields(SOLUTION_DIFF_FIELDS, match, s) : [],
        proposed: s,
      };
    });

    const events: SubEntityDiff[] = (d.events ?? []).map((ev: Record<string, unknown>) => {
      // Only subject-role events are about THIS company; acquirer-role events are
      // about the counterparty → always shown as new.
      const type = ev.role === "acquirer" ? "ACQUISITION" : String(ev.type);
      const match = ev.role === "acquirer" ? undefined : eventByKey.get(`${type}|${ev.year}`);
      return {
        title: `${type} ${ev.year}${ev.counterpartyName ? ` · ${ev.counterpartyName}` : ""}`,
        existingId: match?.id,
        isNew: !match,
        fields: match ? diffFields(EVENT_DIFF_FIELDS, match, ev) : [],
        proposed: ev,
      };
    });

    return {
      kind: "bundle",
      fields: diffFields(COMPANY_DIFF_FIELDS, company, d.company ?? {}),
      solutions,
      events,
    };
  }

  return null;
}
