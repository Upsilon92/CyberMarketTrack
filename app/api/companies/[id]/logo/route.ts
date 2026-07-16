// Logo upload for a company: stores the image as a data URI in `logoUrl`.
// Data URI (vs a filesystem path) survives JSON backups and Docker rebuilds
// without any writable public/ volume. Small images only (transparent PNG/SVG
// recommended so the logo adapts to light/dark).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requireAdmin, unauthorized, notFound, serverError } from "@/lib/api-utils";

const MAX_BYTES = 256 * 1024; // 256 KB
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"];

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    const { id } = await ctx.params;
    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) return notFound();

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file", code: "noFile" }, { status: 400 });
    }
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json({ error: "Unsupported type", code: "badType" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Too large", code: "tooBig" }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const dataUri = `data:${file.type};base64,${buffer.toString("base64")}`;

    await prisma.company.update({ where: { id }, data: { logoUrl: dataUri } });
    await logAudit({
      userId: session.user.id,
      action: "UPDATE",
      entityType: "Company",
      entityId: id,
      summary: `Mise à jour du logo de ${company.initialName}`,
    });

    return NextResponse.json({ ok: true, logoUrl: dataUri });
  } catch (e) {
    return serverError(e);
  }
}

// Remove the logo
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return unauthorized();
  try {
    const { id } = await ctx.params;
    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) return notFound();
    await prisma.company.update({ where: { id }, data: { logoUrl: null } });
    await logAudit({
      userId: session.user.id,
      action: "UPDATE",
      entityType: "Company",
      entityId: id,
      summary: `Suppression du logo de ${company.initialName}`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
