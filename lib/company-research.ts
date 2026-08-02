// =============================================================================
// On-demand LLM research on a single company: fetches grounding text (Wikipedia
// FR + EN), asks the configured LLM (Ollama local/deported OR Anthropic/Haiku)
// to produce a structured "bundle" (company + solutions + M&A events), which
// becomes a single AUTO proposal for admin review. Facts are grounded on the
// fetched text; the model is told NOT to invent precise facts.
// =============================================================================
import { loadLlmConfig, llmExtractJson, type LlmConfig } from "@/lib/llm";
import { bundleSchema } from "@/lib/validation";

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
- Ne fabrique JAMAIS de fait précis (année, pays, montant, rachat). Utilise les sources fournies et tes connaissances SÛRES ; si tu ne sais pas, mets null.
- Descriptions : rédige 1 à 3 phrases claires, en FR ET en EN.
- Concentre-toi sur la cybersécurité. Limite-toi à ~5 solutions et ~8 événements max, les plus notables.

Format JSON EXACT :
{
  "company": {
    "initialName": string,                 // nom de l'entreprise
    "types": ["VENDOR"|"SERVICE_PROVIDER"|"DISTRIBUTOR"|"INVESTMENT_FUND"],
    "foundedYear": number|null,
    "country": string|null,                // code ISO 3166-1 alpha-2 (ex "US","FR","IL")
    "originCountry": string|null,          // pays d'origine si différent
    "descriptionFr": string|null,
    "descriptionEn": string|null,
    "website": string|null
  },
  "solutions": [
    { "initialName": string, "descriptionFr": string|null, "descriptionEn": string|null, "launchYear": number|null }
  ],
  "events": [
    {
      "type": "ACQUISITION"|"MERGER"|"FUNDING"|"IPO"|"DELISTING"|"SPINOFF"|"HQ_RELOCATION"|"COMPANY_RENAME"|"OTHER",
      "year": number,
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
  const raw = await llmExtractJson<any>(SYSTEM, `Entreprise : "${name}"\n\nSources :\n${grounding}`, cfg);

  // Normalize + guardrails
  raw.company = raw.company ?? {};
  if (!raw.company.initialName) raw.company.initialName = name;
  if (existingId) raw.company.existingId = existingId;

  // Validate/clean via the bundle schema (drops bad fields, keeps the rest lenient)
  const parsed = bundleSchema.safeParse(raw);
  const bundle = parsed.success ? parsed.data : raw;
  return { bundle, sources: { en: !!en, fr: !!fr } };
}
