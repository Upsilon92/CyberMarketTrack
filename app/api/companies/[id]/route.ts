import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { companySchema } from "@/lib/validation";
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
    const existing = await prisma.company.findUnique({ where: { id } });
    if (!existing) return notFound();

    const parsed = companySchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);
    const { types, ...data } = parsed.data;

    const company = await prisma.company.update({
      where: { id },
      data: {
        ...data,
        // Replace the type assignments wholesale (simple and predictable)
        types: { deleteMany: {}, create: types.map((type) => ({ type })) },
      },
    });

    await logAudit({
      userId: session.user.id,
      action: "UPDATE",
      entityType: "Company",
      entityId: id,
      summary: `Modification de l'entreprise ${company.initialName}`,
    });

    return NextResponse.json(company);
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    const { id } = await ctx.params;
    const existing = await prisma.company.findUnique({
      where: { id },
      include: { initialSolutions: true },
    });
    if (!existing) return notFound();

    // Refuse deletion while solutions anchor to this company (initialCompanyId
    // is the anchor of the transfer chain — deleting would orphan them).
    if (existing.initialSolutions.length > 0) {
      return NextResponse.json(
        { error: "Company still owns solutions", code: "hasSolutions" },
        { status: 409 }
      );
    }

    await prisma.company.delete({ where: { id } });

    await logAudit({
      userId: session.user.id,
      action: "DELETE",
      entityType: "Company",
      entityId: id,
      summary: `Suppression de l'entreprise ${existing.initialName}`,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
