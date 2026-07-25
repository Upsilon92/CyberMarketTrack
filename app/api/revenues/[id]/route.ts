import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revenueSchema } from "@/lib/validation";
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
    const existing = await prisma.revenue.findUnique({ where: { id } });
    if (!existing) return notFound();

    const parsed = revenueSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);

    const revenue = await prisma.revenue.update({ where: { id }, data: parsed.data });

    await logAudit({
      userId: session.user.id,
      action: "UPDATE",
      entityType: "Revenue",
      entityId: revenue.id,
      summary: `CA ${parsed.data.year} : ${parsed.data.amount} M${parsed.data.currency}`,
    });

    return NextResponse.json(revenue);
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    const { id } = await ctx.params;
    const existing = await prisma.revenue.findUnique({ where: { id } });
    if (!existing) return notFound();

    await prisma.revenue.delete({ where: { id } });

    await logAudit({
      userId: session.user.id,
      action: "DELETE",
      entityType: "Revenue",
      entityId: id,
      summary: `Suppression du CA ${existing.year}`,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
