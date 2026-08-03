// Centralized on-demand LLM analysis (companies / solutions / events), streamed
// as NDJSON so the admin sees a live progress bar, per-entity log and running
// token counter. Each analyzed entity yields a proposal to review.
import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { analyzeEntities, type AnalyzeProgress } from "@/lib/llm-analyze";
import { loadLlmConfig } from "@/lib/llm";
import { unauthorized } from "@/lib/api-utils";

const bodySchema = z.object({
  type: z.enum(["company", "solution", "event"]),
  ids: z.array(z.string().min(1)).max(500).default([]),
  newNames: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") return unauthorized();

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return new Response("bad request", { status: 400 });
  const input = parsed.data;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AnalyzeProgress) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {
          /* client disconnected */
        }
      };
      try {
        const cfg = await loadLlmConfig();
        await analyzeEntities(input, send, cfg);
      } catch (e) {
        send({ type: "skipped", detail: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
