import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { comparatorSaveSchema } from "@/lib/comparator";
import { logAudit } from "@/lib/audit";
import { requireAdmin, unauthorized, validationError, serverError } from "@/lib/api-utils";

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    // Strict schema validation — also the entry point for imported JSON
    const parsed = comparatorSaveSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);

    const comparator = await prisma.comparator.create({
      data: { name: parsed.data.name, content: JSON.stringify(parsed.data.content) },
    });

    await logAudit({
      userId: session.user.id,
      action: "CREATE",
      entityType: "Comparator",
      entityId: comparator.id,
      summary: `Création du comparateur « ${comparator.name} »`,
    });

    return NextResponse.json({ id: comparator.id }, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
