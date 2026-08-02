// Streaming variant of the RSS→LLM analysis for the admin UI: runs the SAME
// single analysis as POST /api/rss/analyze but emits NDJSON progress events as
// each feed item is processed, so the admin sees a live progress bar + per-item
// results. This consumes NO extra tokens — it narrates the one in-flight run.
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { analyzeFeed, type AnalyzeProgress } from "@/lib/rss-analyze";
import { loadLlmConfig } from "@/lib/llm";
import { unauthorized } from "@/lib/api-utils";

export async function POST(_req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") return unauthorized();

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
        await analyzeFeed(cfg, send);
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
      "X-Accel-Buffering": "no", // disable proxy buffering so events flush live
    },
  });
}
