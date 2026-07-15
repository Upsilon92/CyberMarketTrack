// =============================================================================
// Data-access layer for the public pages.
//
// Pattern (spec: "Performance"): load entities WITH their events in one query,
// then derive names/statuses/periods in memory via /lib/timeline.ts.
// No period is ever read from (or written to) the database.
//
// `loadMarket` is wrapped in React.cache so several components of the same
// request share one database round-trip.
// =============================================================================
import { cache } from "react";
import { prisma } from "./prisma";
import {
  buildCompanyTimeline,
  buildSolutionTimeline,
  type CompanyTimeline,
  type SolutionTimeline,
} from "./timeline";
import type { Company, Solution, Tag, Alias, Event, CompanyTypeAssignment, Revenue } from "./generated/prisma/client";

// --- Enriched shapes ---------------------------------------------------------

export type CompanyWithState = Company & {
  types: CompanyTypeAssignment[];
  aliases: Alias[];
  subjectEvents: Event[];
  revenues: Revenue[];
  timeline: CompanyTimeline;
};

export type SolutionWithState = Solution & {
  tags: Tag[];
  aliases: Alias[];
  events: Event[];
  timeline: SolutionTimeline;
};

export interface Market {
  companies: CompanyWithState[];
  solutions: SolutionWithState[];
  /** id -> derived current name (companies) */
  companyNameById: Map<string, string>;
  /** id -> derived current name (solutions) */
  solutionNameById: Map<string, string>;
}

// --- The single market snapshot ------------------------------------------------

export const loadMarket = cache(async (): Promise<Market> => {
  const [companies, solutions] = await Promise.all([
    prisma.company.findMany({
      include: { types: true, aliases: true, subjectEvents: true, revenues: { orderBy: { year: "asc" } } },
    }),
    prisma.solution.findMany({
      include: { tags: true, aliases: true, events: true },
    }),
  ]);

  const companiesWithState: CompanyWithState[] = companies.map((c) => ({
    ...c,
    timeline: buildCompanyTimeline(c, c.subjectEvents),
  }));
  const solutionsWithState: SolutionWithState[] = solutions.map((s) => ({
    ...s,
    timeline: buildSolutionTimeline(s, s.events),
  }));

  return {
    companies: companiesWithState,
    solutions: solutionsWithState,
    companyNameById: new Map(companiesWithState.map((c) => [c.id, c.timeline.currentName])),
    solutionNameById: new Map(solutionsWithState.map((s) => [s.id, s.timeline.currentName])),
  };
});

/** Display name for an owner: referenced company's current name, or raw text. */
export function ownerDisplayName(
  market: Market,
  ownerCompanyId: string | null,
  ownerNameRaw?: string | null
): string {
  if (ownerCompanyId) return market.companyNameById.get(ownerCompanyId) ?? "?";
  return ownerNameRaw ?? "?";
}

// --- Detail lookups --------------------------------------------------------------

export async function getCompanyWithState(id: string): Promise<CompanyWithState | null> {
  const market = await loadMarket();
  return market.companies.find((c) => c.id === id) ?? null;
}

export async function getSolutionWithState(id: string): Promise<SolutionWithState | null> {
  const market = await loadMarket();
  return market.solutions.find((s) => s.id === id) ?? null;
}

/** Solutions currently (or formerly) owned by a company, derived from events. */
export function solutionsOfCompany(market: Market, companyId: string) {
  const current = market.solutions.filter((s) => s.timeline.currentOwnerCompanyId === companyId);
  const former = market.solutions.filter(
    (s) =>
      s.timeline.currentOwnerCompanyId !== companyId &&
      s.timeline.ownershipPeriods.some((p) => p.ownerCompanyId === companyId)
  );
  return { current, former };
}

/** Solutions currently integrated INTO the given host solution (derived). */
export function solutionsIntegratedInto(market: Market, hostSolutionId: string) {
  return market.solutions.filter(
    (s) => s.timeline.integratedIntoSolutionId === hostSolutionId
  );
}

/**
 * Portfolio of an investment fund: companies whose ownership periods reference
 * it. Open periods = current holdings, closed ones = past holdings.
 */
export function portfolioOfFund(market: Market, fundId: string) {
  const current: { company: CompanyWithState; sinceYear: number | null }[] = [];
  const past: { company: CompanyWithState; fromYear: number | null; toYear: number | null }[] = [];
  for (const c of market.companies) {
    for (const p of c.timeline.ownershipPeriods) {
      if (p.ownerCompanyId !== fundId) continue;
      if (p.end === null) current.push({ company: c, sinceYear: p.start?.year ?? null });
      else past.push({ company: c, fromYear: p.start?.year ?? null, toYear: p.end.year });
    }
  }
  return { current, past };
}

// --- Search -----------------------------------------------------------------------

export type SearchMatch =
  | { kind: "current" }
  | { kind: "former"; name: string }
  | { kind: "alias"; name: string };

export interface CompanySearchResult {
  company: CompanyWithState;
  match: SearchMatch;
}
export interface SolutionSearchResult {
  solution: SolutionWithState;
  match: SearchMatch;
}

function matchEntity(
  q: string,
  currentName: string,
  formerNames: string[],
  aliases: string[],
  description?: string | null
): SearchMatch | null {
  const needle = q.toLowerCase();
  if (currentName.toLowerCase().includes(needle)) return { kind: "current" };
  const former = formerNames.find((n) => n.toLowerCase().includes(needle));
  if (former) return { kind: "former", name: former };
  const alias = aliases.find((n) => n.toLowerCase().includes(needle));
  if (alias) return { kind: "alias", name: alias };
  if (description && description.toLowerCase().includes(needle)) return { kind: "current" };
  return null;
}

/**
 * Global search: current name, ALL historical names (derived from rename
 * events) and all aliases — plus plain-text description match.
 */
export async function searchAll(q: string): Promise<{
  companies: CompanySearchResult[];
  solutions: SolutionSearchResult[];
}> {
  const market = await loadMarket();
  const query = q.trim();
  if (!query) return { companies: [], solutions: [] };

  const companies: CompanySearchResult[] = [];
  for (const c of market.companies) {
    const match = matchEntity(
      query,
      c.timeline.currentName,
      c.timeline.namePeriods.slice(0, -1).map((p) => p.name),
      c.aliases.map((a) => a.name),
      c.description
    );
    if (match) companies.push({ company: c, match });
  }

  const solutions: SolutionSearchResult[] = [];
  for (const s of market.solutions) {
    const match = matchEntity(
      query,
      s.timeline.currentName,
      s.timeline.namePeriods.slice(0, -1).map((p) => p.name),
      s.aliases.map((a) => a.name),
      s.description
    );
    if (match) solutions.push({ solution: s, match });
  }

  return { companies, solutions };
}

// --- Events (news feed, home) --------------------------------------------------------

export type EventWithRelations = Event & {
  subjectCompany: Company | null;
  subjectSolution: Solution | null;
  acquirerCompany: Company | null;
  withCompany: Company | null;
  newOwnerCompany: Company | null;
  intoSolution: Solution | null;
};

export const loadAllEvents = cache(async (): Promise<EventWithRelations[]> => {
  return prisma.event.findMany({
    include: {
      subjectCompany: true,
      subjectSolution: true,
      acquirerCompany: true,
      withCompany: true,
      newOwnerCompany: true,
      intoSolution: true,
    },
    // Most recent first; a missing month sorts last within its year (SQLite
    // sorts NULLs first on DESC, which is what we want for "recent first").
    orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
  });
});

// --- Stats (home page) -------------------------------------------------------------------

export async function getStats() {
  const [companies, solutions, events] = await Promise.all([
    prisma.company.count(),
    prisma.solution.count(),
    prisma.event.count(),
  ]);
  return { companies, solutions, events };
}

// --- Freshness -----------------------------------------------------------------------------

const FRESHNESS_MONTHS = Number(process.env.FRESHNESS_MONTHS ?? "12");

/** True when the entity has not been updated for more than FRESHNESS_MONTHS. */
export function isStale(updatedAt: Date): boolean {
  const threshold = new Date();
  threshold.setMonth(threshold.getMonth() - FRESHNESS_MONTHS);
  return updatedAt < threshold;
}
