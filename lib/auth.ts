// =============================================================================
// Auth.js v5 — full configuration (Node only).
// Single-admin credentials sign-in with bcrypt verification and rate limiting
// (spec security requirement #4):
//   - 5 attempts / minute / username  (brute force on the admin password)
//   - 20 attempts / minute / client IP (throttles username guessing, since the
//     login form now says whether the username exists — requested by Louis)
// Failures throw a LoginError whose `code` tells the login page WHICH case it
// is (unknown username / wrong password / too many attempts + retry delay).
// =============================================================================
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";
import { hitRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { clientIpFromHeaders } from "@/lib/client-ip";

export const LOGIN_MAX_PER_USER = 5;
export const LOGIN_MAX_PER_IP = 20;
export const LOGIN_WINDOW_MS = 60_000;

export type LoginErrorCode = "unknownUser" | "badPassword" | "rateLimited";

/** Typed sign-in failure, surfaced to the login page (never contains secrets). */
export class LoginError extends CredentialsSignin {
  /** Seconds before a new attempt is allowed (rateLimited only). */
  retryAfter: number;
  /** Attempts left before the temporary block (unknownUser / badPassword). */
  remaining: number;
  constructor(code: LoginErrorCode, opts: { retryAfter?: number; remaining?: number } = {}) {
    super(code);
    this.code = code;
    this.retryAfter = opts.retryAfter ?? 0;
    this.remaining = opts.remaining ?? 0;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const username = String(credentials?.username ?? "").slice(0, 100);
        const password = String(credentials?.password ?? "").slice(0, 200);
        if (!username || !password) return null;

        // Rate limiting BEFORE any lookup: per client IP, then per username.
        const ip = clientIpFromHeaders(request.headers);
        const byIp = hitRateLimit(`login-ip:${ip}`, LOGIN_MAX_PER_IP, LOGIN_WINDOW_MS);
        if (!byIp.ok) throw new LoginError("rateLimited", { retryAfter: Math.ceil(byIp.retryAfterMs / 1000) });
        const userKey = `login:${username.toLowerCase()}`;
        const byUser = hitRateLimit(userKey, LOGIN_MAX_PER_USER, LOGIN_WINDOW_MS);
        if (!byUser.ok) throw new LoginError("rateLimited", { retryAfter: Math.ceil(byUser.retryAfterMs / 1000) });

        // First-run (no admin yet) is handled by the setup flow (/api/setup via
        // the login page), not by a default password.
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) throw new LoginError("unknownUser", { remaining: byUser.remaining });

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) throw new LoginError("badPassword", { remaining: byUser.remaining });

        resetRateLimit(userKey);
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
