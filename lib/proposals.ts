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
    return (await applyBundle(d)).companyId;
  }

  throw new Error("unknown-entityType");
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export interface ApplyStats {
  companyCreated: number;
  companyUpdated: number;
  counterpartiesCreated: number;
  solutionsCreated: number;
  solutionsUpdated: number;
  eventsCreated: number;
  eventsUpdated: number;
}

interface ExistingSol {
  id: string;
  descriptionFr: string | null;
  descriptionEn: string | null;
  launchYear: number | null;
  website: string | null;
}
interface ExistingEvent {
  id: string;
  month: number | null;
  importance: string;
  descriptionFr: string | null;
  descriptionEn: string | null;
  url1: string | null;
  url2: string | null;
}

/**
 * Apply a research bundle atomically: create/update the company, then its
 * solutions, then its M&A events (referencing companies by name, resolved to
 * existing ids or the just-created company; unknown targets are created too).
 * Returns the company id + a breakdown of what changed.
 *
 * With `{ dedup: true }` (used by direct-apply batch enrichment) it is
 * conservative on an EXISTING company: company/solution/event scalar fields are
 * filled ONLY when currently empty (never overwriting curated data). A solution
 * with the same name, or an event matching an existing (type, year), is UPDATED
 * (empty fields filled — e.g. a missing source URL or month) instead of
 * duplicated — so re-running is idempotent.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function applyBundle(
  b: any,
  opts: { dedup?: boolean } = {}
): Promise<{ companyId: string; stats: ApplyStats }> {
  const companies = await prisma.company.findMany({ select: { id: true, initialName: true } });
  const byName = new Map(companies.map((c) => [norm(c.initialName), c.id]));
  const resolve = (name?: string | null) => (name ? byName.get(norm(name)) ?? null : null);
  const tagRows = await prisma.tag.findMany({ select: { id: true, slug: true } });
  const tagBySlug = new Map(tagRows.map((t) => [t.slug.toLowerCase(), t.id]));
  const validCountry = (c?: string | null) => (c && /^[A-Z]{2}$/.test(c) ? c : undefined);

  const stats: ApplyStats = {
    companyCreated: 0, companyUpdated: 0, counterpartiesCreated: 0,
    solutionsCreated: 0, solutionsUpdated: 0, eventsCreated: 0, eventsUpdated: 0,
  };

  const companyId = await prisma.$transaction(async (tx) => {
    const co = b.company;
    const country = co.country && /^[A-Z]{2}$/.test(co.country) ? co.country : "XX";

    // Existing solutions / events on the company (dedup mode) — keyed for
    // update-fill instead of duplicating.
    const existingSolByName = new Map<string, ExistingSol>();
    const existingEventByKey = new Map<string, ExistingEvent>();

    // 1) company (update existing, else create)
    let companyId: string;
    if (co.existingId) {
      companyId = co.existingId;
      stats.companyUpdated = 1;
      if (opts.dedup) {
        const cur = await tx.company.findUnique({
          where: { id: companyId },
          select: {
            descriptionFr: true, descriptionEn: true, foundedYear: true,
            foundedMonth: true, originCountry: true, website: true, country: true,
          },
        });
        // Fill ONLY empty fields — never overwrite existing curated values.
        await tx.company.update({
          where: { id: companyId },
          data: {
            descriptionFr: cur?.descriptionFr ? undefined : co.descriptionFr ?? undefined,
            descriptionEn: cur?.descriptionEn ? undefined : co.descriptionEn ?? undefined,
            foundedYear: cur?.foundedYear != null ? undefined : co.foundedYear ?? undefined,
            foundedMonth: cur?.foundedMonth != null ? undefined : co.foundedMonth ?? undefined,
            originCountry: cur?.originCountry ? undefined : co.originCountry ?? undefined,
            website: cur?.website ? undefined : co.website ?? undefined,
            country: cur?.country && cur.country !== "XX" ? undefined : validCountry(co.country),
          },
        });
        const [sols, evs] = await Promise.all([
          tx.solution.findMany({
            where: { initialCompanyId: companyId },
            select: { id: true, initialName: true, descriptionFr: true, descriptionEn: true, launchYear: true, website: true },
          }),
          tx.event.findMany({
            where: { subjectCompanyId: companyId },
            select: { id: true, type: true, year: true, month: true, importance: true, descriptionFr: true, descriptionEn: true, url1: true, url2: true },
          }),
        ]);
        for (const s of sols)
          existingSolByName.set(norm(s.initialName), { id: s.id, descriptionFr: s.descriptionFr, descriptionEn: s.descriptionEn, launchYear: s.launchYear, website: s.website });
        for (const e of evs)
          existingEventByKey.set(`${e.type}|${e.year}`, { id: e.id, month: e.month, importance: e.importance, descriptionFr: e.descriptionFr, descriptionEn: e.descriptionEn, url1: e.url1, url2: e.url2 });
      } else {
        await tx.company.update({
          where: { id: companyId },
          data: {
            descriptionFr: co.descriptionFr ?? undefined,
            descriptionEn: co.descriptionEn ?? undefined,
            foundedYear: co.foundedYear ?? undefined,
            foundedMonth: co.foundedMonth ?? undefined,
            country: validCountry(co.country),
            originCountry: co.originCountry ?? undefined,
            website: co.website ?? undefined,
          },
        });
      }
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
      stats.companyCreated = 1;
      byName.set(norm(co.initialName), companyId);
    }

    // 2) solutions — create new, or fill empty fields of an existing same-name one
    for (const s of b.solutions ?? []) {
      if (!s.initialName) continue;
      const key = norm(s.initialName);
      const existing = opts.dedup ? existingSolByName.get(key) : undefined;
      if (existing) {
        await tx.solution.update({
          where: { id: existing.id },
          data: {
            descriptionFr: existing.descriptionFr ? undefined : s.descriptionFr ?? undefined,
            descriptionEn: existing.descriptionEn ? undefined : s.descriptionEn ?? undefined,
            launchYear: existing.launchYear != null ? undefined : s.launchYear ?? undefined,
            website: existing.website ? undefined : s.website ?? undefined,
          },
        });
        stats.solutionsUpdated++;
        continue;
      }
      const tagIds = (s.tags ?? [])
        .map((sl: string) => tagBySlug.get(sl.toLowerCase()))
        .filter(Boolean) as string[];
      const created = await tx.solution.create({
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
      stats.solutionsCreated++;
      // Track so a later same-name solution in this bundle updates instead of dups.
      existingSolByName.set(key, { id: created.id, descriptionFr: s.descriptionFr ?? null, descriptionEn: s.descriptionEn ?? null, launchYear: s.launchYear ?? null, website: s.website ?? null });
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
      stats.counterpartiesCreated++;
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

      // Guard: an event without a valid integer year can't be inserted.
      if (typeof data.year !== "number" || !Number.isFinite(data.year)) continue;

      // Dedup: an event already recorded on the bundle company (same type +
      // year) is UPDATED (empty fields filled — month, source URL, descriptions)
      // rather than duplicated. Only when the subject IS the bundle company.
      if (opts.dedup && data.subjectCompanyId === companyId) {
        const k = `${data.type}|${data.year}`;
        const existing = existingEventByKey.get(k);
        if (existing) {
          await tx.event.update({
            where: { id: existing.id },
            data: {
              month: existing.month != null ? undefined : data.month ?? undefined,
              descriptionFr: existing.descriptionFr ? undefined : data.descriptionFr ?? undefined,
              descriptionEn: existing.descriptionEn ? undefined : data.descriptionEn ?? undefined,
              url1: existing.url1 ? undefined : data.url1 ?? undefined,
              url2: existing.url2 ? undefined : data.url2 ?? undefined,
              importance:
                existing.importance === "MINOR" && data.importance && data.importance !== "MINOR"
                  ? data.importance
                  : undefined,
            },
          });
          stats.eventsUpdated++;
          continue;
        }
      }

      const createdEvent = await tx.event.create({ data });
      stats.eventsCreated++;
      if (opts.dedup && data.subjectCompanyId === companyId) {
        existingEventByKey.set(`${data.type}|${data.year}`, {
          id: createdEvent.id, month: data.month ?? null, importance: data.importance,
          descriptionFr: data.descriptionFr ?? null, descriptionEn: data.descriptionEn ?? null,
          url1: data.url1 ?? null, url2: data.url2 ?? null,
        });
      }
      if (data.type === "HQ_RELOCATION" && data.newCountry) {
        await tx.company.update({ where: { id: companyId }, data: { country: data.newCountry } });
      }
    }

    return companyId;
  });

  return { companyId, stats };
}
