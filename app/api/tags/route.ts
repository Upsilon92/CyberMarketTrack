import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tagSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { requireAdmin, unauthorized, validationError, serverError } from "@/lib/api-utils";

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    const parsed = tagSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);

    const tag = await prisma.tag.create({ data: parsed.data });

    await logAudit({
      userId: session.user.id,
      action: "CREATE",
      entityType: "Tag",
      entityId: tag.id,
      summary: `Création du tag ${tag.labelFr} (${tag.family})`,
    });

    return NextResponse.json(tag, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
