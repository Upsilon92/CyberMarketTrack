// Approve a proposal with per-field CHOICES from the diff review (item 4):
// keep-current / take-proposed per field, include/exclude per new sub-entity.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requireAdmin, unauthorized, notFound, serverError } from "@/lib/api-utils";
import { resolveProposal, type Resolution } from "@/lib/proposal-resolve";

const subSchema = z.object({
  index: z.number().int().min(0),
  include: z.boolean(),
  takeFields: z.array(z.string().max(60)).max(40).optional(),
});
const bodySchema = z.object({
  takeFields: z.array(z.string().max(60)).max(40).optional(),
  companyTakeFields: z.array(z.string().max(60)).max(40).optional(),
  events: z.array(subSchema).max(200).optional(),
  solutions: z.array(subSchema).max(200).optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return unauthorized();
  try {
    const { id } = await ctx.params;
    const proposal = await prisma.proposal.findUnique({ where: { id } });
    if (!proposal) return notFound();
    if (proposal.status !== "PENDING") {
      return NextResponse.json({ error: "Already reviewed", code: "reviewed" }, { status: 409 });
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    const resolution: Resolution = parsed.success ? parsed.data : {};

    const appliedId = await resolveProposal(
      { entityType: proposal.entityType, kind: proposal.kind, targetId: proposal.targetId, payload: JSON.parse(proposal.payload) },
      resolution
    );

    await prisma.proposal.update({
      where: { id },
      data: { status: "APPROVED", reviewedAt: new Date(), reviewedBy: session.user.id },
    });
    await logAudit({
      userId: session.user.id,
      action: "UPDATE",
      entityType: proposal.entityType,
      entityId: appliedId,
      summary: `Proposition validée par comparaison (${proposal.entityType})`,
    });
    return NextResponse.json({ ok: true, appliedId });
  } catch (e) {
    return serverError(e);
  }
}
