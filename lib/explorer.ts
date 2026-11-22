// Server-side builder of the Explorer dataset: a compact, serializable snapshot
// of the market (derived names/statuses/owners) — no secrets, no internal-only
// fields, logos referenced by URL (uploaded ones via /api/logos/[id]).
import { prisma } from "@/lib/prisma";
import { loadMarket } from "@/lib/queries";
import type { ExplorerData, XEvent } from "@/lib/explorer-model";
import { domainFromText } from "@/lib/domains";

export async function buildExplorerData(locale: "fr" | "en"): Promise<ExplorerData> {
  const [market, events, tags] = await Promise.all([
    loadMarket(),
    prisma.event.findMany({
      where: { subjectCompanyId: { not: null } },
      select: {
        id: true, type: true, year: true, month: true, importance: true,
        subjectCompanyId: true, acquirerCompanyId: true, acquirerNameRaw: true, acquiredNameRaw: true,
        withCompanyId: true, parentCompanyId: true, outcome: true, amount: true, round: true,
        newName: true, url1: true,
      },
    }),
    prisma.tag.findMany({ where: { family: "SOLUTION_TYPE" } }),
  ]);

  const companies = market.companies.map((c) => {
    const logo = c.logoUrl
      ? c.logoUrl.startsWith("data:")
        ? `/api/logos/${c.id}`
        : /^https?:\/\//i.test(c.logoUrl)
          ? c.logoUrl
          : null
      : null;
    return {
      id: c.id,
      name: c.timeline.currentName,
      country: c.country && c.country !== "XX" ? c.country : null,
      logo,
      founded: c.foundedYear ?? null,
      status: c.timeline.currentStatus,
      ownerId: c.timeline.currentOwner?.ownerCompanyId ?? null,
      domainGuess: domainFromText(`${c.descriptionFr ?? ""} ${c.descriptionEn ?? ""}`),
    };
  });

  const xEvents: XEvent[] = events.map((e) => {
    // Normalize buyer/target. MERGER: the subject merges INTO withCompany.
    // Acquirer-centric ACQUISITION (target known only by name): the subject is
    // the buyer and the target is free text.
    let acqId: string | null = null, acqRaw: string | null = null;
    let tgtId: string | null = e.subjectCompanyId, tgtRaw: string | null = null;
    if (e.type === "ACQUISITION" || e.type === "CO_INVESTMENT" || e.type === "ABSORPTION") {
      if (e.acquiredNameRaw) {
        acqId = e.subjectCompanyId;
        tgtId = null;
        tgtRaw = e.acquiredNameRaw;
      } else {
        acqId = e.acquirerCompanyId;
        acqRaw = e.acquirerNameRaw;
      }
    } else if (e.type === "MERGER") {
      acqId = e.withCompanyId;
    } else if (e.type === "SPINOFF") {
      acqId = e.parentCompanyId; // displayed as "spun off from"
    }
    return {
      id: e.id, type: e.type, year: e.year, month: e.month,
      acqId, acqRaw, tgtId, tgtRaw,
      amount: e.amount, outcome: e.outcome, importance: e.importance,
      newName: e.newName, round: e.round,
      url: e.url1 && /^https?:\/\//i.test(e.url1) ? e.url1 : null,
    };
  });

  const solutions = market.solutions.map((s) => ({
    id: s.id,
    name: s.timeline.currentName,
    vendorId: s.timeline.currentOwnerCompanyId,
    originId: s.initialCompanyId,
    types: s.tags.filter((t) => t.family === "SOLUTION_TYPE" && t.slug).map((t) => t.slug),
  }));

  const types = tags
    .filter((t) => t.slug)
    .map((t) => ({
      slug: t.slug,
      label: locale === "fr" ? t.labelFr : t.labelEn,
      description: (locale === "fr" ? t.descriptionFr : t.descriptionEn) ?? null,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return { companies, events: xEvents, solutions, types, nowYear: new Date().getFullYear() };
}
