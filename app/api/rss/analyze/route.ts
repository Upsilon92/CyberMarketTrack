// Trigger the RSS→LLM→proposals pipeline. Callable by an admin (button) OR by a
// scheduler on the NAS via the X-Cron-Secret header (so it can run even when no
// one is logged in). GET returns the current LLM status + backlog counts.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analyzeFeed } from "@/lib/rss-analyze";
import { getLlmConfig, llmHealthCheck } from "@/lib/llm";
import { unauthorized, serverError } from "@/lib/api-utils";

async function authorized(req: NextRequest): Promise<boolean> {
  const session = await auth();
  if (session?.user?.role === "ADMIN") return true;
  const secret = req.headers.get("x-cron-secret");
  return !!process.env.CRON_SECRET && secret === process.env.CRON_SECRET;
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) return unauthorized();
  try {
    const report = await analyzeFeed();
    return NextResponse.json(report);
  } catch (e) {
    return serverError(e);
  }
}

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") return unauthorized();
  const cfg = getLlmConfig();
  const [health, pending, processed] = await Promise.all([
    llmHealthCheck(cfg),
    prisma.feedItem.count({ where: { status: "PENDING" } }),
    prisma.feedItem.count({ where: { status: "PROCESSED" } }),
  ]);
  return NextResponse.json({
    provider: cfg.provider,
    model: cfg.model,
    baseUrl: cfg.provider === "ollama" ? cfg.baseUrl : undefined,
    online: health.ok,
    detail: health.detail,
    backlog: pending,
    processed,
  });
}
