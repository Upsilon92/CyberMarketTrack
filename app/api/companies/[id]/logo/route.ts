// Logo upload for a company: stores the image as a data URI in `logoUrl`.
// Data URI (vs a filesystem path) survives JSON backups and Docker rebuilds
// without any writable public/ volume. Small images only (transparent PNG/SVG
// recommended so the logo adapts to light/dark).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requireAdmin, unauthorized, notFound, serverError } from "@/lib/api-utils";

const MAX_BYTES = 512 * 1024; // 512 KB (landscape logos with the company name)
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"];

/**
 * Verifies the file's real content matches an allowed image type by inspecting
 * its magic bytes — the browser-provided MIME type is spoofable, so we never
 * trust it alone (spec security requirement #1). Returns the trusted MIME type,
 * or null if the bytes don't match any allowed image format.
 */
function detectImageType(buf: Buffer): string | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return "image/png";
  // JPEG: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  // GIF: "GIF8"
  if (buf.length >= 4 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38)
    return "image/gif";
  // WebP: "RIFF"...."WEBP"
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  // SVG: an XML/text file containing an <svg root element (scan the head only)
  const head = buf.toString("utf8", 0, Math.min(buf.length, 1024)).toLowerCase();
  if (head.includes("<svg")) return "image/svg+xml";
  return null;
}

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
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Too large", code: "tooBig" }, { status: 413 });
    }
    // Declared type must be in the allowlist AND the real content must match.
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json({ error: "Unsupported type", code: "badType" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const realType = detectImageType(buffer);
    if (!realType) {
      return NextResponse.json({ error: "Not an image", code: "badType" }, { status: 400 });
    }
    // Use the content-detected type (not the client-provided one) for the URI.
    const dataUri = `data:${realType};base64,${buffer.toString("base64")}`;

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
