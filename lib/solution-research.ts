// =============================================================================
// LLM analysis of an existing SOLUTION: enriches its bilingual descriptions
// (low-hallucination — describing a known product, not asserting an event).
// Produces a Solution UPDATE proposal payload that FILLS ONLY empty fields
// (never overwrites curated data), for admin review.
// =============================================================================
import { prisma } from "@/lib/prisma";
import { loadLlmConfig, llmExtractJsonWithUsage, type LlmConfig, type TokenUsage } from "@/lib/llm";
import { solutionSchema } from "@/lib/validation";

const SYSTEM = `Tu es analyste du marché de la cybersécurité. On te donne le nom d'une SOLUTION/produit de cybersécurité et son éditeur. Rédige une description claire (1 à 3 phrases) en FR et en EN de ce que fait le produit.
- Ne décris QUE ce dont tu es sûr. Si le produit t'est totalement inconnu, mets null.
- Ne fabrique pas d'année ni de chiffre.
Réponds UNIQUEMENT par un objet JSON : {"descriptionFr": string|null, "descriptionEn": string|null, "website": string|null}`;

export interface SolutionResearchResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any; // solutionSchema-valid (existing values + filled-empty enrichment)
  label: string;
  changed: boolean; // did the enrichment actually add anything?
  usage: TokenUsage;
}

export async function researchSolution(
  solutionId: string,
  cfgArg?: LlmConfig
): Promise<SolutionResearchResult> {
  const cfg = cfgArg ?? (await loadLlmConfig());
  const s = await prisma.solution.findUnique({
    where: { id: solutionId },
    include: { initialCompany: { select: { initialName: true } }, tags: { select: { id: true } } },
  });
  if (!s) throw new Error("solution-not-found");

  const companyName = s.initialCompany?.initialName ?? "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: raw, usage } = await llmExtractJsonWithUsage<any>(
    SYSTEM,
    `Solution : "${s.initialName}"\nÉditeur : "${companyName}"`,
    cfg
  );

  const website = typeof raw?.website === "string" && /^https?:\/\//i.test(raw.website.trim()) ? raw.website.trim() : null;
  const descFr = typeof raw?.descriptionFr === "string" && raw.descriptionFr.trim() ? raw.descriptionFr.trim() : null;
  const descEn = typeof raw?.descriptionEn === "string" && raw.descriptionEn.trim() ? raw.descriptionEn.trim() : null;

  // Fill ONLY empty fields.
  const nextFr = s.descriptionFr ?? descFr;
  const nextEn = s.descriptionEn ?? descEn;
  const nextWebsite = s.website ?? website;
  const changed = (!s.descriptionFr && !!descFr) || (!s.descriptionEn && !!descEn) || (!s.website && !!website);

  const payload = {
    initialName: s.initialName,
    initialCompanyId: s.initialCompanyId,
    descriptionFr: nextFr,
    descriptionEn: nextEn,
    features: s.features,
    launchYear: s.launchYear,
    launchMonth: s.launchMonth,
    website: nextWebsite,
    tagIds: s.tags.map((t) => t.id),
  };
  // Re-validate so the proposal payload is always applicable.
  const parsed = solutionSchema.safeParse(payload);

  return {
    payload: parsed.success ? parsed.data : payload,
    label: s.initialName,
    changed,
    usage,
  };
}
