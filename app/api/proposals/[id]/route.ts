// Admin review of a proposal: approve (optionally with an edited payload, which
// is what "modify then approve" sends) or reject. Approving runs the payload
// through applyProposal (same logic as the admin routes). DELETE discards a
// reviewed proposal from the queue.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requireAdmin, unauthorized, notFound, validationError, serverError } from "@/lib/api-utils";
import { applyProposal, validateProposalPayload } from "@/lib/proposals";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    const { id } = await ctx.params;
    const proposal = await prisma.proposal.findUnique({ where: { id } });
    if (!proposal) return notFound();
    if (proposal.status !== "PENDING") {
      return NextResponse.json({ error: "Already reviewed", code: "reviewed" }, { status: 409 });
    }

    const body = await req.json();
    const action = body.action as string;
    const reviewNote = typeof body.reviewNote === "string" ? body.reviewNote : null;

    if (action === "reject") {
      await prisma.proposal.update({
        where: { id },
        data: { status: "REJECTED", reviewedAt: new Date(), reviewedBy: session.user.id, reviewNote },
      });
      await logAudit({
        userId: session.user.id,
        action: "UPDATE",
        entityType: "Proposal",
        entityId: id,
        summary: `Proposition refusée (${proposal.entityType})`,
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "approve") {
      // The admin may have edited the payload ("modify then approve").
      const payloadObj = body.payload ?? JSON.parse(proposal.payload);
      const payloadParsed = validateProposalPayload(proposal.entityType, payloadObj);
      if (!payloadParsed.success) return validationError(payloadParsed.error);
      const payload = JSON.stringify(payloadParsed.data);

      const appliedId = await applyProposal({
        kind: proposal.kind,
        entityType: proposal.entityType,
        targetId: proposal.targetId,
        payload,
      });

      await prisma.proposal.update({
        where: { id },
        data: {
          status: "APPROVED",
          payload,
          reviewedAt: new Date(),
          reviewedBy: session.user.id,
          reviewNote,
        },
      });
      await logAudit({
        userId: session.user.id,
        action: proposal.kind === "CREATE" ? "CREATE" : "UPDATE",
        entityType: proposal.entityType,
        entityId: appliedId,
        summary: `Proposition validée (${proposal.entityType} ${proposal.kind})`,
      });
      return NextResponse.json({ ok: true, appliedId });
    }

    return NextResponse.json({ error: "Bad action", code: "badAction" }, { status: 400 });
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return unauthorized();
  try {
    const { id } = await ctx.params;
    await prisma.proposal.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
