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

const nextConfig: NextConfig = {
  // Standalone output keeps the Docker image small (multi-stage build)
  output: "standalone",
  // On this workstation the real node_modules lives in ../runtime/node_modules
  // (Windows junction, see ../LISEZMOI.txt): declare the parent folder as the
  // Turbopack root so the junction target stays inside the watched filesystem
  // root. In Docker (no runtime/ folder) the default root is kept.
  ...(fs.existsSync(path.join(__dirname, "..", "runtime", "node_modules"))
    ? { turbopack: { root: path.join(__dirname, "..") } }
    : {}),
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
