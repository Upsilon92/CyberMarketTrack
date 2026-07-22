// Proposal engine: validate a submitted payload against the right entity schema,
// count recent submissions per IP (rate limiting), and APPLY an approved proposal
// through the SAME create/update logic as the admin routes.
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { companySchema, solutionSchema, tagSchema, eventSchema } from "@/lib/validation";
import { checkEventCoherence } from "@/lib/event-checks";

export const PROPOSAL_ENTITY_TYPES = ["Company", "Solution", "Event", "Tag"] as const;
export type ProposalEntityType = (typeof PROPOSAL_ENTITY_TYPES)[number];

export const PROPOSAL_MAX_PER_IP = 10;
export const PROPOSAL_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Client IP behind the reverse proxy (X-Forwarded-For), best-effort. */
export function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Validate a proposal payload against its entity's Zod schema. */
export function validateProposalPayload(entityType: string, payload: unknown) {
  switch (entityType) {
    case "Company":
      return companySchema.safeParse(payload);
    case "Solution":
      return solutionSchema.safeParse(payload);
    case "Tag":
      return tagSchema.safeParse(payload);
    case "Event":
      return eventSchema.safeParse(payload);
    default:
      return companySchema.safeParse(undefined); // guaranteed failure
  }
}

/** How many USER proposals this IP has made in the last 24h. */
export async function countRecentProposalsFromIp(ip: string): Promise<number> {
  const since = new Date(Date.now() - PROPOSAL_WINDOW_MS);
  return prisma.proposal.count({
    where: { origin: "USER", sourceIp: ip, createdAt: { gte: since } },
  });
}

/**
 * Apply an approved proposal to the base. `payload` is a JSON string that has
 * already been validated by validateProposalPayload. Returns the affected id.
 * Mirrors the admin create/update routes exactly (types, tags, coherence…).
 */
export async function applyProposal(p: {
  kind: string;
  entityType: string;
  targetId: string | null;
  payload: string;
}): Promise<string> {
  const parsed = validateProposalPayload(p.entityType, JSON.parse(p.payload));
  if (!parsed.success) throw new Error("invalid-payload");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = parsed.data as any;
  const isCreate = p.kind === "CREATE";

  if (p.entityType === "Company") {
    const { types, ...rest } = d;
    const typesCreate = (types as string[]).map((type) => ({ type }));
    if (isCreate) {
      const c = await prisma.company.create({ data: { ...rest, types: { create: typesCreate } } });
      return c.id;
    }
    const c = await prisma.company.update({
      where: { id: p.targetId! },
      data: { ...rest, types: { deleteMany: {}, create: typesCreate } },
    });
    return c.id;
  }

  if (p.entityType === "Solution") {
    const { tagIds = [], ...rest } = d;
    const ids = (tagIds as string[]).map((id) => ({ id }));
    if (isCreate) {
      const s = await prisma.solution.create({ data: { ...rest, tags: { connect: ids } } });
      return s.id;
    }
    const s = await prisma.solution.update({
      where: { id: p.targetId! },
      data: { ...rest, tags: { set: ids } },
    });
    return s.id;
  }

  if (p.entityType === "Tag") {
    if (isCreate) {
      const t = await prisma.tag.create({ data: d });
      return t.id;
    }
    const t = await prisma.tag.update({ where: { id: p.targetId! }, data: d });
    return t.id;
  }

  if (p.entityType === "Event") {
    const coherence = await checkEventCoherence(d);
    if (!coherence.subjectFound || coherence.errors.length > 0) throw new Error("incoherent-event");
    if (isCreate) {
      const e = await prisma.event.create({ data: d });
      return e.id;
    }
    const e = await prisma.event.update({ where: { id: p.targetId! }, data: d });
    return e.id;
  }

  throw new Error("unknown-entityType");
}
