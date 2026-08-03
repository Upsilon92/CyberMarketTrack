// =============================================================================
// Centralized, ON-DEMAND LLM analysis driven by an explicit selection (from
// /admin/llm) — companies, solutions or events. Each analyzed entity produces
// an AUTO proposal to review (nothing is applied directly). Companies may also
// be given by name (not yet in the base) → a CREATE proposal.
//
// Throttled for free-tier rate limits, back-off + retry on 429, token counting,
// and NDJSON progress events for the admin UI.
// =============================================================================
import { prisma } from "@/lib/prisma";
import { researchCompany } from "@/lib/company-research";
import { researchSolution } from "@/lib/solution-research";
import { researchEvent } from "@/lib/event-research";
import { loadLlmConfig, llmHealthCheck, addLlmUsage, type LlmConfig, type TokenUsage } from "@/lib/llm";

const DELAY_MS = Number(process.env.LLM_BATCH_DELAY_MS) || 1500;
const MAX_RETRIES_429 = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isRateLimited = (e: unknown) => /\b429\b/.test((e as Error)?.message ?? "");

export type AnalyzeType = "company" | "solution" | "event";

export interface AnalyzeInput {
  type: AnalyzeType;
  ids: string[];
  newNames?: string[]; // company type only: names not (yet) in the base
}

export interface AnalyzeReport {
  ok: boolean;
  skipped?: string;
  llm: string;
  total: number;
  processed: number;
  proposalsCreated: number;
  empty: number;
  errors: number;
  usage: TokenUsage;
}

type ItemOutcome = "proposed" | "empty" | "error";

export type AnalyzeProgress =
  | { type: "start"; total: number; online: boolean; detail: string }
  | { type: "skipped"; detail: string }
  | { type: "item"; index: number; total: number; label: string; outcome: ItemOutcome; detail?: string; usage: TokenUsage }
  | { type: "done"; report: AnalyzeReport };

interface Work {
  label: string;
  run: () => Promise<{ outcome: ItemOutcome; detail?: string; usage: TokenUsage }>;
}

export async function analyzeEntities(
  input: AnalyzeInput,
  onProgress?: (e: AnalyzeProgress) => void,
  cfgArg?: LlmConfig
): Promise<AnalyzeReport> {
  const emit = (e: AnalyzeProgress) => {
    try {
      onProgress?.(e);
    } catch {
      /* broken client stream must not abort the run */
    }
  };

  const cfg = cfgArg ?? (await loadLlmConfig());
  const health = await llmHealthCheck(cfg);
  const usage: TokenUsage = { prompt: 0, completion: 0, total: 0 };
  const report: AnalyzeReport = {
    ok: health.ok, llm: health.detail, total: 0, processed: 0,
    proposalsCreated: 0, empty: 0, errors: 0, usage,
  };
  if (!health.ok) {
    report.skipped = health.detail;
    emit({ type: "skipped", detail: health.detail });
    return report;
  }

  const addUsage = async (u: TokenUsage) => {
    await addLlmUsage(u);
    usage.prompt += u.prompt;
    usage.completion += u.completion;
    usage.total += u.total;
  };

  const work: Work[] = [];

  if (input.type === "company") {
    const rows = input.ids.length
      ? await prisma.company.findMany({ where: { id: { in: input.ids } }, select: { id: true, initialName: true } })
      : [];
    for (const c of rows) {
      work.push({
        label: c.initialName,
        run: async () => {
          const res = await researchCompany(c.initialName, c.id, cfg);
          await addUsage(res.usage);
          const b = res.bundle;
          const co = b.company ?? {};
          const has = !!(co.descriptionFr || co.descriptionEn || co.country || co.foundedYear || co.website || co.originCountry);
          if (!(b.events?.length || b.solutions?.length || has)) return { outcome: "empty", usage: res.usage };
          await createBundleProposal(c.initialName, c.id, b, res);
          await prisma.company.update({ where: { id: c.id }, data: { lastAnalyzedAt: new Date() } }).catch(() => {});
          return { outcome: "proposed", detail: `${b.events?.length ?? 0} évén. · ${b.solutions?.length ?? 0} sol.`, usage: res.usage };
        },
      });
    }
    for (const name of input.newNames ?? []) {
      const n = name.trim();
      if (!n) continue;
      work.push({
        label: n,
        run: async () => {
          const res = await researchCompany(n, null, cfg);
          await addUsage(res.usage);
          await createBundleProposal(n, null, res.bundle, res);
          return { outcome: "proposed", detail: `${res.bundle.events?.length ?? 0} évén. · ${res.bundle.solutions?.length ?? 0} sol.`, usage: res.usage };
        },
      });
    }
  } else if (input.type === "solution") {
    const sols = await prisma.solution.findMany({ where: { id: { in: input.ids } }, select: { id: true, initialName: true } });
    for (const s of sols) {
      work.push({
        label: s.initialName,
        run: async () => {
          const res = await researchSolution(s.id, cfg);
          await addUsage(res.usage);
          if (!res.changed) return { outcome: "empty", usage: res.usage };
          await prisma.proposal.create({
            data: {
              kind: "UPDATE", entityType: "Solution", targetId: s.id,
              payload: JSON.stringify(res.payload),
              note: `[Analyse LLM] ${res.label} — ${cfg.provider}:${cfg.model}`,
              origin: "AUTO", status: "PENDING",
            },
          });
          return { outcome: "proposed", usage: res.usage };
        },
      });
    }
  } else {
    const evs = await prisma.event.findMany({
      where: { id: { in: input.ids } },
      select: { id: true, type: true, year: true, subjectCompany: { select: { initialName: true } } },
    });
    for (const ev of evs) {
      const label = `${ev.type} ${ev.year}${ev.subjectCompany ? ` · ${ev.subjectCompany.initialName}` : ""}`;
      work.push({
        label,
        run: async () => {
          const res = await researchEvent(ev.id, cfg);
          await addUsage(res.usage);
          if (!res.changed) return { outcome: "empty", usage: res.usage };
          await prisma.proposal.create({
            data: {
              kind: "UPDATE", entityType: "Event", targetId: ev.id,
              payload: JSON.stringify(res.payload),
              note: `[Analyse LLM] ${res.label} — ${cfg.provider}:${cfg.model}`,
              origin: "AUTO", status: "PENDING",
            },
          });
          await prisma.event.update({ where: { id: ev.id }, data: { lastAnalyzedAt: new Date() } }).catch(() => {});
          return { outcome: "proposed", usage: res.usage };
        },
      });
    }
  }

  report.total = work.length;
  emit({ type: "start", total: work.length, online: true, detail: health.detail });

  let index = 0;
  for (const w of work) {
    index++;
    let outcome: ItemOutcome = "error";
    let detail: string | undefined;
    try {
      let attempt = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          const r = await w.run();
          outcome = r.outcome;
          detail = r.detail;
          break;
        } catch (e) {
          if (isRateLimited(e) && attempt < MAX_RETRIES_429) {
            attempt++;
            await sleep(5_000 * attempt);
            continue;
          }
          throw e;
        }
      }
      report.processed++;
      if (outcome === "proposed") report.proposalsCreated++;
      else if (outcome === "empty") report.empty++;
    } catch (e) {
      report.processed++;
      report.errors++;
      outcome = "error";
      detail = (e as Error).message.slice(0, 160);
    }
    emit({ type: "item", index, total: work.length, label: w.label, outcome, detail, usage: { ...usage } });
    if (index < work.length) await sleep(DELAY_MS);
  }

  emit({ type: "done", report });
  return report;
}

// Create a company Bundle proposal (shared shape with the RSS/enrich paths).
async function createBundleProposal(
  name: string,
  existingId: string | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bundle: any,
  res: { sources: { en: boolean; fr: boolean; news: number }; droppedEvents: number }
) {
  const srcBits = [
    res.sources.en && "Wikipedia EN",
    res.sources.fr && "Wikipedia FR",
    res.sources.news > 0 && `${res.sources.news} titres presse`,
  ].filter(Boolean);
  const note =
    `[Analyse LLM] ${name}` +
    (srcBits.length ? ` · sources : ${srcBits.join(", ")}` : " · aucune source") +
    (res.droppedEvents > 0 ? ` · ${res.droppedEvents} évén. non sourcé(s) écarté(s)` : "");
  await prisma.proposal.create({
    data: {
      kind: existingId ? "UPDATE" : "CREATE",
      entityType: "Bundle",
      targetId: existingId,
      payload: JSON.stringify(bundle),
      note,
      origin: "AUTO",
      status: "PENDING",
    },
  });
}
