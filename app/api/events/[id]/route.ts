import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { eventSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { checkEventCoherence, eventSummary, subjectName } from "@/lib/event-checks";
import {
  requireAdmin,
  unauthorized,
  notFound,
  validationError,
  coherenceError,
  serverError,
} from "@/lib/api-utils";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    const { id } = await ctx.params;
    const existing = await prisma.event.findUnique({ where: { id } });
    if (!existing) return notFound();

    const parsed = eventSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);
    const data = parsed.data;

    const coherence = await checkEventCoherence(data, id);
    if (!coherence.subjectFound) return notFound();
    if (coherence.errors.length > 0) {
      return coherenceError(coherence.errors.map((i) => i.code));
    }

    const event = await prisma.event.update({ where: { id }, data });

    await logAudit({
      userId: session.user.id,
      action: "UPDATE",
      entityType: "Event",
      entityId: id,
      summary: `Modification : ${eventSummary(data, await subjectName(data))}`,
    });

    return NextResponse.json({ event, warnings: coherence.warnings.map((i) => i.code) });
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    const { id } = await ctx.params;
    const existing = await prisma.event.findUnique({
      where: { id },
      include: { subjectCompany: true, subjectSolution: true },
    });
    if (!existing) return notFound();

    await prisma.event.delete({ where: { id } });

    await logAudit({
      userId: session.user.id,
      action: "DELETE",
      entityType: "Event",
      entityId: id,
      summary: `Suppression d'un événement ${existing.type} (${existing.year}) sur ${
        existing.subjectCompany?.initialName ?? existing.subjectSolution?.initialName ?? "?"
      }`,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
