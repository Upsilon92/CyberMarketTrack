// =============================================================================
// Pluggable LLM abstraction — one interface, three deployment modes, switched
// entirely by environment variables (no code change):
//
//   • Local LLM (Ollama on the same host):
//       LLM_PROVIDER=ollama  LLM_BASE_URL=http://localhost:11434  LLM_MODEL=qwen2.5:7b
//   • Deported LLM (Ollama on another machine, may be OFF):
//       LLM_PROVIDER=ollama  LLM_BASE_URL=http://192.168.1.42:11434  LLM_MODEL=qwen2.5:7b
//   • Hosted (Anthropic, e.g. Haiku):
//       LLM_PROVIDER=anthropic  LLM_MODEL=claude-haiku-4-5-20251001  LLM_API_KEY=sk-ant-...
//
// Callers use getLlmConfig() + llmHealthCheck() + llmExtractJson(). When the
// deported machine is off, llmHealthCheck() returns ok:false and the caller
// skips gracefully (nothing is written, work is retried on the next run).
// =============================================================================

export type LlmProvider = "ollama" | "anthropic" | "mistral";

export interface LlmConfig {
  provider: LlmProvider;
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs: number;
  /** Ollama layers to offload to GPU. Set OLLAMA_NUM_GPU=0 to force CPU (needed
   * for GPUs too old for Ollama's CUDA build, e.g. GTX 900-series / Maxwell). */
  numGpu?: number;
}

const DEFAULT_BASE: Record<LlmProvider, string> = {
  ollama: "http://localhost:11434",
  anthropic: "https://api.anthropic.com",
  mistral: "https://api.mistral.ai",
};
const DEFAULT_MODEL: Record<LlmProvider, string> = {
  ollama: "qwen2.5:7b",
  anthropic: "claude-haiku-4-5-20251001",
  mistral: "mistral-small-latest",
};

export function getLlmConfig(): LlmConfig {
  const provider = (process.env.LLM_PROVIDER as LlmProvider) || "ollama";
  return {
    provider,
    baseUrl: process.env.LLM_BASE_URL || DEFAULT_BASE[provider] || DEFAULT_BASE.ollama,
    model: process.env.LLM_MODEL || DEFAULT_MODEL[provider] || DEFAULT_MODEL.ollama,
    apiKey: process.env.LLM_API_KEY || undefined,
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 60_000,
    numGpu: process.env.OLLAMA_NUM_GPU != null && process.env.OLLAMA_NUM_GPU !== ""
      ? Number(process.env.OLLAMA_NUM_GPU)
      : undefined,
  };
}

function withTimeout(ms: number): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

/** Is the configured LLM reachable/usable right now? Never throws. */
export async function llmHealthCheck(
  cfg: LlmConfig = getLlmConfig()
): Promise<{ ok: boolean; detail: string }> {
  if (cfg.provider === "anthropic" || cfg.provider === "mistral") {
    return cfg.apiKey
      ? { ok: true, detail: `${cfg.provider}:${cfg.model} (clé configurée)` }
      : { ok: false, detail: `LLM_API_KEY manquante pour le fournisseur ${cfg.provider}` };
  }
  // Ollama: list local models — fast, no inference, proves the host is up.
  const { signal, done } = withTimeout(5_000);
  try {
    const r = await fetch(`${cfg.baseUrl}/api/tags`, { signal });
    if (!r.ok) return { ok: false, detail: `Ollama HTTP ${r.status} @ ${cfg.baseUrl}` };
    const j = await r.json();
    const models: string[] = (j.models ?? []).map((m: { name: string }) => m.name);
    const base = cfg.model.split(":")[0];
    const hasModel = models.some((m) => m === cfg.model || m.split(":")[0] === base);
    return hasModel
      ? { ok: true, detail: `ollama:${cfg.model} @ ${cfg.baseUrl}` }
      : { ok: false, detail: `Modèle ${cfg.model} absent (dispo: ${models.join(", ") || "aucun"})` };
  } catch (e) {
    return { ok: false, detail: `Ollama injoignable @ ${cfg.baseUrl} (${(e as Error).name})` };
  } finally {
    done();
  }
}

function stripJson(text: string): string {
  // Tolerate ```json fences or leading prose around the object.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

/**
 * Ask the LLM to return a JSON object and parse it. `system` frames the task,
 * `user` is the content to analyze. Throws on transport/parse failure (callers
 * should have run llmHealthCheck first to avoid hammering an offline host).
 */
export async function llmExtractJson<T = unknown>(
  system: string,
  user: string,
  cfg: LlmConfig = getLlmConfig()
): Promise<T> {
  const { signal, done } = withTimeout(cfg.timeoutMs);
  try {
    if (cfg.provider === "ollama") {
      const r = await fetch(`${cfg.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: cfg.model,
          stream: false,
          format: "json", // Ollama guarantees valid JSON output
          keep_alive: "10m", // keep the model warm between items in a run
          options: { temperature: 0, ...(cfg.numGpu != null ? { num_gpu: cfg.numGpu } : {}) },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal,
      });
      if (!r.ok) throw new Error(`Ollama HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const j = await r.json();
      return JSON.parse(j.message?.content ?? "{}") as T;
    }

    if (cfg.provider === "mistral") {
      // Mistral La Plateforme — OpenAI-style chat completions + native JSON mode.
      if (!cfg.apiKey) throw new Error("LLM_API_KEY manquante");
      const r = await fetch(`${cfg.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal,
      });
      if (!r.ok) throw new Error(`Mistral HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const j = await r.json();
      return JSON.parse(stripJson(j.choices?.[0]?.message?.content ?? "{}")) as T;
    }

    // anthropic
    if (!cfg.apiKey) throw new Error("LLM_API_KEY manquante");
    const r = await fetch(`${cfg.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 1024,
        temperature: 0,
        system: `${system}\nRéponds UNIQUEMENT avec un objet JSON valide, sans texte autour.`,
        messages: [{ role: "user", content: user }],
      }),
      signal,
    });
    if (!r.ok) throw new Error(`Anthropic HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const text = (j.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
    return JSON.parse(stripJson(text)) as T;
  } finally {
    done();
  }
}
