import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { aliasSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { requireAdmin, unauthorized, validationError, serverError } from "@/lib/api-utils";

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    const parsed = aliasSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);

    const alias = await prisma.alias.create({ data: parsed.data });

    await logAudit({
      userId: session.user.id,
      action: "CREATE",
      entityType: "Alias",
      entityId: alias.id,
      summary: `Ajout de l'alias « ${alias.name} »`,
    });

    return NextResponse.json(alias, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
