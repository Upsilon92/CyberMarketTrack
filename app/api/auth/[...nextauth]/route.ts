// Auth.js route handlers (sign-in, sign-out, session, CSRF — all built in).
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
