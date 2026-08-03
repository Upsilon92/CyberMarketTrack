// =============================================================================
// Batch enrichment of EXISTING companies via the LLM — creates PROPOSALS to
// review (never touches the base directly).
//
// For each selected company: research it (Wikipedia + press grounded, with the
// anti-hallucination guardrail), then create ONE AUTO "Bundle" proposal for
// admin review, stamp lastAnalyzedAt (so re-runs skip it and don't pile up
// duplicate proposals), and count the tokens billed. Throttled for free-tier
// rate limits, with back-off + retry on HTTP 429. Emits progress events so the
// admin UI shows a live bar + per-company log + a running token counter.
// =============================================================================
import { prisma } from "@/lib/prisma";
import { researchCompany } from "@/lib/company-research";
import { loadLlmConfig, llmHealthCheck, addLlmUsage, type LlmConfig, type TokenUsage } from "@/lib/llm";

const DEFAULT_DELAY_MS = Number(process.env.LLM_BATCH_DELAY_MS) || 1500;
const MAX_RETRIES_429 = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isRateLimited = (e: unknown) => /\b429\b/.test((e as Error)?.message ?? "");

export interface EnrichCounts {
  proposals: number;
  eventsProposed: number;
  solutionsProposed: number;
}

export interface EnrichReport {
  ok: boolean;
  skipped?: string;
  llm: string;
  total: number;
  processed: number;
  proposalsCreated: number;
  errors: number;
  usage: TokenUsage;
  counts: EnrichCounts;
}

type ItemOutcome = "proposed" | "empty" | "error";

export type EnrichProgress =
  | { type: "start"; total: number; online: boolean; detail: string }
  | { type: "skipped"; detail: string }
  | {
      type: "item";
      index: number;
      total: number;
      company: string;
      outcome: ItemOutcome;
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
  const counts: EnrichCounts = { proposals: 0, eventsProposed: 0, solutionsProposed: 0 };
  const report: EnrichReport = {
    ok: health.ok,
    llm: health.detail,
    total: 0,
    processed: 0,
    proposalsCreated: 0,
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
  // ones so successive runs move forward without repeating (a company is stamped
  // as soon as its proposal is created, so no duplicate proposals; failures keep
  // lastAnalyzedAt null and are retried next run). Optionally only those missing
  // key data.
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
    let outcome: ItemOutcome = "error";
    let detail: string | undefined;
    try {
      let attempt = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          const res = await researchCompany(company.initialName, company.id, cfg);
          await addLlmUsage(res.usage);
          usage.prompt += res.usage.prompt;
          usage.completion += res.usage.completion;
          usage.total += res.usage.total;

          const b = res.bundle;
          const events = Array.isArray(b.events) ? b.events : [];
          const solutions = Array.isArray(b.solutions) ? b.solutions : [];
          const co = b.company ?? {};
          const hasCompanyData = !!(
            co.descriptionFr || co.descriptionEn || co.country || co.foundedYear || co.website || co.originCountry
          );

          if (!events.length && !solutions.length && !hasCompanyData) {
            outcome = "empty"; // nothing worth proposing
          } else {
            const srcBits = [
              res.sources.en && "Wikipedia EN",
              res.sources.fr && "Wikipedia FR",
              res.sources.news > 0 && `${res.sources.news} titres presse`,
            ].filter(Boolean);
            const note =
              `[Enrichissement LLM] ${company.initialName}` +
              (srcBits.length ? ` · sources : ${srcBits.join(", ")}` : "") +
              (res.droppedEvents > 0 ? ` · ${res.droppedEvents} évén. non sourcé(s) écarté(s)` : "");
            await prisma.proposal.create({
              data: {
                kind: "UPDATE",
                entityType: "Bundle",
                targetId: company.id,
                payload: JSON.stringify(b),
                note,
                origin: "AUTO",
                status: "PENDING",
              },
            });
            counts.proposals++;
            counts.eventsProposed += events.length;
            counts.solutionsProposed += solutions.length;
            outcome = "proposed";
            detail = `${events.length} évén. · ${solutions.length} sol.`;
          }

          // Stamp so re-runs skip this company (no duplicate proposals).
          await prisma.company.update({ where: { id: company.id }, data: { lastAnalyzedAt: new Date() } });
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
      if (outcome === "proposed") report.proposalsCreated++;
    } catch (e) {
      report.processed++;
      report.errors++;
      outcome = "error";
      detail = (e as Error).message.slice(0, 160);
    }

    emit({
      type: "item",
      index,
      total: companies.length,
      company: company.initialName,
      outcome,
      detail,
      usage: { ...usage },
    });

    // Throttle between companies to stay under the provider's rate limit.
    if (index < companies.length) await sleep(DEFAULT_DELAY_MS);
  }

  emit({ type: "done", report });
  return report;
}
