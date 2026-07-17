// =============================================================================
// Auth.js v5 — edge-safe partial configuration.
//
// This file must NOT import Prisma or bcrypt: it is consumed by proxy.ts
// (Next 16's middleware), which may run outside Node. The Credentials
// provider (which needs the database) lives in lib/auth.ts and only executes
// inside the sign-in API route (always Node).
//
// v1 has a single ADMIN user. The `role` claim is already propagated to the
// JWT and the session so multi-user RBAC can be added later without reshaping
// the auth layer (see ARCHITECTURE.md).
// =============================================================================
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  // Self-hosted: the app is always reached behind a reverse proxy or by IP
  // (e.g. http://192.168.1.33:3000), never on a domain Auth.js recognizes.
  // Trust the Host header so Auth.js stops rejecting requests with
  // "UntrustedHost". This is the documented self-hosting setting and does not
  // rely on the AUTH_TRUST_HOST env var reaching the runtime.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [], // filled in lib/auth.ts
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "ADMIN";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
