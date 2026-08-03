// =============================================================================
// Zod schemas — single source of validation for BOTH client forms and API
// routes (spec security requirement #1: never trust the client).
// =============================================================================
import { z } from "zod";
import {
  COMPANY_TYPES,
  EVENT_TYPES,
  EVENT_IMPORTANCES,
  ACQUISITION_OUTCOMES,
  TAG_FAMILIES,
  SCOPE_CATEGORIES,
} from "@/lib/constants";

// --- Shared pieces -----------------------------------------------------------

const currentYear = new Date().getFullYear();

export const yearSchema = z.coerce
  .number()
  .int()
  .min(1800, "yearTooOld")
  .max(currentYear + 1, "yearInFuture");

export const monthSchema = z.coerce.number().int().min(1).max(12).nullable().optional();

const trimmed = (max = 500) => z.string().trim().min(1).max(max);
const optionalTrimmed = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const countryCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "invalidCountry");

// Website URL — tolerant: a bare domain ("acme.com") is accepted and normalized
// to https://acme.com; empty → null. (An LLM-proposed or hand-typed bare domain
// must not make a company un-saveable.)
const optionalUrl = z
  .preprocess((v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    if (!t) return null;
    return /^https?:\/\//i.test(t) ? t : `https://${t}`;
  }, z.string().url().max(500).nullable())
  .optional();

// Logo — a URL OR a base64 data: URI (uploaded logos). Must allow large values,
// otherwise a company with an uploaded logo (data URI) can't be re-saved.
const optionalLogo = z
  .preprocess((v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    return t === "" ? null : t;
  }, z.string().max(2_000_000).refine((v) => /^(https?:|data:)/i.test(v), "invalidLogo").nullable())
  .optional();

// --- Company -------------------------------------------------------------------

export const companySchema = z.object({
  initialName: trimmed(200),
  types: z.array(z.enum(COMPANY_TYPES)).min(1, "typeRequired"),
  foundedYear: yearSchema.nullable().optional().or(z.literal("").transform(() => null)),
  foundedMonth: monthSchema,
  country: countryCode,
  originCountry: countryCode.nullable().optional().or(z.literal("").transform(() => null)),
  descriptionFr: optionalTrimmed(10_000),
  descriptionEn: optionalTrimmed(10_000),
  website: optionalUrl,
  logoUrl: optionalLogo,
});
export type CompanyInput = z.infer<typeof companySchema>;

// --- Solution --------------------------------------------------------------------

export const solutionSchema = z.object({
  initialName: trimmed(200),
  initialCompanyId: z.string().min(1),
  descriptionFr: optionalTrimmed(10_000),
  descriptionEn: optionalTrimmed(10_000),
  features: optionalTrimmed(10_000),
  launchYear: yearSchema.nullable().optional(),
  launchMonth: monthSchema,
  website: optionalUrl,
  tagIds: z.array(z.string()).optional(),
});
export type SolutionInput = z.infer<typeof solutionSchema>;

// --- Tag --------------------------------------------------------------------------

export const tagSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, "invalidSlug")
    .max(80),
  family: z.enum(TAG_FAMILIES),
  labelFr: trimmed(120),
  labelEn: trimmed(120),
  descriptionFr: optionalTrimmed(500),
  descriptionEn: optionalTrimmed(500),
  category: z.enum(SCOPE_CATEGORIES).nullable().optional().or(z.literal("").transform(() => null)),
});
export type TagInput = z.infer<typeof tagSchema>;

// --- Event ------------------------------------------------------------------------
// A discriminated union would be heavy for 11 types; instead: a base schema +
// a refinement that enforces the per-type required fields (spec table).

const eventBase = z.object({
  type: z.enum(EVENT_TYPES),
  year: yearSchema,
  month: monthSchema,
  importance: z.enum(EVENT_IMPORTANCES).optional().default("MINOR").or(z.literal("").transform(() => "MINOR" as const)),
  descriptionFr: optionalTrimmed(10_000),
  descriptionEn: optionalTrimmed(10_000),
  url1: optionalUrl,
  url2: optionalUrl,
  subjectCompanyId: z.string().nullable().optional(),
  subjectSolutionId: z.string().nullable().optional(),
  newName: optionalTrimmed(200),
  acquirerCompanyId: z.string().nullable().optional().or(z.literal("").transform(() => null)),
  acquirerNameRaw: optionalTrimmed(200),
  acquiredNameRaw: optionalTrimmed(200),
  parentCompanyId: z.string().nullable().optional().or(z.literal("").transform(() => null)),
  outcome: z.enum(ACQUISITION_OUTCOMES).nullable().optional().or(z.literal("").transform(() => null)),
  withCompanyId: z.string().nullable().optional().or(z.literal("").transform(() => null)),
  newOwnerCompanyId: z.string().nullable().optional().or(z.literal("").transform(() => null)),
  intoSolutionId: z.string().nullable().optional().or(z.literal("").transform(() => null)),
  amount: z.coerce.number().positive().nullable().optional(),
  round: optionalTrimmed(80),
  note: optionalTrimmed(500),
  fromCountry: countryCode.nullable().optional().or(z.literal("").transform(() => null)),
  newCountry: countryCode.nullable().optional().or(z.literal("").transform(() => null)),
  newCity: optionalTrimmed(120),
});

const COMPANY_SUBJECT_TYPES = new Set([
  "COMPANY_RENAME",
  "ACQUISITION",
  "CO_INVESTMENT",
  "ABSORPTION",
  "DIVESTMENT",
  "MERGER",
  "SHUTDOWN",
  "FUNDING",
  "HQ_RELOCATION",
  "SPINOFF",
  "IPO",
  "DELISTING",
]);
const SOLUTION_SUBJECT_TYPES = new Set([
  "SOLUTION_RENAME",
  "SOLUTION_TRANSFER",
  "SOLUTION_LAUNCH",
  "SOLUTION_DISCONTINUED",
  "SOLUTION_INTEGRATED",
]);

export const eventSchema = eventBase.superRefine((e, ctx) => {
  const fail = (path: string, message: string) =>
    ctx.addIssue({ code: "custom", path: [path], message });

  // Subject coherence
  if (COMPANY_SUBJECT_TYPES.has(e.type) && !e.subjectCompanyId)
    fail("subjectCompanyId", "subjectCompanyRequired");
  if (SOLUTION_SUBJECT_TYPES.has(e.type) && !e.subjectSolutionId)
    fail("subjectSolutionId", "subjectSolutionRequired");
  if (e.type === "OTHER" && !e.subjectCompanyId && !e.subjectSolutionId)
    fail("subjectCompanyId", "subjectRequired");

  // Per-type required fields
  switch (e.type) {
    case "COMPANY_RENAME":
    case "SOLUTION_RENAME":
      if (!e.newName) fail("newName", "newNameRequired");
      break;
    case "ACQUISITION":
      // Acquirer-centric record (target not in the base): the subject IS the
      // acquirer and the target is free-text — no acquirer/outcome needed.
      if (e.acquiredNameRaw) break;
      if (!e.acquirerCompanyId && !e.acquirerNameRaw)
        fail("acquirerCompanyId", "acquirerRequired");
      if (!e.outcome) fail("outcome", "outcomeRequired");
      break;
    case "SPINOFF":
      if (!e.parentCompanyId) fail("parentCompanyId", "parentRequired");
      break;
    case "CO_INVESTMENT":
      if (!e.acquirerCompanyId && !e.acquirerNameRaw)
        fail("acquirerCompanyId", "acquirerRequired");
      break;
    case "MERGER":
      if (!e.withCompanyId) fail("withCompanyId", "withCompanyRequired");
      break;
    case "HQ_RELOCATION":
      if (!e.newCountry) fail("newCountry", "newCountryRequired");
      break;
    case "SOLUTION_TRANSFER":
      if (!e.newOwnerCompanyId) fail("newOwnerCompanyId", "newOwnerRequired");
      break;
    case "SOLUTION_INTEGRATED":
      if (!e.intoSolutionId) fail("intoSolutionId", "intoSolutionRequired");
      // A solution cannot be integrated into itself
      if (e.intoSolutionId && e.intoSolutionId === e.subjectSolutionId)
        fail("intoSolutionId", "intoSolutionSelf");
      break;
  }
});
export type EventInput = z.infer<typeof eventSchema>;

// --- Revenue -------------------------------------------------------------------------

export const revenueSchema = z.object({
  companyId: z.string().min(1),
  year: yearSchema,
  amount: z.coerce.number().nonnegative(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "invalidCurrency"),
  source: optionalTrimmed(300),
});
export type RevenueInput = z.infer<typeof revenueSchema>;

// --- Company research bundle (Phase 2 on-demand LLM analysis) -------------------------
// One proposal carrying a company + its solutions + its M&A events, linked by
// name and applied atomically — so a not-yet-existing company AND events about
// it can be proposed together. Lenient (tolerates messy LLM output); applyProposal
// re-validates each entity with its real schema.
// Strict-but-forgiving pieces for LLM bundles: a 2-letter ISO code or null
// (drops "USA", "" …), and a valid URL or null (normalizes bare domains, drops
// junk). This guarantees applied companies/events never carry values that would
// later make them un-editable against the strict entity schemas.
const upper2 = z
  .preprocess((v) => (typeof v === "string" ? v.trim().toUpperCase() : v), z.string().regex(/^[A-Z]{2}$/).nullable())
  .optional()
  .catch(null);
const looseUrl = z
  .preprocess((v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    if (!t) return null;
    return /^https?:\/\//i.test(t) ? t : `https://${t}`;
  }, z.string().url().max(500).nullable())
  .optional()
  .catch(null);

// Exported per-part so callers (company-research) can validate each item on its
// own and DROP the bad ones, instead of letting one malformed event void the
// whole bundle (which used to fall back to raw, un-coerced data and crash on
// insert).
export const bundleCompanySchema = z.object({
  initialName: trimmed(200),
  existingId: z.string().nullable().optional(),
  types: z.array(z.enum(COMPANY_TYPES)).optional(),
  foundedYear: yearSchema.nullable().optional().or(z.literal("").transform(() => null)),
  foundedMonth: monthSchema,
  country: upper2,
  originCountry: upper2,
  descriptionFr: optionalTrimmed(10_000),
  descriptionEn: optionalTrimmed(10_000),
  website: looseUrl,
});

export const bundleSolutionSchema = z.object({
  initialName: trimmed(200),
  descriptionFr: optionalTrimmed(10_000),
  descriptionEn: optionalTrimmed(10_000),
  launchYear: yearSchema.nullable().optional().or(z.literal("").transform(() => null)),
  website: looseUrl,
  tags: z.array(z.string()).optional(),
});

export const bundleEventSchema = z.object({
  type: z.enum(EVENT_TYPES),
  year: yearSchema,
  month: monthSchema,
  importance: z.enum(EVENT_IMPORTANCES).nullable().optional().or(z.literal("").transform(() => null)),
  role: z.enum(["subject", "acquirer"]).optional(), // bundle company = subject or acquirer?
  counterpartyName: optionalTrimmed(200), // the other company involved
  outcome: z.enum(ACQUISITION_OUTCOMES).nullable().optional().or(z.literal("").transform(() => null)),
  amount: z.coerce.number().positive().nullable().optional(),
  round: optionalTrimmed(80),
  newName: optionalTrimmed(200),
  newCountry: upper2,
  note: optionalTrimmed(500),
  descriptionFr: optionalTrimmed(10_000),
  descriptionEn: optionalTrimmed(10_000),
  url1: looseUrl,
  url2: looseUrl,
});

export const bundleSchema = z.object({
  company: bundleCompanySchema,
  solutions: z.array(bundleSolutionSchema).optional(),
  events: z.array(bundleEventSchema).optional(),
});
export type BundleInput = z.infer<typeof bundleSchema>;

// --- Alias ----------------------------------------------------------------------------

export const aliasSchema = z
  .object({
    name: trimmed(200),
    companyId: z.string().nullable().optional(),
    solutionId: z.string().nullable().optional(),
  })
  .refine((a) => Boolean(a.companyId) !== Boolean(a.solutionId), {
    message: "exactlyOneParent",
    path: ["companyId"],
  });
export type AliasInput = z.infer<typeof aliasSchema>;

// --- Password change ------------------------------------------------------------------

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "required"),
    newPassword: z.string().min(10, "tooShort").max(200, "tooLong"),
    confirmPassword: z.string().min(1, "required"),
  })
  .refine((p) => p.newPassword === p.confirmPassword, {
    message: "mismatch",
    path: ["confirmPassword"],
  })
  .refine((p) => p.newPassword !== p.currentPassword, {
    message: "sameAsCurrent",
    path: ["newPassword"],
  });
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;

// --- First-run admin setup ------------------------------------------------------------

export const setupSchema = z.object({
  username: z.string().trim().min(3, "usernameTooShort").max(100),
  password: z.string().min(10, "tooShort").max(200),
});
export type SetupInput = z.infer<typeof setupSchema>;

// --- Proposal submission envelope -----------------------------------------------------
// The `payload` is validated separately against the entity's own schema
// (see lib/proposals.ts) since it depends on entityType.

export const proposalSubmitSchema = z.object({
  kind: z.enum(["CREATE", "UPDATE"]),
  entityType: z.enum(["Company", "Solution", "Event", "Tag"]),
  targetId: z.string().nullable().optional(),
  payload: z.unknown(),
  note: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
export type ProposalSubmitInput = z.infer<typeof proposalSubmitSchema>;
