// #1 — "Enrich (LLM)" on a pending proposal: run a company analysis and REPLACE
// the (often thin) proposal with a rich "Bundle" (company + solutions + M&A),
// so a bare {initialName, types} that fails approval for missing required fields
// becomes a complete, approvable proposal. Works on Company / Bundle / Event
// (the event's subject company) proposals.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { researchCompany } from "@/lib/company-research";
import { loadLlmConfig, llmHealthCheck, addLlmUsage } from "@/lib/llm";
import { logAudit } from "@/lib/audit";
import { requireAdmin, unauthorized, notFound, serverError } from "@/lib/api-utils";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    const { id } = await ctx.params;
    const proposal = await prisma.proposal.findUnique({ where: { id } });
    if (!proposal) return notFound();
    if (proposal.status !== "PENDING") {
      return NextResponse.json({ error: "Already reviewed", code: "reviewed" }, { status: 409 });
    }

    // Figure out which company to research (and whether it already exists).
    const payload = JSON.parse(proposal.payload);
    let companyName: string | null = null;
    let existingId: string | null = null;

    if (proposal.entityType === "Company") {
      companyName = payload.initialName ?? null;
      existingId = proposal.kind === "UPDATE" ? proposal.targetId : null;
    } else if (proposal.entityType === "Bundle") {
      companyName = payload.company?.initialName ?? null;
      existingId = payload.company?.existingId ?? proposal.targetId ?? null;
    } else if (proposal.entityType === "Event") {
      if (payload.subjectCompanyId) {
        const c = await prisma.company.findUnique({
          where: { id: payload.subjectCompanyId },
          select: { id: true, initialName: true },
        });
        if (c) {
          companyName = c.initialName;
          existingId = c.id;
        }
      }
    }

    if (!companyName) {
      return NextResponse.json(
        { error: "No company to enrich in this proposal", code: "noCompany" },
        { status: 400 }
      );
    }

    const cfg = await loadLlmConfig();
    const health = await llmHealthCheck(cfg);
    if (!health.ok) {
      return NextResponse.json(
        { error: "LLM offline", code: "llmOffline", detail: health.detail },
        { status: 503 }
      );
    }

    const { bundle, sources, usage, droppedEvents } = await researchCompany(companyName, existingId, cfg);
    await addLlmUsage(usage);

    const srcBits = [
      sources.en && "Wikipedia EN",
      sources.fr && "Wikipedia FR",
      sources.news > 0 && `${sources.news} titres presse`,
    ].filter(Boolean);
    const note =
      `[Enrichi LLM] ${companyName} — ${cfg.provider}:${cfg.model}` +
      (srcBits.length ? ` · sources : ${srcBits.join(", ")}` : " · aucune source") +
      (droppedEvents > 0 ? ` · ${droppedEvents} évén. non sourcé(s) écarté(s)` : "") +
      (proposal.note ? `\n${proposal.note}` : "");

    await prisma.proposal.update({
      where: { id },
      data: {
        entityType: "Bundle",
        kind: existingId ? "UPDATE" : "CREATE",
        targetId: existingId,
        payload: JSON.stringify(bundle),
        note,
      },
    });

    await logAudit({
      userId: session.user.id,
      action: "UPDATE",
      entityType: "Proposal",
      entityId: id,
      summary: `Proposition enrichie par LLM (${companyName})`,
    });

    return NextResponse.json({
      ok: true,
      company: companyName,
      solutions: bundle.solutions?.length ?? 0,
      events: bundle.events?.length ?? 0,
    });
  } catch (e) {
    return serverError(e);
  }
}
