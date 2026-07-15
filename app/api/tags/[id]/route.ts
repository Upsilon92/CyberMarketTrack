import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tagSchema } from "@/lib/validation";
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
    const existing = await prisma.tag.findUnique({ where: { id } });
    if (!existing) return notFound();

    const parsed = tagSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);

    const tag = await prisma.tag.update({ where: { id }, data: parsed.data });

    await logAudit({
      userId: session.user.id,
      action: "UPDATE",
      entityType: "Tag",
      entityId: id,
      summary: `Modification du tag ${tag.labelFr}`,
    });

    return NextResponse.json(tag);
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    const { id } = await ctx.params;
    const existing = await prisma.tag.findUnique({ where: { id } });
    if (!existing) return notFound();

    await prisma.tag.delete({ where: { id } });

    await logAudit({
      userId: session.user.id,
      action: "DELETE",
      entityType: "Tag",
      entityId: id,
      summary: `Suppression du tag ${existing.labelFr}`,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
