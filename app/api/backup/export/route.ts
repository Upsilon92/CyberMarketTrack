// Full JSON export of the database (downloadable, re-importable).
import { NextResponse } from "next/server";
import { exportDatabase } from "@/lib/backup";
import { requireAdmin, unauthorized, serverError } from "@/lib/api-utils";

export async function GET() {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    const data = await exportDatabase();
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="cybermarkettrack-export-${stamp}.json"`,
      },
    });
  } catch (e) {
    return serverError(e);
  }
}
