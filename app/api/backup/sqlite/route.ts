// Direct download of the SQLite database file.
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { requireAdmin, unauthorized, serverError } from "@/lib/api-utils";

export async function GET() {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    // DATABASE_URL is "file:./data/cybermarkettrack.db" relative to the project root
    const url = process.env.DATABASE_URL ?? "file:./data/cybermarkettrack.db";
    const relative = url.replace(/^file:/, "");
    const filePath = path.resolve(process.cwd(), relative);
    const buffer = await readFile(filePath);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="cybermarkettrack-${stamp}.db"`,
      },
    });
  } catch (e) {
    return serverError(e);
  }
}
