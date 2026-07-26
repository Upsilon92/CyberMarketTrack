import { prisma } from "./lib/prisma.ts";
import { llmExtractJson } from "./lib/llm.ts";
const done = await prisma.feedItem.findMany({ where: { status: "PROCESSED" }, orderBy: { createdAt: "asc" }, take: 3 });
const SYSTEM = `Tu es analyste M&A cyber. Réponds UNIQUEMENT par un JSON {"relevant":bool,"eventType":"ACQUISITION"|"MERGER"|"FUNDING"|"IPO"|"RENAME"|null,"acquired":string|null,"acquirer":string|null,"amount":number|null,"year":number|null,"confidence":number,"summary":string}. Beaucoup de titres sont hors-sujet (opinions, listes, conseils) -> relevant=false.`;
for (const it of done) {
  const r = await llmExtractJson(SYSTEM, it.title);
  console.log("TITRE:", it.title);
  console.log("  =>", JSON.stringify(r), "\n");
}
