// GET  exports every company logo as a ZIP (one image file per company, named
//      after the company). POST re-imports such a ZIP, matching each image to a
//      company by its filename — a round-trip so logos can be re-associated.
// Logos are stored as data URIs in `logoUrl`.
import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { prisma } from "@/lib/prisma";
import { loadMarket } from "@/lib/queries";
import { allNames } from "@/lib/timeline";
import { logAudit } from "@/lib/audit";
import { requireAdmin, unauthorized, serverError } from "@/lib/api-utils";

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};
const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

/** Filesystem-safe file name from a company name. */
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim().replace(/\s+/g, "_") || "company";
}

/** Verifies the bytes really are the claimed image type (defense in depth). */
function looksLikeImage(buf: Buffer, mime: string): boolean {
  if (mime === "image/png") return buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50;
  if (mime === "image/jpeg") return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8;
  if (mime === "image/gif") return buf.length > 4 && buf.toString("ascii", 0, 3) === "GIF";
  if (mime === "image/webp")
    return buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF";
  if (mime === "image/svg+xml")
    return buf.toString("utf8", 0, Math.min(buf.length, 1024)).toLowerCase().includes("<svg");
  return false;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    const companies = await prisma.company.findMany({
      where: { logoUrl: { not: null } },
      select: { id: true, initialName: true, logoUrl: true },
    });

    const zip = new JSZip();
    const used = new Set<string>();
    const externalUrls: string[] = [];

    for (const c of companies) {
      const url = c.logoUrl!;
      if (url.startsWith("data:")) {
        const match = url.match(/^data:([^;]+);base64,(.*)$/);
        if (!match) continue;
        const [, mime, b64] = match;
        const ext = EXT[mime] ?? "bin";
        let base = safeName(c.initialName);
        let file = `${base}.${ext}`;
        let n = 1;
        while (used.has(file)) file = `${base}_${n++}.${ext}`;
        used.add(file);
        zip.file(file, Buffer.from(b64, "base64"));
      } else {
        // Remote URL: recorded in a manifest rather than fetched server-side.
        externalUrls.push(`${c.initialName}\t${url}`);
      }
    }

    if (externalUrls.length > 0) {
      zip.file("_external-logo-urls.txt", externalUrls.join("\n"));
    }

    const content = await zip.generateAsync({ type: "nodebuffer" });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    return new NextResponse(new Uint8Array(content), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="cybermarkettrack-logos-${stamp}.zip"`,
      },
    });
  } catch (e) {
    return serverError(e);
  }
}

const MAX_ZIP = 20 * 1024 * 1024; // 20 MB
const MAX_LOGO = 512 * 1024;

// Import a logos ZIP: each image file is matched to a company by its base
// filename (any current/historical name or alias, normalized), then stored as
// a data URI. Files that match no company are reported, not applied.
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file", code: "noFile" }, { status: 400 });
    }
    if (file.size > MAX_ZIP) {
      return NextResponse.json({ error: "Too large", code: "tooBig" }, { status: 413 });
    }

    // Build a filename-base -> companyId index from every known name + alias.
    const market = await loadMarket();
    const index = new Map<string, string>();
    const add = (name: string, id: string) => {
      const key = safeName(name).toLowerCase();
      if (key && !index.has(key)) index.set(key, id);
    };
    for (const c of market.companies) {
      for (const n of allNames(c.timeline)) add(n, c.id);
      add(c.initialName, c.id);
      for (const a of c.aliases) add(a.name, c.id);
    }

    const zip = await JSZip.loadAsync(Buffer.from(await file.arrayBuffer()));
    const results: { file: string; status: "applied" | "skipped" | "error"; reason?: string }[] = [];
    let applied = 0;

    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue;
      const nameOnly = entry.name.split("/").pop() ?? entry.name;
      if (nameOnly.startsWith("_")) continue; // manifest files
      const dot = nameOnly.lastIndexOf(".");
      const base = (dot === -1 ? nameOnly : nameOnly.slice(0, dot)).toLowerCase();
      const ext = dot === -1 ? "" : nameOnly.slice(dot + 1).toLowerCase();
      const mime = EXT_TO_MIME[ext];
      if (!mime) {
        results.push({ file: nameOnly, status: "skipped", reason: "notImage" });
        continue;
      }
      const companyId = index.get(base);
      if (!companyId) {
        results.push({ file: nameOnly, status: "skipped", reason: "noMatch" });
        continue;
      }
      const buf = Buffer.from(await entry.async("nodebuffer"));
      if (buf.length > MAX_LOGO || !looksLikeImage(buf, mime)) {
        results.push({ file: nameOnly, status: "error", reason: "invalid" });
        continue;
      }
      const dataUri = `data:${mime};base64,${buf.toString("base64")}`;
      await prisma.company.update({ where: { id: companyId }, data: { logoUrl: dataUri } });
      applied++;
      results.push({ file: nameOnly, status: "applied" });
    }

    if (applied > 0) {
      await logAudit({
        userId: session.user.id,
        action: "IMPORT",
        entityType: "Company",
        entityId: "-",
        summary: `Import de ${applied} logo(s) depuis un ZIP`,
      });
    }

    return NextResponse.json({
      applied,
      skipped: results.filter((r) => r.status === "skipped").length,
      errors: results.filter((r) => r.status === "error").length,
      results,
    });
  } catch (e) {
    return serverError(e);
  }
}
