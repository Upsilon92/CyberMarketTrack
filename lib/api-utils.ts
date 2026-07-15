// Shared helpers for API routes: admin guard + uniform error responses.
// Client-facing messages stay generic (spec security requirement #9);
// details go to the server logs only.
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireAdmin } from "@/lib/auth";

export { requireAdmin };

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** Zod issues -> { field: messageKey } map the forms can translate. */
export function validationError(error: ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_";
    if (!fields[path]) fields[path] = issue.message;
  }
  return NextResponse.json({ error: "Validation failed", fields }, { status: 400 });
}

/** Coherence errors from lib/timeline validation (blocking). */
export function coherenceError(codes: string[]) {
  return NextResponse.json({ error: "Incoherent event sequence", codes }, { status: 400 });
}

export function serverError(e: unknown) {
  console.error("[api]", e); // server-side detail
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
