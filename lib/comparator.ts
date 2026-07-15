// =============================================================================
// Comparator content model — versioned JSON stored in the Comparator table
// ({ "version": 1, ... }), documented in ARCHITECTURE.md.
//
// Custom criterion values are typed and FROZEN in the comparator; the enabled
// default attributes are NOT stored as values — they are recomputed from the
// base at every display (they stay in sync).
//
// The Zod schema below is the ONLY entry point for both saving and importing
// a comparator JSON (spec security requirement #10: strict validation before
// any write).
// =============================================================================
import { z } from "zod";

export const CELL_TYPES = ["boolean", "text", "rating", "number", "solution"] as const;
export type CellType = (typeof CELL_TYPES)[number];

// Default attributes recomputed from the base at display time
export const COMPANY_DEFAULT_ATTRIBUTES = [
  "logo",
  "country",
  "originCountry",
  "foundedYear",
  "lastRevenue",
  "acquisitionsMade",
  "acquiredBy",
  "tags",
] as const;
export const SOLUTION_DEFAULT_ATTRIBUTES = ["vendor", "tags", "launchYear"] as const;

// --- Cell values ---------------------------------------------------------------
// boolean criteria are tri-state: checked ("yes"), "partial" (distinct icon)
// or empty. solution cells reference a base solution (clickable, name derived)
// OR carry a free-text name for not-yet-referenced solutions.

const cellValueSchema = z.union([
  z.object({ t: z.literal("boolean"), v: z.enum(["yes", "partial"]) }),
  z.object({ t: z.literal("text"), v: z.string().max(200) }),
  z.object({ t: z.literal("rating"), v: z.number().int().min(1).max(5) }),
  z.object({ t: z.literal("number"), v: z.number() }),
  z.object({
    t: z.literal("solution"),
    solutionId: z.string().max(100).nullable().optional(),
    name: z.string().max(200).nullable().optional(),
  }),
]);
export type CellValue = z.infer<typeof cellValueSchema>;

// --- Content schema (version 1) ---------------------------------------------------

const itemSchema = z.object({
  kind: z.enum(["company", "solution"]),
  id: z.string().max(100),
});
export type ComparatorItem = z.infer<typeof itemSchema>;

const categorySchema = z.object({
  id: z.string().max(100),
  name: z.string().max(120),
});

const criterionSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(120),
  type: z.enum(CELL_TYPES),
  categoryId: z.string().max(100).nullable(),
});
export type ComparatorCriterion = z.infer<typeof criterionSchema>;

export const comparatorContentSchema = z.object({
  version: z.literal(1),
  orientation: z.enum(["itemsAsRows", "itemsAsColumns"]),
  items: z.array(itemSchema).max(100),
  defaultAttributes: z.array(z.string().max(50)).max(20),
  categories: z.array(categorySchema).max(50),
  criteria: z.array(criterionSchema).max(200),
  // key = "<kind>:<id>|<criterionId>"
  values: z.record(z.string().max(220), cellValueSchema),
});
export type ComparatorContent = z.infer<typeof comparatorContentSchema>;

export const comparatorSaveSchema = z.object({
  name: z.string().trim().min(1).max(200),
  content: comparatorContentSchema,
});

export function itemKey(item: ComparatorItem): string {
  return `${item.kind}:${item.id}`;
}

export function valueKey(item: ComparatorItem, criterionId: string): string {
  return `${itemKey(item)}|${criterionId}`;
}

export function emptyContent(): ComparatorContent {
  return {
    version: 1,
    orientation: "itemsAsRows",
    items: [],
    defaultAttributes: [],
    categories: [],
    criteria: [],
    values: {},
  };
}

// --- Solution-cell merging (functional coverage mode) -----------------------------
// Along the criteria axis of one item, contiguous cells holding the SAME
// solution merge into a single bar (colspan-like). The same solution may
// reappear on non-contiguous segments (separate bars).

export interface MergedCell {
  criterionIds: string[]; // contiguous span
  span: number;
  value: CellValue | null;
}

/** Groups an ordered list of criteria into merged spans for one item. */
export function mergeSolutionCells(
  orderedCriteria: ComparatorCriterion[],
  getValue: (criterionId: string) => CellValue | null
): MergedCell[] {
  const cells: MergedCell[] = [];
  for (const criterion of orderedCriteria) {
    const value = getValue(criterion.id);
    const prev = cells[cells.length - 1];
    const sameSolution =
      prev &&
      criterion.type === "solution" &&
      prev.value?.t === "solution" &&
      value?.t === "solution" &&
      // same referenced solution, or same free-text name
      ((value.solutionId && prev.value.solutionId === value.solutionId) ||
        (!value.solutionId && !prev.value.solutionId && !!value.name && prev.value.name === value.name));
    if (sameSolution) {
      prev.criterionIds.push(criterion.id);
      prev.span++;
    } else {
      cells.push({ criterionIds: [criterion.id], span: 1, value });
    }
  }
  return cells;
}

/**
 * Criteria ordered for display: grouped by category (categories in declared
 * order, then uncategorized criteria at the end, keeping insertion order).
 */
export function orderedCriteria(content: ComparatorContent): ComparatorCriterion[] {
  const byCategory: ComparatorCriterion[] = [];
  for (const cat of content.categories) {
    byCategory.push(...content.criteria.filter((c) => c.categoryId === cat.id));
  }
  byCategory.push(...content.criteria.filter((c) => !c.categoryId));
  return byCategory;
}
