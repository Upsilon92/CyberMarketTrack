import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revenueSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { requireAdmin, unauthorized, validationError, serverError } from "@/lib/api-utils";

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    const parsed = revenueSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);

    // Upsert on (companyId, year): entering the same year twice updates it
    const revenue = await prisma.revenue.upsert({
      where: { companyId_year: { companyId: parsed.data.companyId, year: parsed.data.year } },
      create: parsed.data,
      update: parsed.data,
    });

    await logAudit({
      userId: session.user.id,
      action: "UPDATE",
      entityType: "Revenue",
      entityId: revenue.id,
      summary: `CA ${parsed.data.year} : ${parsed.data.amount} M${parsed.data.currency}`,
    });

    return NextResponse.json(revenue, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
