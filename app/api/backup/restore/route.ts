// Restore from a JSON export: strict schema validation before ANY write,
// size limit, atomic transaction (all or nothing).
import { NextRequest, NextResponse } from "next/server";
import { backupFileSchema, restoreDatabase } from "@/lib/backup";
import { logAudit } from "@/lib/audit";
import { requireAdmin, unauthorized, serverError } from "@/lib/api-utils";

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    const raw = await req.text();
    if (raw.length > MAX_SIZE) {
      return NextResponse.json({ error: "File too large", code: "tooBig" }, { status: 413 });
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Invalid JSON", code: "invalidFile" }, { status: 400 });
    }

    const parsed = backupFileSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid backup schema", code: "invalidFile" }, { status: 400 });
    }

    await restoreDatabase(parsed.data);

    await logAudit({
      userId: session.user.id,
      action: "RESTORE",
      entityType: "Database",
      entityId: "-",
      summary: `Restauration complète depuis un export JSON du ${parsed.data.exportedAt}`,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
