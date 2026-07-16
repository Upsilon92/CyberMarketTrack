// =============================================================================
// Shared enum-like constants.
//
// SQLite does not support native Prisma enums, so enum values live here as
// TypeScript unions, used both by the app code and by Zod validation schemas.
// This file is the single place where allowed values are defined.
// =============================================================================

// --- Company types (a company can have several) ------------------------------
export const COMPANY_TYPES = ["VENDOR", "SERVICE_PROVIDER", "INVESTMENT_FUND"] as const;
export type CompanyType = (typeof COMPANY_TYPES)[number];

// --- Event types --------------------------------------------------------------
export const EVENT_TYPES = [
  "COMPANY_RENAME", // changes company name           -> newName
  "ACQUISITION", // changes company owner          -> acquirerCompanyId/acquirerNameRaw, outcome
  "CO_INVESTMENT", // adds a PARALLEL owner without closing existing ones -> acquirerCompanyId/acquirerNameRaw, outcome
  "ABSORPTION", // an already-owned subsidiary is fully absorbed (brand disappears) -> acquirerCompanyId (defaults to current owner)
  "DIVESTMENT", // ends ownership (back to INDEPENDENT) -> note
  "MERGER", // company becomes MERGED         -> withCompanyId
  "SHUTDOWN", // company becomes DEFUNCT
  "SOLUTION_RENAME", // changes solution name          -> newName
  "SOLUTION_TRANSFER", // changes solution vendor        -> newOwnerCompanyId
  "SOLUTION_LAUNCH", // solution becomes active
  "SOLUTION_DISCONTINUED", // solution is discontinued
  "SOLUTION_INTEGRATED", // absorbed into another solution -> intoSolutionId
  "FUNDING", // informational only             -> amount, round
  "OTHER", // informational only
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

// Event types that affect a company's derived state
export const COMPANY_EVENT_TYPES: EventType[] = [
  "COMPANY_RENAME",
  "ACQUISITION",
  "CO_INVESTMENT",
  "ABSORPTION",
  "DIVESTMENT",
  "MERGER",
  "SHUTDOWN",
];

// Event types that affect a solution's derived state
export const SOLUTION_EVENT_TYPES: EventType[] = [
  "SOLUTION_RENAME",
  "SOLUTION_TRANSFER",
  "SOLUTION_LAUNCH",
  "SOLUTION_DISCONTINUED",
  "SOLUTION_INTEGRATED",
];

// Purely informational event types (displayed, no state effect)
export const INFORMATIONAL_EVENT_TYPES: EventType[] = ["FUNDING", "OTHER"];

// --- Event importance (news prioritization) ------------------------------------
export const EVENT_IMPORTANCES = ["MAJOR", "MEDIUM", "MINOR"] as const;
export type EventImportance = (typeof EVENT_IMPORTANCES)[number];

// --- Acquisition outcomes ------------------------------------------------------
export const ACQUISITION_OUTCOMES = [
  "INVESTOR_OWNED", // bought by a fund: org stays fully independent, only shareholding changes
  "AUTONOMOUS", // industrial buy: becomes a subsidiary but keeps its brand
  "ABSORBED", // absorbed/dissolved: brand disappears, tech & teams integrated
  "UNKNOWN",
] as const;
export type AcquisitionOutcome = (typeof ACQUISITION_OUTCOMES)[number];

// --- Derived company statuses (computed by /lib/timeline.ts — NEVER stored) ----
export const COMPANY_STATUSES = [
  "INDEPENDENT",
  "INVESTOR_OWNED",
  "INVESTOR_UNKNOWN", // owned following an acquisition whose nature is unknown
  "SUBSIDIARY",
  "ABSORBED",
  "MERGED",
  "DEFUNCT",
] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

// --- Derived solution statuses --------------------------------------------------
// INTEGRATED = absorbed into another solution (end of autonomous life), distinct
// from DISCONTINUED (simply stopped). Carries a link to the host solution.
export const SOLUTION_STATUSES = ["ACTIVE", "DISCONTINUED", "INTEGRATED"] as const;
export type SolutionStatus = (typeof SOLUTION_STATUSES)[number];

// --- Tag families ----------------------------------------------------------------
export const TAG_FAMILIES = ["SOLUTION_TYPE", "CAPABILITY", "SCOPE"] as const;
export type TagFamily = (typeof TAG_FAMILIES)[number];

// Grouping categories for SCOPE tags (used to group comparator columns)
export const SCOPE_CATEGORIES = ["LOCAL", "DIRECTORY", "IDENTITY_PROVIDER", "CLOUD", "SAAS"] as const;
export type ScopeCategory = (typeof SCOPE_CATEGORIES)[number];

// --- Audit log actions --------------------------------------------------------------
export const AUDIT_ACTIONS = ["CREATE", "UPDATE", "DELETE", "IMPORT", "RESTORE"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

// --- User roles (only ADMIN used in v1; kept for future RBAC) -------------------------
export const USER_ROLES = ["ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];
