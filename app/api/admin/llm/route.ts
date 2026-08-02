// Admin LLM configuration: persist the provider / base URL / model / API key /
// timeout / GPU layers to the Setting table. The API key is stored ENCRYPTED
// (lib/crypto) and NEVER returned to the browser. An empty apiKey field keeps
// the existing key; clearKey removes it.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, unauthorized, validationError, serverError } from "@/lib/api-utils";
import { readLlmSettings, writeLlmSettings, type StoredLlmSettings } from "@/lib/llm";
import { encryptSecret } from "@/lib/crypto";

const saveSchema = z.object({
  provider: z.enum(["ollama", "anthropic", "mistral"]),
  baseUrl: z.string().trim().max(300).optional(),
  model: z.string().trim().max(120).optional(),
  apiKey: z.string().max(1000).optional(), // empty = keep existing
  clearKey: z.boolean().optional(),
  timeoutMs: z.coerce.number().int().min(1000).max(600_000).optional(),
  numGpu: z.coerce.number().int().min(0).max(200).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return unauthorized();
  try {
    const parsed = saveSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);
    const d = parsed.data;

    const current = await readLlmSettings();
    const next: StoredLlmSettings = {
      provider: d.provider,
      baseUrl: d.baseUrl?.trim() || undefined,
      model: d.model?.trim() || undefined,
      timeoutMs: d.timeoutMs || undefined,
      numGpu: d.numGpu ?? undefined,
      apiKeyEnc: d.clearKey
        ? undefined
        : d.apiKey && d.apiKey.trim()
          ? encryptSecret(d.apiKey.trim())
          : current.apiKeyEnc,
    };
    await writeLlmSettings(next);
    return NextResponse.json({ ok: true, hasKey: !!next.apiKeyEnc });
  } catch (e) {
    return serverError(e);
  }
}
