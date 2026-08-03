// Bulk, DETERMINISTIC re-calibration of existing events' importance to the
// editorial rules (clampEventImportance) — no LLM call, so it's free and
// instant. FUNDING/IPO stop being MAJOR, MAJOR is kept only on notable
// ACQUISITION/MERGER, etc. Only rows whose importance actually changes are
// written.
import { prisma } from "@/lib/prisma";
import { clampEventImportance } from "@/lib/constants";

export async function recalibrateEventImportance(): Promise<{ scanned: number; updated: number }> {
  const events = await prisma.event.findMany({
    select: { id: true, type: true, importance: true, amount: true },
  });
  let updated = 0;
  for (const e of events) {
    const next = clampEventImportance(e.type, e.importance, e.amount);
    if (next !== e.importance) {
      await prisma.event.update({ where: { id: e.id }, data: { importance: next } });
      updated++;
    }
  }
  return { scanned: events.length, updated };
}
