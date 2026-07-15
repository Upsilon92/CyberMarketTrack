import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requireAdmin, unauthorized, notFound, serverError } from "@/lib/api-utils";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    const { id } = await ctx.params;
    const existing = await prisma.alias.findUnique({ where: { id } });
    if (!existing) return notFound();

    await prisma.alias.delete({ where: { id } });

    await logAudit({
      userId: session.user.id,
      action: "DELETE",
      entityType: "Alias",
      entityId: id,
      summary: `Suppression de l'alias « ${existing.name} »`,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
