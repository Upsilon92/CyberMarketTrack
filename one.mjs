import { llmHealthCheck, llmExtractJson } from "./lib/llm.ts";
console.log("health:", JSON.stringify(await llmHealthCheck()));
const SYSTEM = `Tu es analyste M&A cyber. Réponds UNIQUEMENT par un JSON: {"relevant":bool,"eventType":"ACQUISITION"|"MERGER"|"FUNDING"|null,"acquired":string|null,"acquirer":string|null,"amount":number|null,"year":number|null,"confidence":number,"summary":string}. Si hors-sujet, relevant=false.`;
const titles = [
  "Palo Alto Networks to acquire CyberArk for $25 billion",
  "Les 10 meilleures pratiques de cybersécurité en 2026",
];
for (const t of titles) {
  const start = Date.now();
  const r = await llmExtractJson(SYSTEM, t);
  console.log(`\n[${((Date.now()-start)/1000).toFixed(1)}s] "${t}"\n =>`, JSON.stringify(r));
}
