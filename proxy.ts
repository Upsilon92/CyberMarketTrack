// =============================================================================
// Next 16 Proxy (formerly middleware): first line of defense.
//
// - /admin/**            -> requires an authenticated ADMIN session
// - mutations on /api/** -> 401 without a session (except /api/auth/**)
//
// This is an optimistic check only: every mutation route ALSO verifies the
// session server-side via requireAdmin() (spec security requirement #6).
// Uses the edge-safe auth config (no Prisma import here).
// =============================================================================
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth?.user;
  const isAdminArea = nextUrl.pathname.startsWith("/admin");
  const isAuthApi = nextUrl.pathname.startsWith("/api/auth");
  const isApiMutation =
    nextUrl.pathname.startsWith("/api") && !isAuthApi && req.method !== "GET";

  if (isAdminArea && !isLoggedIn) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isApiMutation && !isLoggedIn) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
