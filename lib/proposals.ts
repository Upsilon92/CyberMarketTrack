// Proposal engine: validate a submitted payload against the right entity schema,
// count recent submissions per IP (rate limiting), and APPLY an approved proposal
// through the SAME create/update logic as the admin routes.
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { companySchema, solutionSchema, tagSchema, eventSchema, bundleSchema } from "@/lib/validation";
import { checkEventCoherence } from "@/lib/event-checks";

export const PROPOSAL_ENTITY_TYPES = ["Company", "Solution", "Event", "Tag", "Bundle"] as const;
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
    case "Bundle":
      return bundleSchema.safeParse(payload);
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
    const e = isCreate
      ? await prisma.event.create({ data: d })
      : await prisma.event.update({ where: { id: p.targetId! }, data: d });
    if (d.type === "HQ_RELOCATION" && d.newCountry && d.subjectCompanyId) {
      await prisma.company.update({
        where: { id: d.subjectCompanyId },
        data: { country: d.newCountry },
      });
    }
    return e.id;
  }

  if (p.entityType === "Bundle") {
    return applyBundle(d);
  }

  throw new Error("unknown-entityType");
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Apply a research bundle atomically: create/update the company, then its
 * solutions, then its M&A events (referencing companies by name, resolved to
 * existing ids or the just-created company; unknown targets become free text).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function applyBundle(b: any): Promise<string> {
  const companies = await prisma.company.findMany({ select: { id: true, initialName: true } });
  const byName = new Map(companies.map((c) => [norm(c.initialName), c.id]));
  const resolve = (name?: string | null) => (name ? byName.get(norm(name)) ?? null : null);
  const tagRows = await prisma.tag.findMany({ select: { id: true, slug: true } });
  const tagBySlug = new Map(tagRows.map((t) => [t.slug.toLowerCase(), t.id]));

  return prisma.$transaction(async (tx) => {
    const co = b.company;
    const country = co.country && /^[A-Z]{2}$/.test(co.country) ? co.country : "XX";

    // 1) company (update existing, else create)
    let companyId: string;
    if (co.existingId) {
      companyId = co.existingId;
      await tx.company.update({
        where: { id: companyId },
        data: {
          descriptionFr: co.descriptionFr ?? undefined,
          descriptionEn: co.descriptionEn ?? undefined,
          foundedYear: co.foundedYear ?? undefined,
          foundedMonth: co.foundedMonth ?? undefined,
          country: co.country && /^[A-Z]{2}$/.test(co.country) ? co.country : undefined,
          originCountry: co.originCountry ?? undefined,
          website: co.website ?? undefined,
        },
      });
    } else {
      const created = await tx.company.create({
        data: {
          initialName: co.initialName,
          types: { create: (co.types?.length ? co.types : ["VENDOR"]).map((type: string) => ({ type })) },
          foundedYear: co.foundedYear ?? null,
          foundedMonth: co.foundedMonth ?? null,
          country,
          originCountry: co.originCountry ?? null,
          descriptionFr: co.descriptionFr ?? null,
          descriptionEn: co.descriptionEn ?? null,
          website: co.website ?? null,
        },
      });
      companyId = created.id;
      byName.set(norm(co.initialName), companyId);
    }

    // 2) solutions
    for (const s of b.solutions ?? []) {
      const tagIds = (s.tags ?? [])
        .map((sl: string) => tagBySlug.get(sl.toLowerCase()))
        .filter(Boolean) as string[];
      await tx.solution.create({
        data: {
          initialName: s.initialName,
          initialCompanyId: companyId,
          descriptionFr: s.descriptionFr ?? null,
          descriptionEn: s.descriptionEn ?? null,
          launchYear: s.launchYear ?? null,
          website: s.website ?? null,
          tags: { connect: tagIds.map((id) => ({ id })) },
        },
      });
    }

    // Resolve a counterparty name to an existing company id, or CREATE a minimal
    // company for it (so an M&A event links two real, browsable entities rather
    // than free text). Cached so the same name isn't created twice in a bundle.
    const resolveOrCreate = async (name?: string | null): Promise<string | null> => {
      if (!name || !name.trim()) return null;
      const existing = resolve(name);
      if (existing) return existing;
      const created = await tx.company.create({
        data: { initialName: name.trim(), types: { create: [{ type: "VENDOR" }] }, country: "XX" },
      });
      byName.set(norm(name), created.id);
      return created.id;
    };

    // 3) events (relative to the bundle company)
    for (const ev of b.events ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = {
        type: ev.type,
        year: ev.year,
        month: ev.month ?? null,
        importance: ev.importance ?? "MINOR",
        descriptionFr: ev.descriptionFr ?? null,
        descriptionEn: ev.descriptionEn ?? null,
        url1: ev.url1 ?? null,
        url2: ev.url2 ?? null,
      };

      if (ev.role === "acquirer") {
        // The bundle company ACQUIRED the counterparty (create it if unknown).
        data.type = "ACQUISITION";
        const cpId = await resolveOrCreate(ev.counterpartyName);
        if (cpId) {
          data.subjectCompanyId = cpId;
          data.acquirerCompanyId = companyId;
          data.outcome = ev.outcome ?? "UNKNOWN";
        } else {
          data.subjectCompanyId = companyId;
          data.acquiredNameRaw = ev.counterpartyName ?? "?";
        }
      } else {
        data.subjectCompanyId = companyId;
        switch (ev.type) {
          case "ACQUISITION": {
            data.outcome = ev.outcome ?? "UNKNOWN";
            const cpId = await resolveOrCreate(ev.counterpartyName);
            if (cpId) data.acquirerCompanyId = cpId;
            else if (ev.counterpartyName) data.acquirerNameRaw = ev.counterpartyName;
            break;
          }
          case "MERGER": {
            const cpId = await resolveOrCreate(ev.counterpartyName);
            if (cpId) data.withCompanyId = cpId;
            else data.type = "OTHER";
            break;
          }
          case "SPINOFF": {
            const cpId = await resolveOrCreate(ev.counterpartyName);
            if (cpId) data.parentCompanyId = cpId;
            else data.type = "OTHER";
            break;
          }
          case "FUNDING":
            if (ev.amount) data.amount = ev.amount;
            if (ev.round) data.round = ev.round;
            break;
          case "HQ_RELOCATION":
            data.newCountry = ev.newCountry ?? null;
            break;
          case "COMPANY_RENAME":
            if (!ev.newName) continue;
            data.newName = ev.newName;
            break;
          case "IPO":
          case "DELISTING":
            if (ev.note) data.note = ev.note;
            break;
          default:
            break;
        }
      }

      await tx.event.create({ data });
      if (data.type === "HQ_RELOCATION" && data.newCountry) {
        await tx.company.update({ where: { id: companyId }, data: { country: data.newCountry } });
      }
    }

    return companyId;
  });
}
