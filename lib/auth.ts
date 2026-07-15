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

        // First-run bootstrap (fresh database, e.g. new Docker volume): when
        // NO user exists yet, credentials matching ADMIN_USERNAME/ADMIN_PASSWORD
        // from the environment create the admin account.
        if ((await prisma.user.count()) === 0) {
          const envUser = process.env.ADMIN_USERNAME ?? "admin";
          const envPass = process.env.ADMIN_PASSWORD;
          if (envPass && username === envUser && password === envPass) {
            const created = await prisma.user.create({
              data: {
                username: envUser,
                passwordHash: await bcrypt.hash(envPass, 12),
                role: "ADMIN",
              },
            });
            return { id: created.id, name: created.username, role: created.role };
          }
          return null;
        }

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
