// =============================================================================
// On-demand LLM research on a single company. Grounding = the FULL Wikipedia
// article (EN + FR) AND a scoped Google News search (press articles about the
// company's M&A). The model proposes a structured bundle, but events are NOT
// trusted blindly:
//
//   ▶ ANTI-HALLUCINATION GUARDRAIL ◀
//   An M&A/funding/IPO event is KEPT only if it is literally ATTESTED in one of
//   the fetched sources — Wikipedia text OR a press headline (the counterparty
//   is named, or a type keyword is present). The attesting source's URL is
//   stored as the event's proof (url1/url2); for a press headline that is the
//   REAL article URL (resolved from the Google News redirect). Unsupported
//   events are DROPPED. No source ⇒ no events.
// =============================================================================
import { loadLlmConfig, llmExtractJsonWithUsage, type LlmConfig, type TokenUsage } from "@/lib/llm";
import { bundleCompanySchema, bundleSolutionSchema, bundleEventSchema } from "@/lib/validation";
import { clampEventImportance } from "@/lib/constants";
import { resolveArticleUrl } from "@/lib/rss-analyze";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const MAX_URL_RESOLVES = 6; // cap the expensive Google-News URL decodes per company

interface WikiSource {
  text: string;
  url: string;
}
interface NewsItem {
  title: string;
  link: string; // Google News redirect (resolved lazily when it attests an event)
}

async function fetchWiki(name: string, lang: "en" | "fr"): Promise<WikiSource | null> {
  try {
    const u =
      `https://${lang}.wikipedia.org/w/api.php?` +
      new URLSearchParams({
        action: "query",
        titles: name,
        prop: "extracts|info",
        explaintext: "1",
        redirects: "1",
        inprop: "url",
        format: "json",
        origin: "*",
      });
    const r = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const j = await r.json();
    const pages = j.query?.pages ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = Object.values(pages)[0] as any;
    if (!p || p.missing !== undefined || !p.extract) return null;
    return {
      text: String(p.extract).slice(0, 15_000),
      url: p.fullurl || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(name.replace(/ /g, "_"))}`,
    };
  } catch {
    return null;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#0?39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

// Press headlines about this company's M&A, via Google News RSS search (server
// side, no CORS). Titles feed the grounding + verification; links are resolved
// to the real article URL only when they attest a kept event.
async function fetchCompanyNews(name: string): Promise<NewsItem[]> {
  const q = encodeURIComponent(`"${name}" (acquisition OR acquires OR acquired OR merger OR raises OR funding OR IPO)`);
  const feeds = [
    `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`,
    `https://news.google.com/rss/search?q=${q}&hl=fr&gl=FR&ceid=FR:fr`,
  ];
  const out: NewsItem[] = [];
  for (const url of feeds) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) });
      if (!r.ok) continue;
      const xml = await r.text();
      const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/g;
      let m: RegExpExecArray | null;
      while ((m = itemRe.exec(xml)) && out.length < 24) {
        const block = m[1];
        let title = decodeEntities(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
        const link = (block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "").trim();
        const source = decodeEntities(block.match(/<source\b[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? "");
        if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)).trim();
        if (title && link) out.push({ title, link });
      }
    } catch {
      /* ignore feed errors */
    }
  }
  return out;
}

// --- Source-attestation checks (the deterministic guardrail) -----------------

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Does `hay` (accent-stripped, lowercased) contain `phrase` as whole word(s)? */
function mentions(hay: string, phrase?: string | null): boolean {
  const n = strip(phrase ?? "").trim();
  if (n.length < 3) return false;
  const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  return re.test(hay);
}

const FUNDING_RE = /\b(funding|raised|raise|raises|investment|series [a-e]|round|venture|financ|levee|levée)\b/;
const IPO_RE = /\b(ipo|public offering|went public|listed on|nasdaq|nyse|stock exchange|introduction en bourse|entree en bourse)\b/;
const DELIST_RE = /\b(delist|taken private|going private|retrait de la cote|sortie de bourse)\b/;

/** Is this event backed by the given (accent-stripped) source text/headline? */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function eventSupported(ev: any, hay: string): boolean {
  switch (ev.type) {
    case "ACQUISITION":
    case "MERGER":
    case "SPINOFF":
    case "CO_INVESTMENT":
      return mentions(hay, ev.counterpartyName);
    case "COMPANY_RENAME":
      return mentions(hay, ev.newName);
    case "FUNDING":
      return FUNDING_RE.test(hay);
    case "IPO":
      return IPO_RE.test(hay);
    case "DELISTING":
      return DELIST_RE.test(hay);
    default:
      return false; // HQ_RELOCATION / OTHER: not auto-created from research
  }
}

const SYSTEM = `Tu es analyste du marché de la cybersécurité. On te donne le nom d'une entreprise, le TEXTE d'articles Wikipedia et des TITRES d'articles de presse la concernant. Produis un objet JSON structuré décrivant l'entreprise, ses principales solutions et ses opérations de M&A.

RÈGLES ABSOLUES :
- Les ÉVÉNEMENTS (rachats, fusions, levées de fonds, IPO, renommages) doivent être EXPLICITEMENT présents dans le TEXTE Wikipedia OU dans un TITRE de presse fourni. N'INVENTE JAMAIS un événement. Si une opération n'apparaît dans aucune source, NE L'INCLUS PAS. Pour un rachat/une fusion, le nom de l'autre société DOIT figurer tel quel dans une source.
- Ne fabrique JAMAIS de chiffre précis incertain (montant, année) : mets null.
- Le PAYS du siège (code ISO) et les DESCRIPTIONS FR+EN sont presque toujours connus : fournis-les. null seulement si la société t'est totalement inconnue.
- Dates d'événements : indique le MOIS (1-12) dès qu'il apparaît.
- Pour une ACQUISITION, indique TOUJOURS "outcome" : INVESTOR_OWNED si le racheteur est un FONDS ; ABSORBED si la marque disparaît ; AUTONOMOUS si filiale gardant sa marque ; UNKNOWN sinon.
- IMPORTANCE : "MAJOR" réservé aux rachats/fusions de sociétés cyber TRÈS CONNUES. Un FUNDING ou une IPO ne sont JAMAIS "MAJOR". Dans le doute, "MINOR".
- Concentre-toi sur la cybersécurité. ~5 solutions et ~8 événements max.

Format JSON EXACT :
{
  "company": {
    "initialName": string,
    "types": ["VENDOR"|"SERVICE_PROVIDER"|"DISTRIBUTOR"|"INVESTMENT_FUND"],
    "foundedYear": number|null,
    "country": string,
    "originCountry": string|null,
    "descriptionFr": string,
    "descriptionEn": string,
    "website": string|null
  },
  "solutions": [
    { "initialName": string, "descriptionFr": string|null, "descriptionEn": string|null, "launchYear": number|null }
  ],
  "events": [
    {
      "type": "ACQUISITION"|"MERGER"|"FUNDING"|"IPO"|"DELISTING"|"SPINOFF"|"COMPANY_RENAME",
      "year": number,
      "month": number|null,
      "importance": "MAJOR"|"MEDIUM"|"MINOR",
      "role": "subject"|"acquirer",
      "counterpartyName": string|null,
      "outcome": "INVESTOR_OWNED"|"AUTONOMOUS"|"ABSORBED"|"UNKNOWN"|null,
      "amount": number|null,
      "round": string|null,
      "newName": string|null,
      "note": string|null,
      "descriptionFr": string|null,
      "descriptionEn": string|null
    }
  ]
}
Réponds UNIQUEMENT par le JSON.`;

export interface ResearchResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bundle: any;
  sources: { en: boolean; fr: boolean; news: number };
  usage: TokenUsage;
  droppedEvents: number; // events removed because unattested (hallucination guard)
}

export async function researchCompany(
  name: string,
  existingId: string | null,
  cfgArg?: LlmConfig
): Promise<ResearchResult> {
  const cfg = cfgArg ?? (await loadLlmConfig());
  const [enSrc, frSrc, news] = await Promise.all([
    fetchWiki(name, "en"),
    fetchWiki(name, "fr"),
    fetchCompanyNews(name),
  ]);
  const wikiSources = [enSrc, frSrc].filter(Boolean) as WikiSource[];

  const groundingParts = wikiSources.map((s) => `[SOURCE ${s.url}]\n${s.text}`);
  if (news.length)
    groundingParts.push(`[TITRES DE PRESSE]\n${news.map((n) => `- ${n.title}`).join("\n")}`);
  const grounding = groundingParts.join("\n\n") || "(aucune source trouvée)";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: raw, usage } = await llmExtractJsonWithUsage<any>(
    SYSTEM,
    `Entreprise : "${name}"\n\nSources :\n${grounding}`,
    cfg
  );

  raw.company = raw.company ?? {};
  if (!raw.company.initialName) raw.company.initialName = name;
  if (existingId) raw.company.existingId = existingId;

  const companyParsed = bundleCompanySchema.safeParse(raw.company);
  const company = companyParsed.success
    ? companyParsed.data
    : { initialName: name, ...(existingId ? { existingId } : {}) };

  const keepValid = (
    arr: unknown,
    schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown } }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any[] =>
    (Array.isArray(arr) ? arr : [])
      .map((x) => schema.safeParse(x))
      .filter((r) => r.success)
      .map((r) => r.data);

  const solutions = keepValid(raw.solutions, bundleSolutionSchema);
  const candidateEvents = keepValid(raw.events, bundleEventSchema);

  // Pre-strip sources for matching.
  const wikiHays = wikiSources.map((s) => ({ url: s.url, hay: strip(s.text) }));
  const newsHays = news.map((n) => ({ link: n.link, hay: strip(n.title) }));

  // ▶ GUARDRAIL: keep an event ONLY if a source attests it. Proof URLs = the
  // attesting press article (real URL, resolved) and/or Wikipedia page. Press is
  // preferred. Unattested events are dropped.
  const events: unknown[] = [];
  let droppedEvents = 0;
  let resolves = 0;
  for (const ev of candidateEvents) {
    const proofs: string[] = [];
    // Press headlines first (real article URLs).
    for (const n of newsHays) {
      if (proofs.length >= 2) break;
      if (!eventSupported(ev, n.hay)) continue;
      if (resolves < MAX_URL_RESOLVES) {
        proofs.push(await resolveArticleUrl(n.link));
        resolves++;
      } else {
        proofs.push(n.link);
      }
    }
    // Then Wikipedia.
    for (const w of wikiHays) {
      if (proofs.length >= 2) break;
      if (eventSupported(ev, w.hay)) proofs.push(w.url);
    }

    if (proofs.length === 0) {
      droppedEvents++;
      continue; // unattested → do NOT create it
    }
    ev.importance = clampEventImportance(ev.type, ev.importance, ev.amount);
    if ((ev.type === "ACQUISITION" || ev.role === "acquirer") && !ev.outcome) ev.outcome = "UNKNOWN";
    ev.url1 = proofs[0];
    ev.url2 = proofs[1] ?? null;
    events.push(ev);
  }

  const bundle = { company, solutions, events };
  return {
    bundle,
    sources: { en: !!enSrc, fr: !!frSrc, news: news.length },
    usage,
    droppedEvents,
  };
}
