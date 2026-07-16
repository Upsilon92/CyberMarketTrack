// =============================================================================
// Timeline derivation — THE core of the application.
//
// Events are the single source of truth. This module derives, at read time,
// every period (names, ownership, status) and every current value from:
//   - the entity's initial state (initialName, foundedYear / initialCompanyId)
//   - its chronologically sorted list of events.
//
// Pure functions only: no database access, no side effects. Input events can
// be in ANY order (they were possibly typed in a posteriori): sorting happens
// here, which is what makes out-of-order data entry work natively.
//
// Nothing computed here is ever written back to the database.
// =============================================================================

import { compareDates, isBefore, type DatePoint } from "./date";
import type {
  AcquisitionOutcome,
  CompanyStatus,
  EventType,
  SolutionStatus,
} from "./constants";

// ---------------------------------------------------------------------------
// Input types — deliberately minimal structural subsets of the Prisma models,
// so these functions stay decoupled from the ORM (and trivially unit-testable).
// ---------------------------------------------------------------------------

export interface TimelineEventInput {
  id: string;
  type: EventType | string;
  year: number;
  month?: number | null;
  description?: string | null;
  // COMPANY_RENAME / SOLUTION_RENAME
  newName?: string | null;
  // ACQUISITION
  acquirerCompanyId?: string | null;
  acquirerNameRaw?: string | null;
  outcome?: string | null;
  // MERGER
  withCompanyId?: string | null;
  // SOLUTION_TRANSFER
  newOwnerCompanyId?: string | null;
  // SOLUTION_INTEGRATED
  intoSolutionId?: string | null;
  // FUNDING
  amount?: number | null;
  round?: string | null;
  // DIVESTMENT
  note?: string | null;
}

export interface CompanyInput {
  id: string;
  initialName: string;
  foundedYear: number;
  foundedMonth?: number | null;
}

export interface SolutionInput {
  id: string;
  initialName: string;
  initialCompanyId: string;
  launchYear?: number | null;
  launchMonth?: number | null;
}

// ---------------------------------------------------------------------------
// Output types — a period's `end = null` means "still current".
// `start = null` means the start is unknown (allowed data gap).
// ---------------------------------------------------------------------------

export interface Period {
  start: DatePoint | null;
  end: DatePoint | null;
}

export interface NamePeriod extends Period {
  name: string;
}

export interface OwnershipPeriod extends Period {
  /** Owning company id, or null when the acquirer is only known as free text */
  ownerCompanyId: string | null;
  /** Free-text acquirer name when not referenced in the base */
  ownerNameRaw: string | null;
  /** ACQUISITION outcome: INVESTOR_OWNED | AUTONOMOUS | ABSORBED | UNKNOWN */
  ownershipType: AcquisitionOutcome;
}

export interface StatusPeriod extends Period {
  status: CompanyStatus;
}

export interface SolutionStatusPeriod extends Period {
  status: SolutionStatus;
}

export interface CompanyTimeline {
  namePeriods: NamePeriod[];
  ownershipPeriods: OwnershipPeriod[];
  statusPeriods: StatusPeriod[];
  currentName: string;
  /** Last-opened ownership period, or null when independent (single-owner display) */
  currentOwner: OwnershipPeriod | null;
  /** ALL currently-open ownership periods (>1 when co-investors hold in parallel) */
  currentOwners: OwnershipPeriod[];
  currentStatus: CompanyStatus;
  /** FUNDING / OTHER — displayed on the timeline, no effect on state */
  informationalEvents: TimelineEventInput[];
  /** All state-affecting events, chronologically sorted (for timeline display) */
  stateEvents: TimelineEventInput[];
}

export interface SolutionTimeline {
  namePeriods: NamePeriod[];
  /** Successive vendors (initial company, then SOLUTION_TRANSFER chain) */
  ownershipPeriods: SolutionOwnershipPeriod[];
  statusPeriods: SolutionStatusPeriod[];
  currentName: string;
  currentOwnerCompanyId: string;
  currentStatus: SolutionStatus;
  /** Host solution id when the current status is INTEGRATED (else null) */
  integratedIntoSolutionId: string | null;
  informationalEvents: TimelineEventInput[];
  stateEvents: TimelineEventInput[];
}

export interface SolutionOwnershipPeriod extends Period {
  ownerCompanyId: string;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Event date as a DatePoint. */
export function eventDate(e: TimelineEventInput): DatePoint {
  return { year: e.year, month: e.month ?? null };
}

/**
 * Chronological sort. Missing month = start of year. For identical dates the
 * original relative order is kept (Array.sort is stable), which is fine
 * because two same-dimension events at the exact same date are rejected at
 * input time (see validateCompanyEvents / validateSolutionEvents).
 */
export function sortEvents(events: TimelineEventInput[]): TimelineEventInput[] {
  return [...events].sort((a, b) => compareDates(eventDate(a), eventDate(b)));
}

/** Maps an ACQUISITION outcome to the derived company status. */
function statusForOutcome(outcome: string | null | undefined): CompanyStatus {
  switch (outcome) {
    case "INVESTOR_OWNED":
      return "INVESTOR_OWNED";
    case "ABSORBED":
      return "ABSORBED";
    case "AUTONOMOUS":
      return "SUBSIDIARY";
    case "UNKNOWN":
    default:
      // Owned, but the nature of the ownership is unknown — kept as a distinct
      // status rather than forced into SUBSIDIARY.
      return "INVESTOR_UNKNOWN";
  }
}

// ---------------------------------------------------------------------------
// buildCompanyTimeline
// ---------------------------------------------------------------------------

const COMPANY_STATE_TYPES = new Set([
  "COMPANY_RENAME",
  "ACQUISITION",
  "CO_INVESTMENT",
  "ABSORPTION",
  "DIVESTMENT",
  "MERGER",
  "SHUTDOWN",
]);

export function buildCompanyTimeline(
  company: CompanyInput,
  events: TimelineEventInput[]
): CompanyTimeline {
  const founded: DatePoint = { year: company.foundedYear, month: company.foundedMonth ?? null };

  const sorted = sortEvents(events);
  const stateEvents = sorted.filter((e) => COMPANY_STATE_TYPES.has(e.type));
  const informationalEvents = sorted.filter((e) => !COMPANY_STATE_TYPES.has(e.type));

  // Initial state: initial name since founding, no owner, INDEPENDENT.
  const namePeriods: NamePeriod[] = [{ name: company.initialName, start: founded, end: null }];
  const ownershipPeriods: OwnershipPeriod[] = [];
  const statusPeriods: StatusPeriod[] = [{ status: "INDEPENDENT", start: founded, end: null }];

  // Each event closes the open period of the dimension it modifies and opens
  // a new one. The last period of each dimension stays open (end = null).
  const openName = () => namePeriods[namePeriods.length - 1];
  // With co-investment, several ownership periods can be open at once.
  const openOwnerships = (): OwnershipPeriod[] => ownershipPeriods.filter((p) => p.end === null);
  const closeAllOwnerships = (at: DatePoint) => {
    for (const p of ownershipPeriods) if (p.end === null) p.end = at;
  };
  const openStatus = () => statusPeriods[statusPeriods.length - 1];

  const setStatus = (status: CompanyStatus, at: DatePoint) => {
    if (openStatus().status === status) return; // no-op: same status continues
    openStatus().end = at;
    statusPeriods.push({ status, start: at, end: null });
  };

  for (const e of stateEvents) {
    const at = eventDate(e);
    switch (e.type) {
      case "COMPANY_RENAME": {
        if (!e.newName) break; // tolerated: malformed event is ignored at read time
        openName().end = at;
        namePeriods.push({ name: e.newName, start: at, end: null });
        break;
      }
      case "ACQUISITION": {
        // Full buyout: closes ALL previous owners (including co-investors) and
        // opens a single new ownership.
        closeAllOwnerships(at);
        ownershipPeriods.push({
          ownerCompanyId: e.acquirerCompanyId ?? null,
          ownerNameRaw: e.acquirerNameRaw ?? null,
          ownershipType: (e.outcome ?? "UNKNOWN") as AcquisitionOutcome,
          start: at,
          end: null,
        });
        setStatus(statusForOutcome(e.outcome), at);
        break;
      }
      case "CO_INVESTMENT": {
        // Adds a PARALLEL owner WITHOUT closing the existing ones: several
        // ownership periods stay open at once (consortium / co-investment).
        ownershipPeriods.push({
          ownerCompanyId: e.acquirerCompanyId ?? null,
          ownerNameRaw: e.acquirerNameRaw ?? null,
          ownershipType: (e.outcome ?? "INVESTOR_OWNED") as AcquisitionOutcome,
          start: at,
          end: null,
        });
        // Co-investment implies investor ownership (unless already absorbed etc.)
        if (["INDEPENDENT", "INVESTOR_UNKNOWN"].includes(openStatus().status)) {
          setStatus("INVESTOR_OWNED", at);
        }
        break;
      }
      case "ABSORPTION": {
        // An already-owned subsidiary is now fully absorbed: the brand
        // disappears. Close all current owners and reopen one ABSORBED period.
        const current = openOwnerships();
        const ref = current[current.length - 1];
        const ownerCompanyId = e.acquirerCompanyId ?? ref?.ownerCompanyId ?? null;
        const ownerNameRaw = e.acquirerNameRaw ?? ref?.ownerNameRaw ?? null;
        closeAllOwnerships(at);
        ownershipPeriods.push({
          ownerCompanyId,
          ownerNameRaw,
          ownershipType: "ABSORBED",
          start: at,
          end: null,
        });
        setStatus("ABSORBED", at);
        break;
      }
      case "DIVESTMENT": {
        // Ends ALL ownership WITHOUT opening a new one: back to independent.
        closeAllOwnerships(at);
        setStatus("INDEPENDENT", at);
        break;
      }
      case "MERGER": {
        setStatus("MERGED", at);
        break;
      }
      case "SHUTDOWN": {
        // The company ceases to exist: any ownership ends too.
        closeAllOwnerships(at);
        setStatus("DEFUNCT", at);
        break;
      }
    }
  }

  const currentOwners = openOwnerships();
  return {
    namePeriods,
    ownershipPeriods,
    statusPeriods,
    currentName: openName().name,
    currentOwner: currentOwners[currentOwners.length - 1] ?? null,
    currentOwners,
    currentStatus: openStatus().status,
    informationalEvents,
    stateEvents,
  };
}

// ---------------------------------------------------------------------------
// buildSolutionTimeline — same algorithm, solution dimensions
// ---------------------------------------------------------------------------

const SOLUTION_STATE_TYPES = new Set([
  "SOLUTION_RENAME",
  "SOLUTION_TRANSFER",
  "SOLUTION_LAUNCH",
  "SOLUTION_DISCONTINUED",
  "SOLUTION_INTEGRATED",
]);

export function buildSolutionTimeline(
  solution: SolutionInput,
  events: TimelineEventInput[]
): SolutionTimeline {
  // Launch date may be unknown: start = null renders as an allowed data gap.
  const launched: DatePoint | null =
    solution.launchYear != null
      ? { year: solution.launchYear, month: solution.launchMonth ?? null }
      : null;

  const sorted = sortEvents(events);
  const stateEvents = sorted.filter((e) => SOLUTION_STATE_TYPES.has(e.type));
  const informationalEvents = sorted.filter((e) => !SOLUTION_STATE_TYPES.has(e.type));

  const namePeriods: NamePeriod[] = [{ name: solution.initialName, start: launched, end: null }];
  const ownershipPeriods: SolutionOwnershipPeriod[] = [
    { ownerCompanyId: solution.initialCompanyId, start: launched, end: null },
  ];
  const statusPeriods: SolutionStatusPeriod[] = [{ status: "ACTIVE", start: launched, end: null }];

  const openName = () => namePeriods[namePeriods.length - 1];
  const openOwnership = () => ownershipPeriods[ownershipPeriods.length - 1];
  const openStatus = () => statusPeriods[statusPeriods.length - 1];

  // Host solution when integrated (last SOLUTION_INTEGRATED not undone by a relaunch)
  let integratedIntoSolutionId: string | null = null;

  for (const e of stateEvents) {
    const at = eventDate(e);
    switch (e.type) {
      case "SOLUTION_RENAME": {
        if (!e.newName) break;
        openName().end = at;
        namePeriods.push({ name: e.newName, start: at, end: null });
        break;
      }
      case "SOLUTION_TRANSFER": {
        if (!e.newOwnerCompanyId) break;
        openOwnership().end = at;
        ownershipPeriods.push({ ownerCompanyId: e.newOwnerCompanyId, start: at, end: null });
        break;
      }
      case "SOLUTION_LAUNCH": {
        const st = openStatus();
        if (st.status === "ACTIVE" && st.start === null) {
          // Launch date was unknown: the event provides it.
          st.start = at;
        } else if (st.status === "DISCONTINUED" || st.status === "INTEGRATED") {
          // Relaunch after a discontinuation or a re-extraction from a host.
          st.end = at;
          statusPeriods.push({ status: "ACTIVE", start: at, end: null });
          integratedIntoSolutionId = null;
        }
        break;
      }
      case "SOLUTION_DISCONTINUED": {
        const st = openStatus();
        if (st.status !== "DISCONTINUED") {
          st.end = at;
          statusPeriods.push({ status: "DISCONTINUED", start: at, end: null });
          integratedIntoSolutionId = null;
        }
        break;
      }
      case "SOLUTION_INTEGRATED": {
        if (!e.intoSolutionId) break; // malformed: ignored at read time
        const st = openStatus();
        if (st.status !== "INTEGRATED") {
          st.end = at;
          statusPeriods.push({ status: "INTEGRATED", start: at, end: null });
        }
        integratedIntoSolutionId = e.intoSolutionId;
        break;
      }
    }
  }

  return {
    namePeriods,
    ownershipPeriods,
    statusPeriods,
    currentName: openName().name,
    currentOwnerCompanyId: openOwnership().ownerCompanyId,
    currentStatus: openStatus().status,
    integratedIntoSolutionId,
    informationalEvents,
    stateEvents,
  };
}

// ---------------------------------------------------------------------------
// "As of" lookups — the direct payoff of the period model: the state of an
// entity at any past date is just "the period containing that date".
// ---------------------------------------------------------------------------

/**
 * The period containing `date`, or null (gap / before creation).
 * An unknown start (null) is treated as "always started"; an open end as "ongoing".
 */
export function periodAt<P extends Period>(periods: P[], date: DatePoint): P | null {
  for (const p of periods) {
    const started = p.start === null || compareDates(p.start, date) <= 0;
    const notEnded = p.end === null || compareDates(date, p.end) < 0;
    if (started && notEnded) return p;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Historical names — used by search: former names come from rename events,
// never from the Alias table.
// ---------------------------------------------------------------------------

/** All names a company/solution has had (initial + every rename), oldest first. */
export function allNames(timeline: { namePeriods: NamePeriod[] }): string[] {
  return timeline.namePeriods.map((p) => p.name);
}

/** Former names only (everything except the current one). */
export function formerNamePeriods(timeline: { namePeriods: NamePeriod[] }): NamePeriod[] {
  return timeline.namePeriods.filter((p) => p.end !== null);
}

// ---------------------------------------------------------------------------
// Event-sequence validation (used by the admin BEFORE saving an event).
//
// Because state is derived, validation only checks the COHERENCE of the event
// sequence. Returns errors (blocking) and warnings (non-blocking).
// ---------------------------------------------------------------------------

export interface SequenceIssue {
  level: "error" | "warning";
  /** i18n message key (translated by the UI) */
  code:
    | "eventBeforeCreation"
    | "duplicateDimensionDate"
    | "divestmentWithoutOwnership"
    | "absorptionWithoutOwnership"
    | "eventAfterShutdown";
  /** Ids of the offending events */
  eventIds: string[];
}

/** The state dimension an event type modifies (null = informational). */
function companyDimension(type: string): "name" | "ownership" | "status" | null {
  switch (type) {
    case "COMPANY_RENAME":
      return "name";
    case "ACQUISITION":
    case "ABSORPTION":
    case "DIVESTMENT":
      return "ownership";
    case "MERGER":
    case "SHUTDOWN":
      return "status";
    default:
      return null;
  }
}

function solutionDimension(type: string): "name" | "ownership" | "status" | null {
  switch (type) {
    case "SOLUTION_RENAME":
      return "name";
    case "SOLUTION_TRANSFER":
      return "ownership";
    case "SOLUTION_LAUNCH":
    case "SOLUTION_DISCONTINUED":
    case "SOLUTION_INTEGRATED":
      return "status";
    default:
      return null;
  }
}

function findDuplicateDimensionDates(
  events: TimelineEventInput[],
  dimensionOf: (type: string) => string | null
): SequenceIssue[] {
  const issues: SequenceIssue[] = [];
  const seen = new Map<string, TimelineEventInput>(); // "dimension|year|month" -> first event
  for (const e of sortEvents(events)) {
    const dim = dimensionOf(e.type);
    if (!dim) continue;
    const key = `${dim}|${e.year}|${e.month ?? ""}`;
    const first = seen.get(key);
    if (first) {
      issues.push({ level: "error", code: "duplicateDimensionDate", eventIds: [first.id, e.id] });
    } else {
      seen.set(key, e);
    }
  }
  return issues;
}

export function validateCompanyEvents(
  company: CompanyInput,
  events: TimelineEventInput[]
): SequenceIssue[] {
  const issues: SequenceIssue[] = [];
  const founded: DatePoint = { year: company.foundedYear, month: company.foundedMonth ?? null };
  const sorted = sortEvents(events);

  // 1. No event before the company's creation.
  for (const e of sorted) {
    if (isBefore(eventDate(e), founded)) {
      issues.push({ level: "error", code: "eventBeforeCreation", eventIds: [e.id] });
    }
  }

  // 2. Two events modifying the same dimension at the exact same date.
  issues.push(...findDuplicateDimensionDates(events, companyDimension));

  // 3. DIVESTMENT / ABSORPTION without an ongoing ownership at that date.
  let owned = false;
  for (const e of sorted) {
    if (e.type === "ACQUISITION" || e.type === "CO_INVESTMENT") owned = true;
    else if (e.type === "DIVESTMENT") {
      if (!owned) issues.push({ level: "error", code: "divestmentWithoutOwnership", eventIds: [e.id] });
      owned = false;
    } else if (e.type === "ABSORPTION") {
      // Absorption presupposes an existing ownership; the company stays owned
      // (now fully absorbed) so `owned` remains true.
      if (!owned) issues.push({ level: "error", code: "absorptionWithoutOwnership", eventIds: [e.id] });
    } else if (e.type === "SHUTDOWN") owned = false;
  }

  // 4. Event after a SHUTDOWN: warning only (non-blocking).
  const shutdown = sorted.find((e) => e.type === "SHUTDOWN");
  if (shutdown) {
    const shutdownAt = eventDate(shutdown);
    for (const e of sorted) {
      if (e !== shutdown && isBefore(shutdownAt, eventDate(e))) {
        issues.push({ level: "warning", code: "eventAfterShutdown", eventIds: [e.id] });
      }
    }
  }

  return issues;
}

export function validateSolutionEvents(
  solution: SolutionInput,
  events: TimelineEventInput[]
): SequenceIssue[] {
  const issues: SequenceIssue[] = [];
  const sorted = sortEvents(events);

  // 1. No event before the solution's launch (when the launch date is known).
  if (solution.launchYear != null) {
    const launched: DatePoint = { year: solution.launchYear, month: solution.launchMonth ?? null };
    for (const e of sorted) {
      if (isBefore(eventDate(e), launched)) {
        issues.push({ level: "error", code: "eventBeforeCreation", eventIds: [e.id] });
      }
    }
  }

  // 2. Same-dimension duplicates.
  issues.push(...findDuplicateDimensionDates(events, solutionDimension));

  return issues;
}
