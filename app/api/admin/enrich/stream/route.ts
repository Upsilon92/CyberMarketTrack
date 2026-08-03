// Direct-apply batch enrichment of existing companies, streamed as NDJSON so the
// admin sees a live progress bar, a per-company log, and a running token counter.
import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { enrichBatch, type EnrichProgress } from "@/lib/batch-enrich";
import { loadLlmConfig } from "@/lib/llm";
import { unauthorized } from "@/lib/api-utils";

const bodySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(15),
  onlyMissing: z.boolean().optional(),
  skipAnalyzed: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") return unauthorized();

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  const opts = parsed.success ? parsed.data : { limit: 15 };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: EnrichProgress) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {
          /* client disconnected */
        }
      };
      try {
        const cfg = await loadLlmConfig();
        await enrichBatch(opts, send, cfg);
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
