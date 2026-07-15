import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { comparatorSaveSchema } from "@/lib/comparator";
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
    const existing = await prisma.comparator.findUnique({ where: { id } });
    if (!existing) return notFound();

    const parsed = comparatorSaveSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);

    await prisma.comparator.update({
      where: { id },
      data: { name: parsed.data.name, content: JSON.stringify(parsed.data.content) },
    });

    await logAudit({
      userId: session.user.id,
      action: "UPDATE",
      entityType: "Comparator",
      entityId: id,
      summary: `Modification du comparateur « ${parsed.data.name} »`,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    const { id } = await ctx.params;
    const existing = await prisma.comparator.findUnique({ where: { id } });
    if (!existing) return notFound();

    await prisma.comparator.delete({ where: { id } });

    await logAudit({
      userId: session.user.id,
      action: "DELETE",
      entityType: "Comparator",
      entityId: id,
      summary: `Suppression du comparateur « ${existing.name} »`,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
