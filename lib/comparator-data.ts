// =============================================================================
// Server-side data for the comparator editor:
//  - the item catalog (companies + solutions with their DERIVED names and the
//    default-attribute values, recomputed from the base at every display)
//  - the tag-based template generators (checks matrix / coverage matrix)
// =============================================================================
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { loadMarket, ownerDisplayName, type Market } from "@/lib/queries";
import { formatDate, type Locale } from "@/lib/date";
import {
  emptyContent,
  valueKey,
  type ComparatorContent,
  type ComparatorItem,
} from "@/lib/comparator";
import type { Tag } from "@/lib/generated/prisma/client";

export interface CatalogItem {
  key: string; // "company:<id>" | "solution:<id>"
  kind: "company" | "solution";
  id: string;
  label: string; // derived current name
  logoUrl: string | null;
  country: string | null;
  originCountry: string | null;
  tagIds: string[];
  /** Preformatted display strings for the default attributes */
  attributes: Record<string, string>;
}

export interface ComparatorCatalog {
  companies: CatalogItem[];
  solutions: CatalogItem[];
}

/** Builds the full item catalog with localized, display-ready attributes. */
export async function buildCatalog(): Promise<ComparatorCatalog> {
  const locale = (await getLocale()) as Locale;
  const market = await loadMarket();

  const companies: CatalogItem[] = market.companies.map((c) => {
    // "Sociétés rachetées" : ACQUISITION events where c is the acquirer
    const acquisitions = market.companies
      .flatMap((target) =>
        target.subjectEvents
          .filter((e) => e.type === "ACQUISITION" && e.acquirerCompanyId === c.id)
          .map((e) => `${target.timeline.currentName} (${e.year})`)
      )
      .join(", ");
    // "Rachetée par" : last ACQUISITION on c
    const acquiredByEvent = [...c.subjectEvents]
      .filter((e) => e.type === "ACQUISITION")
      .sort((a, b) => a.year - b.year || (a.month ?? 0) - (b.month ?? 0))
      .pop();
    const acquiredBy = acquiredByEvent
      ? `${ownerDisplayName(market, acquiredByEvent.acquirerCompanyId, acquiredByEvent.acquirerNameRaw)} (${acquiredByEvent.year})`
      : "";
    const lastRevenue = c.revenues[c.revenues.length - 1];
    // Tags of the company's current solutions
    const ownedSolutions = market.solutions.filter(
      (s) => s.timeline.currentOwnerCompanyId === c.id
    );
    const tagLabels = [
      ...new Set(
        ownedSolutions.flatMap((s) => s.tags.map((t) => (locale === "fr" ? t.labelFr : t.labelEn)))
      ),
    ].join(", ");

    return {
      key: `company:${c.id}`,
      kind: "company" as const,
      id: c.id,
      label: c.timeline.currentName,
      logoUrl: c.logoUrl,
      country: c.country,
      originCountry: c.originCountry,
      tagIds: [...new Set(ownedSolutions.flatMap((s) => s.tags.map((t) => t.id)))],
      attributes: {
        foundedYear: String(c.foundedYear),
        lastRevenue: lastRevenue
          ? `${lastRevenue.amount.toLocaleString(locale)} M${lastRevenue.currency} (${lastRevenue.year})`
          : "",
        acquisitionsMade: acquisitions,
        acquiredBy,
        tags: tagLabels,
      },
    };
  });

  const solutions: CatalogItem[] = market.solutions.map((s) => ({
    key: `solution:${s.id}`,
    kind: "solution" as const,
    id: s.id,
    label: s.timeline.currentName,
    logoUrl: null,
    country: null,
    originCountry: null,
    tagIds: s.tags.map((t) => t.id),
    attributes: {
      vendor: ownerDisplayName(market, s.timeline.currentOwnerCompanyId),
      launchYear:
        s.launchYear != null
          ? formatDate({ year: s.launchYear, month: s.launchMonth }, locale)
          : "",
      tags: s.tags.map((t) => (locale === "fr" ? t.labelFr : t.labelEn)).join(", "),
    },
  }));

  const sort = (a: CatalogItem, b: CatalogItem) => a.label.localeCompare(b.label);
  return { companies: companies.sort(sort), solutions: solutions.sort(sort) };
}

// -----------------------------------------------------------------------------
// Template generation (spec: "comparateurs par défaut")
// Columns come from ANY tag family; SCOPE columns are grouped by category.
// -----------------------------------------------------------------------------

async function columnsFromFamily(family: string, locale: Locale) {
  const tScopeCat = await getTranslations("scopeCategories");
  const tags = await prisma.tag.findMany({ where: { family }, orderBy: { slug: "asc" } });
  const label = (t: Tag) => (locale === "fr" ? t.labelFr : t.labelEn);

  // SCOPE tags grouped by category -> one comparator category per group
  const categories: { id: string; name: string }[] = [];
  const criteria: { id: string; name: string; type: "boolean" | "solution"; categoryId: string | null; tag: Tag }[] = [];
  if (family === "SCOPE") {
    const cats = [...new Set(tags.map((t) => t.category).filter(Boolean))] as string[];
    for (const cat of cats) {
      categories.push({ id: `cat-${cat}`, name: tScopeCat(cat as Parameters<typeof tScopeCat>[0]) });
    }
    for (const tag of tags) {
      criteria.push({
        id: `tag-${tag.slug}`,
        name: label(tag),
        type: "boolean",
        categoryId: tag.category ? `cat-${tag.category}` : null,
        tag,
      });
    }
  } else {
    for (const tag of tags) {
      criteria.push({ id: `tag-${tag.slug}`, name: label(tag), type: "boolean", categoryId: null, tag });
    }
  }
  return { categories, criteria };
}

/**
 * Checks matrix: selected solutions as rows, tags of the chosen family as
 * columns, cells pre-checked when the solution carries the tag.
 */
export async function generateChecksTemplate(
  family: string,
  baseTagSlug: string | null,
  market: Market
): Promise<ComparatorContent> {
  const locale = (await getLocale()) as Locale;
  const { categories, criteria } = await columnsFromFamily(family, locale);

  const solutions = baseTagSlug
    ? market.solutions.filter((s) => s.tags.some((t) => t.slug === baseTagSlug))
    : market.solutions;

  const content = emptyContent();
  content.orientation = "itemsAsRows"; // checks matrix: solutions in rows, tags in columns
  content.items = solutions.map((s) => ({ kind: "solution" as const, id: s.id }));
  content.defaultAttributes = ["vendor"];
  content.categories = categories;
  content.criteria = criteria.map(({ tag: _tag, ...c }) => ({ ...c, type: "boolean" as const }));

  for (const s of solutions) {
    const item: ComparatorItem = { kind: "solution", id: s.id };
    for (const c of criteria) {
      if (s.tags.some((t) => t.id === c.tag.id)) {
        content.values[valueKey(item, c.id)] = { t: "boolean", v: "yes" };
      }
    }
  }
  return content;
}

/**
 * Coverage matrix: vendors as rows, tags of the chosen family as columns,
 * "solution" cells pre-filled with the vendor's solutions carrying each tag
 * (contiguous identical cells merge into coverage bars at render time).
 */
export async function generateCoverageTemplate(
  family: string,
  baseTagSlug: string | null,
  market: Market
): Promise<ComparatorContent> {
  const locale = (await getLocale()) as Locale;
  const { categories, criteria } = await columnsFromFamily(family, locale);

  const solutions = baseTagSlug
    ? market.solutions.filter((s) => s.tags.some((t) => t.slug === baseTagSlug))
    : market.solutions;
  const vendorIds = [...new Set(solutions.map((s) => s.timeline.currentOwnerCompanyId))];

  const content = emptyContent();
  content.orientation = "itemsAsRows"; // coverage matrix: vendors in rows, capabilities in columns
  content.items = vendorIds.map((id) => ({ kind: "company" as const, id }));
  content.defaultAttributes = ["logo", "country"];
  content.categories = categories;
  content.criteria = criteria.map(({ tag: _tag, ...c }) => ({ ...c, type: "solution" as const }));

  for (const vendorId of vendorIds) {
    const item: ComparatorItem = { kind: "company", id: vendorId };
    const vendorSolutions = solutions.filter((s) => s.timeline.currentOwnerCompanyId === vendorId);
    for (const c of criteria) {
      // First solution of this vendor covering the tag (one per cell)
      const covering = vendorSolutions.find((s) => s.tags.some((t) => t.id === c.tag.id));
      if (covering) {
        content.values[valueKey(item, c.id)] = {
          t: "solution",
          solutionId: covering.id,
          name: covering.timeline.currentName,
        };
      }
    }
  }
  return content;
}
