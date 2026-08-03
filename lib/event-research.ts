// =============================================================================
// LLM analysis of an existing EVENT: finds REAL press source URLs proving it
// (guardrail: the counterparty/subject must be named in a headline) and writes
// bilingual descriptions grounded on those headlines. Produces an Event UPDATE
// proposal payload filling ONLY empty fields (descriptions, url1/url2), for
// admin review. No hallucination: URLs come from verified articles, not the LLM.
// =============================================================================
import { prisma } from "@/lib/prisma";
import { loadLlmConfig, llmExtractJsonWithUsage, type LlmConfig, type TokenUsage } from "@/lib/llm";
import { searchNews, strip, mentions } from "@/lib/press";
import { resolveArticleUrl } from "@/lib/rss-analyze";

const SYSTEM = `Tu es analyste du marché de la cybersécurité. On te décrit un ÉVÉNEMENT (rachat, fusion, levée, IPO…) et des TITRES d'articles de presse le concernant. Rédige une phrase de description en FR et en EN, UNIQUEMENT à partir de ces éléments (n'invente rien).
Réponds UNIQUEMENT par : {"descriptionFr": string|null, "descriptionEn": string|null}`;

export interface EventResearchResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any; // eventSchema-valid (existing values + filled-empty enrichment)
  label: string;
  changed: boolean;
  usage: TokenUsage;
}

const TYPE_KEYWORD: Record<string, string> = {
  ACQUISITION: "acquisition",
  MERGER: "merger",
  FUNDING: "funding",
  IPO: "IPO",
  DELISTING: "delisting",
  SPINOFF: "spin-off",
};

export async function researchEvent(eventId: string, cfgArg?: LlmConfig): Promise<EventResearchResult> {
  const cfg = cfgArg ?? (await loadLlmConfig());
  const e = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      subjectCompany: { select: { initialName: true } },
      acquirerCompany: { select: { initialName: true } },
      withCompany: { select: { initialName: true } },
      newOwnerCompany: { select: { initialName: true } },
      parentCompany: { select: { initialName: true } },
    },
  });
  if (!e) throw new Error("event-not-found");

  const subjectName = e.subjectCompany?.initialName ?? "";
  const counterparty =
    e.acquirerCompany?.initialName ??
    e.withCompany?.initialName ??
    e.newOwnerCompany?.initialName ??
    e.parentCompany?.initialName ??
    e.acquirerNameRaw ??
    e.acquiredNameRaw ??
    "";

  const label = `${e.type} ${e.year}${subjectName ? ` · ${subjectName}` : ""}`;

  // Press grounding: search for the parties + type + year.
  const query = [subjectName, counterparty, TYPE_KEYWORD[e.type] ?? "", e.year].filter(Boolean).join(" ");
  const hits = query.trim() ? await searchNews(query, 16) : [];

  // Keep only headlines that attest the event (the counterparty, or the subject,
  // is named). Resolve up to 2 real article URLs as proof.
  const proofs: string[] = [];
  const attestingTitles: string[] = [];
  let usageTotal: TokenUsage = { prompt: 0, completion: 0, total: 0 };
  for (const h of hits) {
    if (proofs.length >= 2) break;
    const hay = strip(h.title);
    if (mentions(hay, counterparty) || mentions(hay, subjectName)) {
      attestingTitles.push(h.title);
      proofs.push(await resolveArticleUrl(h.link));
    }
  }

  // Bilingual description grounded on the attesting headlines + the known facts.
  let descFr: string | null = null;
  let descEn: string | null = null;
  if (attestingTitles.length) {
    const facts = `Type: ${e.type}, année: ${e.year}${subjectName ? `, sujet: ${subjectName}` : ""}${
      counterparty ? `, contrepartie: ${counterparty}` : ""
    }${e.amount ? `, montant: ${e.amount} M$` : ""}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, usage } = await llmExtractJsonWithUsage<any>(
      SYSTEM,
      `Événement : ${facts}\n\nTitres de presse :\n${attestingTitles.map((t) => `- ${t}`).join("\n")}`,
      cfg
    );
    usageTotal = usage;
    descFr = typeof data?.descriptionFr === "string" && data.descriptionFr.trim() ? data.descriptionFr.trim() : null;
    descEn = typeof data?.descriptionEn === "string" && data.descriptionEn.trim() ? data.descriptionEn.trim() : null;
  }

  // Fill ONLY empty fields.
  const nextFr = e.descriptionFr ?? descFr;
  const nextEn = e.descriptionEn ?? descEn;
  const nextUrl1 = e.url1 ?? proofs[0] ?? null;
  const nextUrl2 = e.url2 ?? proofs[1] ?? null;
  const changed =
    (!e.descriptionFr && !!descFr) ||
    (!e.descriptionEn && !!descEn) ||
    (!e.url1 && !!proofs[0]) ||
    (!e.url2 && !!proofs[1]);

  const payload = {
    type: e.type,
    year: e.year,
    month: e.month,
    importance: e.importance,
    descriptionFr: nextFr,
    descriptionEn: nextEn,
    url1: nextUrl1,
    url2: nextUrl2,
    subjectCompanyId: e.subjectCompanyId,
    subjectSolutionId: e.subjectSolutionId,
    newName: e.newName,
    acquirerCompanyId: e.acquirerCompanyId,
    acquirerNameRaw: e.acquirerNameRaw,
    acquiredNameRaw: e.acquiredNameRaw,
    parentCompanyId: e.parentCompanyId,
    outcome: e.outcome,
    withCompanyId: e.withCompanyId,
    newOwnerCompanyId: e.newOwnerCompanyId,
    intoSolutionId: e.intoSolutionId,
    amount: e.amount,
    round: e.round,
    note: e.note,
    fromCountry: e.fromCountry,
    newCountry: e.newCountry,
    newCity: e.newCity,
  };

  return { payload, label, changed, usage: usageTotal };
}
