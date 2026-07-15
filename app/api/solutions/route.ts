import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { solutionSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { requireAdmin, unauthorized, validationError, serverError } from "@/lib/api-utils";

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    const parsed = solutionSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);
    const { tagIds = [], ...data } = parsed.data;

    const solution = await prisma.solution.create({
      data: { ...data, tags: { connect: tagIds.map((id) => ({ id })) } },
    });

    await logAudit({
      userId: session.user.id,
      action: "CREATE",
      entityType: "Solution",
      entityId: solution.id,
      summary: `Création de la solution ${solution.initialName}`,
    });

    return NextResponse.json(solution, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
