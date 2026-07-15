import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { solutionSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import {
  requireAdmin,
  unauthorized,
  notFound,
  validationError,
  serverError,
} from "@/lib/api-utils";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    const { id } = await ctx.params;
    const existing = await prisma.solution.findUnique({ where: { id } });
    if (!existing) return notFound();

    const parsed = solutionSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);
    const { tagIds = [], ...data } = parsed.data;

    const solution = await prisma.solution.update({
      where: { id },
      data: { ...data, tags: { set: tagIds.map((tid) => ({ id: tid })) } },
    });

    await logAudit({
      userId: session.user.id,
      action: "UPDATE",
      entityType: "Solution",
      entityId: id,
      summary: `Modification de la solution ${solution.initialName}`,
    });

    return NextResponse.json(solution);
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    const { id } = await ctx.params;
    const existing = await prisma.solution.findUnique({ where: { id } });
    if (!existing) return notFound();

    await prisma.solution.delete({ where: { id } }); // events cascade

    await logAudit({
      userId: session.user.id,
      action: "DELETE",
      entityType: "Solution",
      entityId: id,
      summary: `Suppression de la solution ${existing.initialName}`,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
