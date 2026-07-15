// Live preview endpoint for the history editor: "here is how the history
// will be recalculated" BEFORE saving. Same validation path as the real
// create/update, but nothing is written.
import { NextRequest, NextResponse } from "next/server";
import { eventSchema } from "@/lib/validation";
import { checkEventCoherence } from "@/lib/event-checks";
import {
  requireAdmin,
  unauthorized,
  notFound,
  validationError,
  serverError,
} from "@/lib/api-utils";

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    const body = await req.json();
    const excludeEventId: string | undefined = body.excludeEventId ?? undefined;
    const parsed = eventSchema.safeParse(body.event);
    if (!parsed.success) return validationError(parsed.error);

    const coherence = await checkEventCoherence(parsed.data, excludeEventId);
    if (!coherence.subjectFound) return notFound();

    return NextResponse.json({
      errors: coherence.errors.map((i) => i.code),
      warnings: coherence.warnings.map((i) => i.code),
      companyTimeline: coherence.companyTimeline ?? null,
      solutionTimeline: coherence.solutionTimeline ?? null,
    });
  } catch (e) {
    return serverError(e);
  }
}
