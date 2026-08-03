// =============================================================================
// On-demand LLM research on a single company: fetches grounding text (Wikipedia
// FR + EN), asks the configured LLM (Ollama local/deported OR Anthropic/Haiku)
// to produce a structured "bundle" (company + solutions + M&A events), which
// becomes a single AUTO proposal for admin review. Facts are grounded on the
// fetched text; the model is told NOT to invent precise facts.
// =============================================================================
import { loadLlmConfig, llmExtractJsonWithUsage, type LlmConfig, type TokenUsage } from "@/lib/llm";
import { bundleCompanySchema, bundleSolutionSchema, bundleEventSchema } from "@/lib/validation";
import { clampEventImportance } from "@/lib/constants";

const wikiPageUrl = (name: string, lang: "en" | "fr") =>
  `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(name.replace(/ /g, "_"))}`;

async function fetchWikiIntro(name: string, lang: "en" | "fr"): Promise<string> {
  try {
    const u =
      `https://${lang}.wikipedia.org/w/api.php?` +
      new URLSearchParams({
        action: "query",
        titles: name,
        prop: "extracts",
        exintro: "1",
        explaintext: "1",
        redirects: "1",
        format: "json",
        origin: "*",
      });
    const r = await fetch(u, { headers: { "User-Agent": "CyberMarketTrack/1.0 (research)" } });
    if (!r.ok) return "";
    const j = await r.json();
    const pages = j.query?.pages ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = Object.values(pages)[0] as any;
    return (p?.extract ?? "").slice(0, 4000);
  } catch {
    return "";
  }
}

const SYSTEM = `Tu es analyste du marché de la cybersécurité. On te donne le nom d'une entreprise (éditeur / société de cybersécurité) et des extraits Wikipedia. Produis un objet JSON structuré décrivant l'entreprise, ses principales solutions et ses opérations de M&A.

RÈGLES IMPORTANTES :
- Ne fabrique JAMAIS de chiffre précis incertain (montant exact, année si tu hésites) : mets null plutôt qu'une valeur inventée.
- EN REVANCHE, le PAYS du siège (code ISO) et les DESCRIPTIONS FR+EN sont presque toujours connus pour une société de cybersécurité : FOURNIS-LES SYSTÉMATIQUEMENT (au minimum une description succincte). Ne mets null pour le pays/description QUE si la société t'est totalement inconnue.
- Descriptions : 1 à 3 phrases claires, en FR ET en EN.
- Dates d'événements : indique le MOIS (1-12) dès que tu le connais, pas seulement l'année.
- Pour une ACQUISITION, indique TOUJOURS "outcome" : INVESTOR_OWNED si le racheteur est un FONDS d'investissement ; ABSORBED si la marque disparaît / intégration totale ; AUTONOMOUS si elle devient une filiale gardant sa marque ; UNKNOWN seulement en dernier recours.
- IMPORTANCE : "MAJOR" est réservé aux RACHATS (ou fusions) de sociétés de cybersécurité TRÈS CONNUES et majeures du marché. Un FUNDING ou une IPO ne sont JAMAIS "MAJOR" (mets "MINOR", au plus "MEDIUM" pour un funding de plusieurs centaines de M$). Dans le doute, mets "MINOR".
- Concentre-toi sur la cybersécurité. Limite-toi à ~5 solutions et ~8 événements max, les plus notables.

Format JSON EXACT :
{
  "company": {
    "initialName": string,                 // nom de l'entreprise
    "types": ["VENDOR"|"SERVICE_PROVIDER"|"DISTRIBUTOR"|"INVESTMENT_FUND"],
    "foundedYear": number|null,
    "country": string,                     // code ISO 3166-1 alpha-2 (ex "US","FR","IL") — à fournir
    "originCountry": string|null,          // pays d'origine si différent
    "descriptionFr": string,               // à fournir
    "descriptionEn": string,               // à fournir
    "website": string|null
  },
  "solutions": [
    { "initialName": string, "descriptionFr": string|null, "descriptionEn": string|null, "launchYear": number|null }
  ],
  "events": [
    {
      "type": "ACQUISITION"|"MERGER"|"FUNDING"|"IPO"|"DELISTING"|"SPINOFF"|"HQ_RELOCATION"|"COMPANY_RENAME"|"OTHER",
      "year": number,
      "month": number|null,                // 1-12 si connu (précise-le pour les rachats/levées)
      "importance": "MAJOR"|"MEDIUM"|"MINOR",  // MAJOR = rachat/fusion structurant ; MINOR par défaut
      "role": "subject"|"acquirer",        // "subject" = l'événement concerne l'entreprise (elle est rachetée/levée/renommée) ; "acquirer" = l'entreprise a RACHETÉ quelqu'un
      "counterpartyName": string|null,     // l'autre société (acheteur si role=subject, cible si role=acquirer, partenaire pour MERGER, parent pour SPINOFF)
      "outcome": "INVESTOR_OWNED"|"AUTONOMOUS"|"ABSORBED"|"UNKNOWN"|null,  // pour ACQUISITION
      "amount": number|null,               // millions USD (FUNDING)
      "round": string|null,                // ex "Series B"
      "newName": string|null,              // COMPANY_RENAME
      "newCountry": string|null,           // HQ_RELOCATION (code ISO)
      "note": string|null,
      "descriptionFr": string|null,        // 1 phrase en français décrivant le fait
      "descriptionEn": string|null         // même phrase en anglais
    }
  ]
}
Réponds UNIQUEMENT par le JSON.`;

export interface ResearchResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bundle: any;
  sources: { en: boolean; fr: boolean };
  usage: TokenUsage;
}

export async function researchCompany(
  name: string,
  existingId: string | null,
  cfgArg?: LlmConfig
): Promise<ResearchResult> {
  const cfg = cfgArg ?? (await loadLlmConfig());
  const [en, fr] = await Promise.all([fetchWikiIntro(name, "en"), fetchWikiIntro(name, "fr")]);
  const grounding =
    [en && `[Wikipedia EN]\n${en}`, fr && `[Wikipedia FR]\n${fr}`].filter(Boolean).join("\n\n") ||
    "(aucune source Wikipedia trouvée — utilise tes connaissances sûres, laisse null si incertain)";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: raw, usage } = await llmExtractJsonWithUsage<any>(
    SYSTEM,
    `Entreprise : "${name}"\n\nSources :\n${grounding}`,
    cfg
  );

  // Normalize + guardrails
  raw.company = raw.company ?? {};
  if (!raw.company.initialName) raw.company.initialName = name;
  if (existingId) raw.company.existingId = existingId;

  // Validate EACH part on its own and DROP the invalid ones — so a single
  // malformed event can't void the whole bundle (which used to fall back to
  // raw, un-coerced data and crash on insert). year/month/etc. are coerced here.
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
  const events = keepValid(raw.events, bundleEventSchema);

  // Normalize each event: enforce the importance rules deterministically, default
  // an acquisition's outcome, and stamp the company's Wikipedia page as url1 when
  // the event has no source (research facts are grounded on Wikipedia — the model
  // isn't asked for article URLs it can't know).
  const wikiUrl = en ? wikiPageUrl(name, "en") : fr ? wikiPageUrl(name, "fr") : null;
  for (const ev of events) {
    ev.importance = clampEventImportance(ev.type, ev.importance, ev.amount);
    if ((ev.type === "ACQUISITION" || ev.role === "acquirer") && !ev.outcome) ev.outcome = "UNKNOWN";
    if (wikiUrl && !ev.url1) ev.url1 = wikiUrl;
  }

  const bundle = { company, solutions, events };
  return { bundle, sources: { en: !!en, fr: !!fr }, usage };
}
