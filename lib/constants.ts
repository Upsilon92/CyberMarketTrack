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
  "DIVESTMENT", // ends ownership (back to INDEPENDENT) -> note
  "MERGER", // company becomes MERGED         -> withCompanyId
  "SHUTDOWN", // company becomes DEFUNCT
  "SOLUTION_RENAME", // changes solution name          -> newName
  "SOLUTION_TRANSFER", // changes solution vendor        -> newOwnerCompanyId
  "SOLUTION_LAUNCH", // solution becomes active
  "SOLUTION_DISCONTINUED", // solution is discontinued
  "FUNDING", // informational only             -> amount, round
  "OTHER", // informational only
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

// Event types that affect a company's derived state
export const COMPANY_EVENT_TYPES: EventType[] = [
  "COMPANY_RENAME",
  "ACQUISITION",
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
];

// Purely informational event types (displayed, no state effect)
export const INFORMATIONAL_EVENT_TYPES: EventType[] = ["FUNDING", "OTHER"];

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
  "SUBSIDIARY",
  "ABSORBED",
  "MERGED",
  "DEFUNCT",
] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

// --- Derived solution statuses --------------------------------------------------
export const SOLUTION_STATUSES = ["ACTIVE", "DISCONTINUED"] as const;
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
