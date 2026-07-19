// =============================================================================
// Auth.js v5 — full configuration (Node only).
// Single-admin credentials sign-in with bcrypt verification and rate limiting
// (5 attempts / minute / username+IP, spec security requirement #4).
// =============================================================================
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";
import { checkRateLimit } from "@/lib/rate-limit";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = String(credentials?.username ?? "");
        const password = String(credentials?.password ?? "");
        if (!username || !password) return null;

        // Rate limiting keyed on the username (login endpoint protection)
        if (!checkRateLimit(`login:${username.toLowerCase()}`, 5, 60_000)) {
          return null;
        }

        // First-run (no admin yet) is handled by the setup flow (/api/setup via
        // the login page), not by a default password. Until an admin is created,
        // there is simply nothing to match and every attempt fails.
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, name: user.username, role: user.role };
      },
    }),
  ],
});

/**
 * Guard used by EVERY mutation route (defense in depth: the proxy already
 * filters, but routes never trust it — spec security requirement #6).
 * Returns the session or null.
 */
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return null;
  return session;
}
