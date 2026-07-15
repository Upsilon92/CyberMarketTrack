import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { companySchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { requireAdmin, unauthorized, validationError, serverError } from "@/lib/api-utils";

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    const parsed = companySchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);
    const { types, ...data } = parsed.data;

    const company = await prisma.company.create({
      data: { ...data, types: { create: types.map((type) => ({ type })) } },
    });

    await logAudit({
      userId: session.user.id,
      action: "CREATE",
      entityType: "Company",
      entityId: company.id,
      summary: `Création de l'entreprise ${company.initialName}`,
    });

    return NextResponse.json(company, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
