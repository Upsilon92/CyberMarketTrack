// =============================================================================
// Phase 2 — RSS → LLM → AUTO proposals.
//
// Pipeline (safe to run on any schedule):
//   1. Fetch the market-news RSS (lib/rss.ts).
//   2. Record every never-seen item as a FeedItem (backlog).
//   3. Health-check the configured LLM. If it's offline (e.g. the deported PC
//      is off), STOP gracefully — the backlog is processed on a later run.
//   4. For each pending item: ask the LLM to extract a structured M&A/funding
//      event, GATE out irrelevant headlines, resolve the companies against the
//      base, and create an AUTO Proposal for admin review.
// =============================================================================
import { prisma } from "@/lib/prisma";
import { getMarketNews } from "@/lib/rss";
import { getLlmConfig, llmHealthCheck, llmExtractJson, type LlmConfig } from "@/lib/llm";

const MAX_PER_RUN = Number(process.env.RSS_MAX_PER_RUN) || 12;
const MIN_CONFIDENCE = 0.55;

interface Extraction {
  relevant: boolean;
  eventType: "ACQUISITION" | "MERGER" | "FUNDING" | "IPO" | "RENAME" | null;
  acquired: string | null;
  acquirer: string | null;
  amount: number | null;
  year: number | null;
  confidence: number;
  summary: string;
}

const SYSTEM = `Tu es analyste du marché de la cybersécurité. On te donne le TITRE d'une actualité (flux Google News sur les fusions-acquisitions cyber). Détermine s'il décrit un ÉVÉNEMENT PERTINENT pour une base de connaissance du marché cyber : rachat (acquisition), fusion, levée de fonds, entrée en bourse, ou renommage d'un ÉDITEUR/société de cybersécurité.
Beaucoup de titres sont HORS-SUJET (opinions, listes « top 10 », conseils, sorties produit, tendances) : dans ce cas relevant=false.
N'invente aucune entreprise ni chiffre. Si le titre ne mentionne pas clairement un événement cyber concret, relevant=false.
Réponds UNIQUEMENT par un objet JSON:
{"relevant":bool,"eventType":"ACQUISITION"|"MERGER"|"FUNDING"|"IPO"|"RENAME"|null,"acquired":string|null,"acquirer":string|null,"amount":number|null,"year":number|null,"confidence":number,"summary":string}
- acquired = société rachetée / sujet ; acquirer = acheteur / investisseur.
- amount en millions USD si mentionné, sinon null. confidence entre 0 et 1. summary = une phrase en français.`;

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export interface AnalyzeReport {
  ok: boolean;
  skipped?: string; // reason when the LLM is offline
  llm: string;
  newItems: number;
  processed: number;
  proposalsCreated: number;
  notRelevant: number;
  errors: number;
}

export async function analyzeFeed(cfg: LlmConfig = getLlmConfig()): Promise<AnalyzeReport> {
  const health = await llmHealthCheck(cfg);

  // 1-2. Fetch + record backlog (even when the LLM is offline).
  const items = await getMarketNews();
  let newItems = 0;
  for (const it of items) {
    try {
      await prisma.feedItem.create({
        data: { url: it.link, title: it.title, source: it.source },
      });
      newItems++;
    } catch {
      /* unique(url) -> already seen, skip */
    }
  }

  const report: AnalyzeReport = {
    ok: health.ok,
    llm: health.detail,
    newItems,
    processed: 0,
    proposalsCreated: 0,
    notRelevant: 0,
    errors: 0,
  };

  // 3. LLM offline -> stop gracefully; the backlog waits.
  if (!health.ok) {
    report.skipped = health.detail;
    return report;
  }

  // 4. Process the pending backlog (oldest first, capped per run).
  const pending = await prisma.feedItem.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: MAX_PER_RUN,
  });

  const companies = await prisma.company.findMany({ select: { id: true, initialName: true } });
  const byName = new Map(companies.map((c) => [norm(c.initialName), c.id]));
  const resolve = (name: string | null): string | null => {
    if (!name) return null;
    const n = norm(name);
    if (byName.has(n)) return byName.get(n)!;
    // loose contains match (e.g. "Palo Alto" vs "Palo Alto Networks")
    for (const [k, id] of byName) if (k.includes(n) || n.includes(k)) return id;
    return null;
  };

  for (const item of pending) {
    try {
      const ex = await llmExtractJson<Extraction>(SYSTEM, item.title, cfg);
      report.processed++;

      const relevant = !!ex.relevant && (ex.confidence ?? 0) >= MIN_CONFIDENCE && !!ex.eventType;
      if (!relevant) {
        await prisma.feedItem.update({
          where: { id: item.id },
          data: { status: "PROCESSED", relevant: false, processedAt: new Date() },
        });
        report.notRelevant++;
        continue;
      }

      const year = ex.year ?? (item.createdAt ? item.createdAt.getFullYear() : new Date().getFullYear());
      const subjectId = resolve(ex.acquired);
      const acquirerId = resolve(ex.acquirer);
      const note = `[AUTO] ${ex.summary}\nSource : ${item.url}`;

      let proposal;
      if (subjectId) {
        // The acquired company exists -> propose an Event on it.
        const payload: Record<string, unknown> = {
          type: ex.eventType === "IPO" ? "IPO" : ex.eventType === "MERGER" ? "MERGER"
            : ex.eventType === "FUNDING" ? "FUNDING" : ex.eventType === "RENAME" ? "COMPANY_RENAME"
            : "ACQUISITION",
          year,
          subjectCompanyId: subjectId,
          importance: "MEDIUM",
        };
        if (payload.type === "ACQUISITION") {
          payload.outcome = "UNKNOWN";
          if (acquirerId) payload.acquirerCompanyId = acquirerId;
          else if (ex.acquirer) payload.acquirerNameRaw = ex.acquirer;
        } else if (payload.type === "MERGER") {
          if (acquirerId) payload.withCompanyId = acquirerId;
          else { payload.type = "OTHER"; } // merger needs a known partner
        } else if (payload.type === "FUNDING") {
          if (ex.amount) payload.amount = ex.amount;
        } else if (payload.type === "COMPANY_RENAME") {
          if (ex.acquirer) payload.newName = ex.acquirer; // best-effort
        }
        proposal = await prisma.proposal.create({
          data: {
            kind: "CREATE", entityType: "Event", payload: JSON.stringify(payload),
            note, origin: "AUTO", status: "PENDING",
          },
        });
      } else if (ex.acquired) {
        // Unknown target -> propose adding the company (base discovery).
        const payload = { initialName: ex.acquired, types: ["VENDOR"], country: "" };
        proposal = await prisma.proposal.create({
          data: {
            kind: "CREATE", entityType: "Company", payload: JSON.stringify(payload),
            note: `${note}\n(société inconnue, rachetée par ${ex.acquirer ?? "?"} en ${year})`,
            origin: "AUTO", status: "PENDING",
          },
        });
      }

      await prisma.feedItem.update({
        where: { id: item.id },
        data: {
          status: "PROCESSED", relevant: true, proposalId: proposal?.id ?? null,
          processedAt: new Date(),
        },
      });
      if (proposal) report.proposalsCreated++;
    } catch (e) {
      report.errors++;
      await prisma.feedItem.update({
        where: { id: item.id },
        data: { status: "ERROR", error: (e as Error).message.slice(0, 300) },
      });
    }
  }

  return report;
}
