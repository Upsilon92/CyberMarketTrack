// Cumulative LLM token usage counter (admin): read the running totals, or reset
// them. The numbers come from each provider's `usage` field — see lib/llm.ts.
import { NextResponse } from "next/server";
import { requireAdmin, unauthorized, serverError } from "@/lib/api-utils";
import { readLlmUsage, resetLlmUsage } from "@/lib/llm";

export async function GET() {
  const session = await requireAdmin();
  if (!session) return unauthorized();
  return NextResponse.json(await readLlmUsage());
}

export async function DELETE() {
  const session = await requireAdmin();
  if (!session) return unauthorized();
  try {
    await resetLlmUsage();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
