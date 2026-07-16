// Exports every company logo as a ZIP (one image file per company). Logos are
// stored as data URIs in `logoUrl`; only uploaded logos (data:) and directly
// downloadable ones are included. Remote http(s) URLs are listed in a manifest
// instead (the server does not fetch external URLs).
import { NextResponse } from "next/server";
import JSZip from "jszip";
import { prisma } from "@/lib/prisma";
import { requireAdmin, unauthorized, serverError } from "@/lib/api-utils";

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

/** Filesystem-safe file name from a company name. */
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim().replace(/\s+/g, "_") || "company";
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
