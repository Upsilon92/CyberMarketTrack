// Deterministic bulk re-calibration of existing events' importance (no LLM,
// no tokens). Admin-only.
import { NextResponse } from "next/server";
import { requireAdmin, unauthorized, serverError } from "@/lib/api-utils";
import { recalibrateEventImportance } from "@/lib/recalibrate";
import { logAudit } from "@/lib/audit";

export async function POST() {
  const session = await requireAdmin();
  if (!session) return unauthorized();
  try {
    const result = await recalibrateEventImportance();
    await logAudit({
      userId: session.user.id,
      action: "UPDATE",
      entityType: "Event",
      entityId: "*",
      summary: `Recalibrage importance: ${result.updated}/${result.scanned} événements`,
    });
    return NextResponse.json(result);
  } catch (e) {
    return serverError(e);
  }
}
