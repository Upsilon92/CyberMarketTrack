// Serves a company's UPLOADED logo (stored as a base64 data: URI) as a real
// image, so data-heavy views (the Explorer) can reference logos by URL instead
// of inlining megabytes of data URIs. Public (logos are public on company pages).
//
// Hardening:
//  - strict id format, read-only, GET only;
//  - only whitelisted raster/SVG image types are served, decoded from base64;
//  - `Content-Security-Policy: default-src 'none'; sandbox` + nosniff so an SVG
//    opened directly can never run script in our origin (stored-XSS guard);
//  - external (http/https) logos are NOT proxied or redirected here (no open
//    redirect / SSRF) — the client uses those URLs directly.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ID_RE = /^[a-z0-9]{8,40}$/i;
const DATA_URI_RE = /^data:(image\/(?:png|jpeg|jpg|webp|gif|svg\+xml));base64,([a-z0-9+/=\s]+)$/i;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return new NextResponse(null, { status: 404 });

  const c = await prisma.company.findUnique({ where: { id }, select: { logoUrl: true } });
  const m = c?.logoUrl?.match(DATA_URI_RE);
  if (!m) return new NextResponse(null, { status: 404 });

  const type = m[1].toLowerCase() === "image/jpg" ? "image/jpeg" : m[1].toLowerCase();
  const body = Buffer.from(m[2].replace(/\s+/g, ""), "base64");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": type,
      "Content-Length": String(body.length),
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "Content-Disposition": "inline",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
