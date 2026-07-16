// =============================================================================
// Server-side event coherence checking (used by the events API and the live
// preview endpoint). Loads the subject entity WITH its events, injects the
// candidate event, and runs the pure validators + timeline derivation from
// /lib/timeline.ts.
// =============================================================================
import { prisma } from "@/lib/prisma";
import {
  buildCompanyTimeline,
  buildSolutionTimeline,
  validateCompanyEvents,
  validateSolutionEvents,
  type CompanyTimeline,
  type SolutionTimeline,
  type SequenceIssue,
  type TimelineEventInput,
} from "@/lib/timeline";
import type { EventInput } from "@/lib/validation";

export interface CoherenceResult {
  errors: SequenceIssue[]; // blocking
  warnings: SequenceIssue[]; // informational
  /** Recalculated timeline INCLUDING the candidate (for the admin preview) */
  companyTimeline?: CompanyTimeline;
  solutionTimeline?: SolutionTimeline;
  subjectFound: boolean;
}

/**
 * Checks the full event sequence of the candidate's subject(s), with the
 * candidate injected (and, when editing, the previous version excluded).
 */
export async function checkEventCoherence(
  candidate: EventInput,
  excludeEventId?: string
): Promise<CoherenceResult> {
  const issues: SequenceIssue[] = [];
  const result: CoherenceResult = { errors: [], warnings: [], subjectFound: false };

  const candidateEvent: TimelineEventInput = {
    id: excludeEventId ?? "__candidate__",
    ...candidate,
  };

  if (candidate.subjectCompanyId) {
    const company = await prisma.company.findUnique({
      where: { id: candidate.subjectCompanyId },
      include: { subjectEvents: true },
    });
    if (company) {
      result.subjectFound = true;
      const events = [
        ...company.subjectEvents.filter((e) => e.id !== excludeEventId),
        candidateEvent,
      ];
      issues.push(...validateCompanyEvents(company, events));
      result.companyTimeline = buildCompanyTimeline(company, events);
    }
  }

  if (candidate.subjectSolutionId) {
    const solution = await prisma.solution.findUnique({
      where: { id: candidate.subjectSolutionId },
      include: { events: true },
    });
    if (solution) {
      result.subjectFound = true;
      const events = [...solution.events.filter((e) => e.id !== excludeEventId), candidateEvent];
      issues.push(...validateSolutionEvents(solution, events));
      result.solutionTimeline = buildSolutionTimeline(solution, events);
    }
  }

  // Only the issues involving the candidate block the save: pre-existing
  // problems in the base must not lock the editor.
  const involvesCandidate = (i: SequenceIssue) => i.eventIds.includes(candidateEvent.id);
  result.errors = issues.filter((i) => i.level === "error" && involvesCandidate(i));
  result.warnings = issues.filter((i) => i.level === "warning" && involvesCandidate(i));
  return result;
}

/** Human-readable summary for the audit log. */
export function eventSummary(e: EventInput, subjectName: string): string {
  switch (e.type) {
    case "COMPANY_RENAME":
    case "SOLUTION_RENAME":
      return `Renommage de ${subjectName} → ${e.newName} (${e.year})`;
    case "ACQUISITION":
      return `Rachat de ${subjectName} (${e.year}, ${e.outcome})`;
    case "CO_INVESTMENT":
      return `Co-investissement dans ${subjectName} (${e.year})`;
    case "ABSORPTION":
      return `Absorption totale de ${subjectName} (${e.year})`;
    case "DIVESTMENT":
      return `Reprise d'indépendance de ${subjectName} (${e.year})`;
    case "MERGER":
      return `Fusion de ${subjectName} (${e.year})`;
    case "SHUTDOWN":
      return `Fermeture de ${subjectName} (${e.year})`;
    case "SOLUTION_TRANSFER":
      return `Transfert de ${subjectName} (${e.year})`;
    case "SOLUTION_LAUNCH":
      return `Lancement de ${subjectName} (${e.year})`;
    case "SOLUTION_DISCONTINUED":
      return `Arrêt de ${subjectName} (${e.year})`;
    case "SOLUTION_INTEGRATED":
      return `Intégration de ${subjectName} dans une autre solution (${e.year})`;
    case "FUNDING":
      return `Levée de fonds de ${subjectName} (${e.year})`;
    default:
      return `Événement ${e.type} sur ${subjectName} (${e.year})`;
  }
}

/** Resolve the subject's initial name for audit summaries. */
export async function subjectName(e: EventInput): Promise<string> {
  if (e.subjectCompanyId) {
    const c = await prisma.company.findUnique({ where: { id: e.subjectCompanyId } });
    if (c) return c.initialName;
  }
  if (e.subjectSolutionId) {
    const s = await prisma.solution.findUnique({ where: { id: e.subjectSolutionId } });
    if (s) return s.initialName;
  }
  return "?";
}
