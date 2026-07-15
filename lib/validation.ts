// =============================================================================
// Zod schemas — single source of validation for BOTH client forms and API
// routes (spec security requirement #1: never trust the client).
// =============================================================================
import { z } from "zod";
import {
  COMPANY_TYPES,
  EVENT_TYPES,
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

const optionalUrl = z
  .string()
  .trim()
  .url()
  .max(500)
  .or(z.literal(""))
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

// --- Company -------------------------------------------------------------------

export const companySchema = z.object({
  initialName: trimmed(200),
  types: z.array(z.enum(COMPANY_TYPES)).min(1, "typeRequired"),
  foundedYear: yearSchema,
  foundedMonth: monthSchema,
  country: countryCode,
  originCountry: countryCode.nullable().optional().or(z.literal("").transform(() => null)),
  description: optionalTrimmed(10_000),
  website: optionalUrl,
  logoUrl: optionalUrl,
});
export type CompanyInput = z.infer<typeof companySchema>;

// --- Solution --------------------------------------------------------------------

export const solutionSchema = z.object({
  initialName: trimmed(200),
  initialCompanyId: z.string().min(1),
  description: optionalTrimmed(10_000),
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
  description: optionalTrimmed(10_000),
  subjectCompanyId: z.string().nullable().optional(),
  subjectSolutionId: z.string().nullable().optional(),
  newName: optionalTrimmed(200),
  acquirerCompanyId: z.string().nullable().optional().or(z.literal("").transform(() => null)),
  acquirerNameRaw: optionalTrimmed(200),
  outcome: z.enum(ACQUISITION_OUTCOMES).nullable().optional().or(z.literal("").transform(() => null)),
  withCompanyId: z.string().nullable().optional().or(z.literal("").transform(() => null)),
  newOwnerCompanyId: z.string().nullable().optional().or(z.literal("").transform(() => null)),
  amount: z.coerce.number().positive().nullable().optional(),
  round: optionalTrimmed(80),
  note: optionalTrimmed(500),
});

const COMPANY_SUBJECT_TYPES = new Set([
  "COMPANY_RENAME",
  "ACQUISITION",
  "DIVESTMENT",
  "MERGER",
  "SHUTDOWN",
  "FUNDING",
]);
const SOLUTION_SUBJECT_TYPES = new Set([
  "SOLUTION_RENAME",
  "SOLUTION_TRANSFER",
  "SOLUTION_LAUNCH",
  "SOLUTION_DISCONTINUED",
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
      if (!e.acquirerCompanyId && !e.acquirerNameRaw)
        fail("acquirerCompanyId", "acquirerRequired");
      if (!e.outcome) fail("outcome", "outcomeRequired");
      break;
    case "MERGER":
      if (!e.withCompanyId) fail("withCompanyId", "withCompanyRequired");
      break;
    case "SOLUTION_TRANSFER":
      if (!e.newOwnerCompanyId) fail("newOwnerCompanyId", "newOwnerRequired");
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
