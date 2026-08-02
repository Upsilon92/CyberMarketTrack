// Test LLM availability for the (possibly unsaved) config the admin is editing,
// WITHOUT consuming tokens: Ollama lists local models (/api/tags), hosted
// providers list models (GET /v1/models). Returns online/offline + detail.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, unauthorized, validationError, serverError } from "@/lib/api-utils";
import {
  llmHealthCheck,
  readLlmSettings,
  DEFAULT_BASE,
  DEFAULT_MODEL,
  type LlmConfig,
} from "@/lib/llm";
import { safeDecrypt } from "@/lib/crypto";

const testSchema = z.object({
  provider: z.enum(["ollama", "anthropic", "mistral"]),
  baseUrl: z.string().trim().max(300).optional(),
  model: z.string().trim().max(120).optional(),
  apiKey: z.string().max(1000).optional(), // empty = use the stored key
  numGpu: z.coerce.number().int().min(0).max(200).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return unauthorized();
  try {
    const parsed = testSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);
    const d = parsed.data;

    const stored = await readLlmSettings();
    const apiKey = d.apiKey && d.apiKey.trim() ? d.apiKey.trim() : safeDecrypt(stored.apiKeyEnc);

    const cfg: LlmConfig = {
      provider: d.provider,
      baseUrl: d.baseUrl?.trim() || DEFAULT_BASE[d.provider],
      model: d.model?.trim() || DEFAULT_MODEL[d.provider],
      apiKey: apiKey || undefined,
      timeoutMs: 8_000,
      numGpu: d.numGpu ?? undefined,
    };

    const health = await llmHealthCheck(cfg);
    return NextResponse.json({ ok: health.ok, detail: health.detail });
  } catch (e) {
    return serverError(e);
  }
}
