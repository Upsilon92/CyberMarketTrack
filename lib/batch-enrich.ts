// =============================================================================
// Batch enrichment of EXISTING companies via the LLM (direct apply).
//
// For each selected company: research it (Wikipedia-grounded LLM bundle), then
// apply it CONSERVATIVELY (applyBundle dedup mode — fills only empty scalar
// fields, never duplicates solutions/events), stamp lastAnalyzedAt, and count
// the tokens the provider billed. Throttled to respect free-tier rate limits,
// with automatic back-off + retry on HTTP 429. Emits progress events so the
// admin UI can show a live bar + per-company log + a running token counter.
// =============================================================================
import { prisma } from "@/lib/prisma";
import { researchCompany } from "@/lib/company-research";
import { applyBundle } from "@/lib/proposals";
import { loadLlmConfig, llmHealthCheck, addLlmUsage, type LlmConfig, type TokenUsage } from "@/lib/llm";

const DEFAULT_DELAY_MS = Number(process.env.LLM_BATCH_DELAY_MS) || 1500;
const MAX_RETRIES_429 = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isRateLimited = (e: unknown) => /\b429\b/.test((e as Error)?.message ?? "");

export interface EnrichCounts {
  companiesUpdated: number;
  companiesCreated: number; // counterparties (acquirers/targets) created on the fly
  solutionsCreated: number;
  solutionsUpdated: number;
  eventsCreated: number;
  eventsUpdated: number;
}

export interface EnrichReport {
  ok: boolean;
  skipped?: string;
  llm: string;
  total: number;
  processed: number;
  enriched: number;
  errors: number;
  usage: TokenUsage;
  counts: EnrichCounts;
}

export type EnrichProgress =
  | { type: "start"; total: number; online: boolean; detail: string }
  | { type: "skipped"; detail: string }
  | {
      type: "item";
      index: number;
      total: number;
      company: string;
      outcome: "enriched" | "error";
      detail?: string;
      usage: TokenUsage; // running total so far
    }
  | { type: "done"; report: EnrichReport };

export interface EnrichOptions {
  limit: number;
  onlyMissing?: boolean;
  skipAnalyzed?: boolean; // exclude companies already analyzed (default true)
}

export async function enrichBatch(
  opts: EnrichOptions,
  onProgress?: (e: EnrichProgress) => void,
  cfgArg?: LlmConfig
): Promise<EnrichReport> {
  const emit = (e: EnrichProgress) => {
    try {
      onProgress?.(e);
    } catch {
      /* a broken client stream must not abort the batch */
    }
  };

  const cfg = cfgArg ?? (await loadLlmConfig());
  const health = await llmHealthCheck(cfg);

  const usage: TokenUsage = { prompt: 0, completion: 0, total: 0 };
  const counts: EnrichCounts = {
    companiesUpdated: 0, companiesCreated: 0,
    solutionsCreated: 0, solutionsUpdated: 0,
    eventsCreated: 0, eventsUpdated: 0,
  };
  const report: EnrichReport = {
    ok: health.ok,
    llm: health.detail,
    total: 0,
    processed: 0,
    enriched: 0,
    errors: 0,
    usage,
    counts,
  };

  if (!health.ok) {
    report.skipped = health.detail;
    emit({ type: "skipped", detail: health.detail });
    return report;
  }

  // Select companies. `skipAnalyzed` (default true) excludes already-analyzed
  // ones so successive runs move forward through the base without repeating
  // (a company is only stamped after a SUCCESSFUL enrichment, so failures are
  // retried next run). Optionally only those missing key data.
  const skipAnalyzed = opts.skipAnalyzed !== false;
  const filters: Record<string, unknown>[] = [];
  if (skipAnalyzed) filters.push({ lastAnalyzedAt: null });
  if (opts.onlyMissing)
    filters.push({
      OR: [{ descriptionFr: null }, { descriptionEn: null }, { country: "XX" }, { foundedYear: null }],
    });
  const where = filters.length ? { AND: filters } : {};
  const companies = await prisma.company.findMany({
    where,
    select: { id: true, initialName: true },
    orderBy: [{ lastAnalyzedAt: "asc" }, { createdAt: "asc" }],
    take: Math.max(1, Math.min(opts.limit, 1000)),
  });
  report.total = companies.length;
  emit({ type: "start", total: companies.length, online: true, detail: health.detail });

  let index = 0;
  for (const company of companies) {
    index++;
    try {
      // Research with retry/back-off on rate limiting (free-tier friendly).
      let attempt = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          const res = await researchCompany(company.initialName, company.id, cfg);
          await addLlmUsage(res.usage);
          usage.prompt += res.usage.prompt;
          usage.completion += res.usage.completion;
          usage.total += res.usage.total;

          const { stats } = await applyBundle(res.bundle, { dedup: true });
          counts.companiesUpdated += stats.companyUpdated;
          counts.companiesCreated += stats.companyCreated + stats.counterpartiesCreated;
          counts.solutionsCreated += stats.solutionsCreated;
          counts.solutionsUpdated += stats.solutionsUpdated;
          counts.eventsCreated += stats.eventsCreated;
          counts.eventsUpdated += stats.eventsUpdated;

          await prisma.company.update({
            where: { id: company.id },
            data: { lastAnalyzedAt: new Date() },
          });
          break;
        } catch (e) {
          if (isRateLimited(e) && attempt < MAX_RETRIES_429) {
            attempt++;
            await sleep(5_000 * attempt); // 5s, 10s, 15s
            continue;
          }
          throw e;
        }
      }

      report.processed++;
      report.enriched++;
      emit({
        type: "item",
        index,
        total: companies.length,
        company: company.initialName,
        outcome: "enriched",
        usage: { ...usage },
      });
    } catch (e) {
      report.processed++;
      report.errors++;
      emit({
        type: "item",
        index,
        total: companies.length,
        company: company.initialName,
        outcome: "error",
        detail: (e as Error).message.slice(0, 160),
        usage: { ...usage },
      });
    }

    // Throttle between companies to stay under the provider's rate limit.
    if (index < companies.length) await sleep(DEFAULT_DELAY_MS);
  }

  emit({ type: "done", report });
  return report;
}
