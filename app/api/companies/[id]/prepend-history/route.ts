// =============================================================================
// "Add an earlier past" assistant for a COMPANY (mirror of the solution one).
//
// A company's anchor fields (initialName, foundedYear/Month) are the START of
// its derived chains. When the user later learns the company existed EARLIER
// under another name, this endpoint:
//   1. moves the anchor name back to that older value, and
//   2. creates a COMPANY_RENAME event at the change date so the (previously
//      initial) name becomes a derived period.
// Optionally the founding date is pushed back.
//
// One transaction: anchor + event move together or not at all. Coherence is
// checked with the same pure validator as manual entry.
// =============================================================================
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { validateCompanyEvents, type TimelineEventInput } from "@/lib/timeline";
import { yearSchema, monthSchema } from "@/lib/validation";
import {
  requireAdmin,
  unauthorized,
  notFound,
  validationError,
  coherenceError,
  serverError,
} from "@/lib/api-utils";

const prependSchema = z.object({
  previousName: z.string().trim().min(1).max(200),
  changeYear: yearSchema,
  changeMonth: monthSchema,
  newFoundedYear: yearSchema.nullable().optional(),
  newFoundedMonth: monthSchema,
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    const { id } = await ctx.params;
    const company = await prisma.company.findUnique({
      where: { id },
      include: { subjectEvents: true },
    });
    if (!company) return notFound();

    const parsed = prependSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);
    const { previousName, changeYear, changeMonth, newFoundedYear, newFoundedMonth } = parsed.data;

    const curName = company.initialName;
    const newFounded =
      newFoundedYear != null
        ? { foundedYear: newFoundedYear, foundedMonth: newFoundedMonth ?? null }
        : { foundedYear: company.foundedYear, foundedMonth: company.foundedMonth };

    // Nothing to derive if the "previous" name equals the current anchor.
    if (previousName === curName) {
      return NextResponse.json({ ok: true, created: 0 });
    }

    const renameEvent = {
      type: "COMPANY_RENAME" as const,
      year: changeYear,
      month: changeMonth ?? null,
      newName: curName,
      subjectCompanyId: id,
    };

    // Coherence against the FUTURE state (new anchor + existing + new event).
    const futureEvents: TimelineEventInput[] = [
      ...company.subjectEvents,
      { id: "__new0__", ...renameEvent },
    ];
    const issues = validateCompanyEvents(
      { initialName: previousName, ...newFounded } as Parameters<typeof validateCompanyEvents>[0],
      futureEvents
    );
    const blocking = issues.filter((iss) => iss.level === "error");
    if (blocking.length > 0) return coherenceError(blocking.map((iss) => iss.code));

    await prisma.$transaction([
      prisma.company.update({
        where: { id },
        data: { initialName: previousName, ...newFounded },
      }),
      prisma.event.create({ data: renameEvent }),
    ]);

    await logAudit({
      userId: session.user.id,
      action: "UPDATE",
      entityType: "Company",
      entityId: id,
      summary: `Ajout d'un historique antérieur à ${curName} (ancre → ${previousName})`,
    });

    return NextResponse.json({ ok: true, created: 1 });
  } catch (e) {
    return serverError(e);
  }
}
