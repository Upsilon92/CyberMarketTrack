// =============================================================================
// Phase 2 — RSS → LLM → AUTO proposals.
//
// Pipeline (safe to run on any schedule):
//   1. Fetch the market-news RSS (lib/rss.ts).
//   2. Record every never-seen item as a FeedItem (backlog).
//   3. Health-check the configured LLM. If it's offline (e.g. the deported PC
//      is off), STOP gracefully — the backlog is processed on a later run.
//   4. For each pending item: ask the LLM to extract a structured M&A/funding
//      event, GATE out irrelevant headlines, DEDUP against what already exists,
//      resolve the real article URL, and create ONE "Bundle" proposal that
//      carries BOTH companies (subject + counterparty) AND the event linking
//      them — applied atomically on approval.
// =============================================================================
import { prisma } from "@/lib/prisma";
import { getMarketNews } from "@/lib/rss";
import { getLlmConfig, llmHealthCheck, llmExtractJson, type LlmConfig } from "@/lib/llm";

const MAX_PER_RUN = Number(process.env.RSS_MAX_PER_RUN) || 12;
const MIN_CONFIDENCE = 0.55;

type ExEventType = "ACQUISITION" | "MERGER" | "FUNDING" | "IPO" | "RENAME";
type ExImportance = "MAJOR" | "MEDIUM" | "MINOR";

interface Extraction {
  relevant: boolean;
  eventType: ExEventType | null;
  acquired: string | null; // the cyber company the news is ABOUT (target / funded / renamed / merging)
  acquirer: string | null; // the other party (acquirer / investor / merge partner / new name)
  amount: number | null;
  year: number | null;
  importance: ExImportance | null;
  confidence: number;
  summaryFr: string;
  summaryEn: string;
}

const SYSTEM = `Tu es analyste du marché de la cybersécurité. On te donne le TITRE d'une actualité (flux Google News sur les fusions-acquisitions cyber). Détermine s'il décrit un ÉVÉNEMENT PERTINENT pour une base de connaissance du marché cyber : rachat (acquisition), fusion, levée de fonds, entrée en bourse, ou renommage d'un ÉDITEUR/société de cybersécurité.
Beaucoup de titres sont HORS-SUJET (opinions, listes « top 10 », conseils, sorties produit, tendances) : dans ce cas relevant=false.
N'invente aucune entreprise ni chiffre. Si le titre ne mentionne pas clairement un événement cyber concret, relevant=false.
Réponds UNIQUEMENT par un objet JSON:
{"relevant":bool,"eventType":"ACQUISITION"|"MERGER"|"FUNDING"|"IPO"|"RENAME"|null,"acquired":string|null,"acquirer":string|null,"amount":number|null,"year":number|null,"importance":"MAJOR"|"MEDIUM"|"MINOR","confidence":number,"summaryFr":string,"summaryEn":string}
- acquired = la société de cybersécurité CONCERNÉE (la cible rachetée, la société financée, renommée ou qui fusionne).
- acquirer = l'AUTRE partie : l'acheteur, l'investisseur, le partenaire de fusion, ou le NOUVEAU nom pour un renommage.
- amount en millions USD si mentionné, sinon null. confidence entre 0 et 1.
- importance : MAJOR pour un rachat/fusion structurant, MINOR par défaut.
- summaryFr = une phrase en français ; summaryEn = la même phrase en anglais.`;

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const EVENT_TYPE_MAP: Record<ExEventType, string> = {
  ACQUISITION: "ACQUISITION",
  MERGER: "MERGER",
  FUNDING: "FUNDING",
  IPO: "IPO",
  RENAME: "COMPANY_RENAME",
};

// Types for which a subject+type+year collision means "already recorded".
const DEDUP_TYPES = new Set(["ACQUISITION", "MERGER", "FUNDING", "IPO", "COMPANY_RENAME"]);

export interface AnalyzeReport {
  ok: boolean;
  skipped?: string; // reason when the LLM is offline
  llm: string;
  newItems: number;
  processed: number;
  proposalsCreated: number;
  notRelevant: number;
  duplicates: number;
  errors: number;
}

// ---- Real article URL (Google News RSS links are opaque redirects) ----------
// #2: turn "https://news.google.com/rss/articles/CBMi…?oc=5" into the publisher
// URL. Best-effort: (1) decode the base64 payload — many links embed the target
// URL as a plain string inside the protobuf; (2) otherwise follow redirects and
// sniff the canonical/amp URL from the HTML. Falls back to the Google URL.
async function resolveArticleUrl(googleUrl: string): Promise<string> {
  if (!/news\.google\.com/.test(googleUrl)) return googleUrl;
  try {
    const m = googleUrl.match(/\/articles\/([A-Za-z0-9_-]+)/);
    if (m) {
      const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
      const decoded = Buffer.from(b64, "base64").toString("latin1");
      // URLs in the payload end at the next control byte (protobuf field tag).
      const um = decoded.match(/https?:\/\/[^\x00-\x20"'<>\\]+/);
      if (um && !um[0].includes("news.google.com")) return um[0];
    }
  } catch {
    /* fall through to network resolution */
  }
  try {
    const res = await fetch(googleUrl, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CyberMarketTrack/1.0)" },
      next: { revalidate: 86400 },
    });
    if (res.url && !res.url.includes("news.google.com")) return res.url;
    const html = await res.text();
    const mm =
      html.match(/rel="canonical"\s+href="([^"]+)"/i) ||
      html.match(/data-n-au="([^"]+)"/i) ||
      html.match(/<meta[^>]+property="og:url"[^>]+content="([^"]+)"/i);
    if (mm && !mm[1].includes("news.google.com")) return mm[1];
  } catch {
    /* keep the Google URL */
  }
  return googleUrl;
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
    duplicates: 0,
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
  const idToName = new Map(companies.map((c) => [c.id, c.initialName]));
  const resolve = (name: string | null): string | null => {
    if (!name) return null;
    const n = norm(name);
    if (byName.has(n)) return byName.get(n)!;
    for (const [k, id] of byName) if (k.length >= 4 && (k.includes(n) || n.includes(k))) return id;
    return null;
  };

  // ---- Dedup sets (#8): don't re-propose an M&A/event that already exists,
  // nor one already sitting in the pending review queue. Key = subject|type|year.
  const key = (name: string, type: string, year: number) => `${norm(name)}|${type}|${year}`;
  const existingKeys = new Set<string>();
  const existingEvents = await prisma.event.findMany({
    select: { type: true, year: true, subjectCompanyId: true },
  });
  for (const e of existingEvents) {
    if (!e.subjectCompanyId || !DEDUP_TYPES.has(e.type)) continue;
    const nm = idToName.get(e.subjectCompanyId);
    if (nm) existingKeys.add(key(nm, e.type, e.year));
  }
  const pendingProps = await prisma.proposal.findMany({
    where: { status: "PENDING", origin: "AUTO", entityType: "Bundle" },
    select: { payload: true },
  });
  for (const p of pendingProps) {
    try {
      const b = JSON.parse(p.payload);
      const nm = b?.company?.initialName;
      for (const ev of b?.events ?? []) {
        if (nm && ev?.type && ev?.year) existingKeys.add(key(nm, ev.type, ev.year));
      }
    } catch {
      /* ignore malformed */
    }
  }

  for (const item of pending) {
    try {
      const ex = await llmExtractJson<Extraction>(SYSTEM, item.title, cfg);
      report.processed++;

      const relevant =
        !!ex.relevant && (ex.confidence ?? 0) >= MIN_CONFIDENCE && !!ex.eventType && !!ex.acquired;
      if (!relevant) {
        await prisma.feedItem.update({
          where: { id: item.id },
          data: { status: "PROCESSED", relevant: false, processedAt: new Date() },
        });
        report.notRelevant++;
        continue;
      }

      const eventType = EVENT_TYPE_MAP[ex.eventType!];
      const year = ex.year ?? (item.createdAt ? item.createdAt.getFullYear() : new Date().getFullYear());
      const subjectName = ex.acquired!.trim();

      // #8 — already recorded or already queued? skip without creating noise.
      if (DEDUP_TYPES.has(eventType) && existingKeys.has(key(subjectName, eventType, year))) {
        await prisma.feedItem.update({
          where: { id: item.id },
          data: { status: "PROCESSED", relevant: true, processedAt: new Date() },
        });
        report.duplicates++;
        continue;
      }

      const importance: ExImportance =
        ex.importance && ["MAJOR", "MEDIUM", "MINOR"].includes(ex.importance) ? ex.importance : "MINOR";
      const articleUrl = await resolveArticleUrl(item.url);
      const subjectId = resolve(subjectName);

      // #3 — one Bundle proposal: the subject company (+ counterparty, created on
      // apply if unknown) AND the event linking them.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ev: any = {
        type: eventType,
        year,
        importance,
        role: "subject",
        descriptionFr: ex.summaryFr || null,
        descriptionEn: ex.summaryEn || null,
        url1: articleUrl,
      };
      if (eventType === "ACQUISITION") {
        ev.outcome = "UNKNOWN";
        ev.counterpartyName = ex.acquirer || null;
      } else if (eventType === "MERGER") {
        ev.counterpartyName = ex.acquirer || null;
      } else if (eventType === "FUNDING") {
        if (ex.amount) ev.amount = ex.amount;
      } else if (eventType === "COMPANY_RENAME") {
        if (!ex.acquirer) {
          // no new name -> can't form a rename; drop back to no event
          ev.type = null;
        } else {
          ev.newName = ex.acquirer;
        }
      }

      const bundle = {
        company: {
          initialName: subjectName,
          existingId: subjectId ?? undefined,
          types: ["VENDOR"],
        },
        events: ev.type ? [ev] : [],
      };

      const note =
        `[AUTO] ${ex.summaryFr}\nSource : ${articleUrl}` +
        (subjectId ? "" : `\n(nouvelle société « ${subjectName} »)`) +
        (ex.acquirer && !resolve(ex.acquirer) && eventType !== "COMPANY_RENAME"
          ? `\n(contrepartie « ${ex.acquirer} » créée à l'approbation)`
          : "");

      const proposal = await prisma.proposal.create({
        data: {
          kind: subjectId ? "UPDATE" : "CREATE",
          entityType: "Bundle",
          targetId: subjectId ?? null,
          payload: JSON.stringify(bundle),
          note,
          origin: "AUTO",
          status: "PENDING",
        },
      });

      // Remember it so a later item in this same run doesn't duplicate it.
      if (DEDUP_TYPES.has(eventType)) existingKeys.add(key(subjectName, eventType, year));

      await prisma.feedItem.update({
        where: { id: item.id },
        data: {
          status: "PROCESSED",
          relevant: true,
          proposalId: proposal.id,
          processedAt: new Date(),
        },
      });
      report.proposalsCreated++;
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
