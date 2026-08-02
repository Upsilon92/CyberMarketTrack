// On-demand LLM company research → one AUTO "Bundle" proposal (company +
// solutions + M&A) for admin review. Called from a company page ("Analyse LLM")
// or from the proposals page (type a company name).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { researchCompany } from "@/lib/company-research";
import { loadLlmConfig, llmHealthCheck } from "@/lib/llm";
import { requireAdmin, unauthorized, validationError, serverError } from "@/lib/api-utils";

const bodySchema = z.object({
  companyName: z.string().trim().min(1).max(200).optional(),
  companyId: z.string().min(1).optional(),
  eventId: z.string().min(1).optional(), // stamp this event's lastAnalyzedAt too
});

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);
    let { companyName } = parsed.data;
    const { companyId, eventId } = parsed.data;

    // Resolve the name (and existing id) when a companyId is given.
    let existingId: string | null = null;
    if (companyId) {
      const c = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, initialName: true } });
      if (!c) return NextResponse.json({ error: "Company not found", code: "notFound" }, { status: 404 });
      existingId = c.id;
      companyName = c.initialName;
    } else if (companyName) {
      // If the typed name matches an existing company, treat it as an UPDATE.
      const c = await prisma.company.findFirst({ where: { initialName: companyName }, select: { id: true } });
      if (c) existingId = c.id;
    }
    if (!companyName) return NextResponse.json({ error: "companyName required", code: "nameRequired" }, { status: 400 });

    const cfg = await loadLlmConfig();
    const health = await llmHealthCheck(cfg);
    if (!health.ok) {
      return NextResponse.json({ error: "LLM offline", code: "llmOffline", detail: health.detail }, { status: 503 });
    }

    const { bundle, sources } = await researchCompany(companyName, existingId, cfg);

    const note = `[Analyse LLM] ${companyName} — ${cfg.provider}:${cfg.model}${
      sources.en || sources.fr ? ` · sources Wikipedia ${[sources.en && "EN", sources.fr && "FR"].filter(Boolean).join("+")}` : " · sans source Wikipedia"
    }`;

    const proposal = await prisma.proposal.create({
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

    // Stamp the last-analysis date (visible to all) on the analyzed entities.
    const now = new Date();
    if (existingId) await prisma.company.update({ where: { id: existingId }, data: { lastAnalyzedAt: now } });
    if (eventId) {
      await prisma.event.update({ where: { id: eventId }, data: { lastAnalyzedAt: now } }).catch(() => {});
    }

    return NextResponse.json({
      proposalId: proposal.id,
      company: companyName,
      solutions: bundle.solutions?.length ?? 0,
      events: bundle.events?.length ?? 0,
    });
  } catch (e) {
    return serverError(e);
  }
}
