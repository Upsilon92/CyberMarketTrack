import fs from "fs";
import path from "path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl plugin: points to the request-scoped i18n config (cookie-based locale)
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Security headers (spec requirement #5). CSP is deliberately strict:
// no external scripts/styles are used anywhere in the app.
// 'unsafe-inline' is required for Next.js inline styles and theme script.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // React needs eval() in dev mode only (debugging); never in production.
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:", // https: allows external company logos (logoUrl)
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

// This workstation keeps node_modules in ../runtime (Windows junction, see
// ../LISEZMOI.txt). Detect that local layout to adapt two settings:
//  - Turbopack root must be the parent so the junction target stays in-root.
//  - `output: "standalone"` is skipped locally so `npm start` works simply
//    (fast local prod check); Docker (no runtime/ folder) keeps standalone for
//    a small image whose entrypoint runs `node server.js`.
const isLocalRuntimeLayout = fs.existsSync(
  path.join(__dirname, "..", "runtime", "node_modules")
);

const nextConfig: NextConfig = {
  ...(isLocalRuntimeLayout
    ? { turbopack: { root: path.join(__dirname, "..") } }
    : { output: "standalone" }),
  async headers() {
    return [
      // Everything except the logo images route gets the app-wide CSP.
      { source: "/((?!api/logos/).*)", headers: securityHeaders },
      // Logo images (may be uploaded SVG): no script, no subresource, sandboxed,
      // even when opened directly — a stricter CSP than the app's.
      {
        source: "/api/logos/:id",
        headers: [
          ...securityHeaders.filter((h) => h.key !== "Content-Security-Policy"),
          { key: "Content-Security-Policy", value: "default-src 'none'; style-src 'unsafe-inline'; sandbox" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
