import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { eventSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { checkEventCoherence, eventSummary, subjectName } from "@/lib/event-checks";
import {
  requireAdmin,
  unauthorized,
  notFound,
  validationError,
  coherenceError,
  serverError,
} from "@/lib/api-utils";

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    const parsed = eventSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);
    const data = parsed.data;

    // Coherence of the event sequence (spec: validation à la saisie)
    const coherence = await checkEventCoherence(data);
    if (!coherence.subjectFound) return notFound();
    if (coherence.errors.length > 0) {
      return coherenceError(coherence.errors.map((i) => i.code));
    }

    const event = await prisma.event.create({ data });

    await logAudit({
      userId: session.user.id,
      action: "CREATE",
      entityType: "Event",
      entityId: event.id,
      summary: eventSummary(data, await subjectName(data)),
    });

    return NextResponse.json(
      { event, warnings: coherence.warnings.map((i) => i.code) },
      { status: 201 }
    );
  } catch (e) {
    return serverError(e);
  }
}
