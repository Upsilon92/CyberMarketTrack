"use client";

// Admin LLM configuration form. Chooses provider / base URL / model / API key /
// timeout / GPU layers, saves them to the DB (key encrypted), and can TEST
// availability (online/offline) without consuming any tokens.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/components/admin/api";

type Provider = "ollama" | "anthropic" | "mistral";

const DEFAULTS: Record<Provider, { baseUrl: string; model: string }> = {
  ollama: { baseUrl: "http://localhost:11434", model: "qwen2.5:7b" },
  anthropic: { baseUrl: "https://api.anthropic.com", model: "claude-haiku-4-5-20251001" },
  mistral: { baseUrl: "https://api.mistral.ai", model: "mistral-small-latest" },
};

export interface LlmInitial {
  provider: Provider;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  numGpu: number | null;
  hasKey: boolean;
}

export function LlmSettingsForm({ initial }: { initial: LlmInitial }) {
  const t = useTranslations("admin.llmPage");
  const router = useRouter();

  const [provider, setProvider] = useState<Provider>(initial.provider);
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [model, setModel] = useState(initial.model);
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [numGpu, setNumGpu] = useState(initial.numGpu == null ? "" : String(initial.numGpu));
  const [timeoutMs, setTimeoutMs] = useState(String(initial.timeoutMs));

  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<{ ok: boolean; detail: string } | null>(null);

  const isHosted = provider === "anthropic" || provider === "mistral";
  const d = DEFAULTS[provider];

  function body() {
    return {
      provider,
      baseUrl: baseUrl.trim() || undefined,
      model: model.trim() || undefined,
      apiKey: apiKey.trim() || undefined,
      clearKey: clearKey || undefined,
      numGpu: numGpu === "" ? null : Number(numGpu),
      timeoutMs: timeoutMs === "" ? undefined : Number(timeoutMs),
    };
  }

  async function onSave() {
    setBusy("save");
    setSaved(false);
    setError(null);
    try {
      await api("/api/admin/llm", "POST", body());
      setSaved(true);
      setApiKey("");
      setClearKey(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("saveError"));
    } finally {
      setBusy(null);
    }
  }

  async function onTest() {
    setBusy("test");
    setTest(null);
    setError(null);
    try {
      const r = await api<{ ok: boolean; detail: string }>("/api/admin/llm/health", "POST", body());
      setTest(r);
    } catch (e) {
      setTest({ ok: false, detail: e instanceof ApiError ? e.message : t("testError") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-sm text-muted-foreground">{t("intro")}</p>

      <div className="space-y-1.5">
        <Label>{t("provider")}</Label>
        <select
          className="border rounded-md bg-background text-foreground px-2 py-2 text-sm w-full"
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value as Provider);
            setTest(null);
          }}
        >
          <option value="ollama">{t("providerOllama")}</option>
          <option value="mistral">{t("providerMistral")}</option>
          <option value="anthropic">{t("providerAnthropic")}</option>
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t("baseUrl")}</Label>
          <Input value={baseUrl} placeholder={d.baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          <p className="text-xs text-muted-foreground">{t("baseUrlHint")}</p>
        </div>
        <div className="space-y-1.5">
          <Label>{t("model")}</Label>
          <Input value={model} placeholder={d.model} onChange={(e) => setModel(e.target.value)} />
          <p className="text-xs text-muted-foreground">{t("modelHint")}</p>
        </div>
      </div>

      {isHosted && (
        <div className="space-y-1.5">
          <Label>{t("apiKey")}</Label>
          <Input
            type="password"
            autoComplete="off"
            value={apiKey}
            disabled={clearKey}
            placeholder={initial.hasKey ? t("apiKeyStored") : "sk-…"}
            onChange={(e) => setApiKey(e.target.value)}
          />
          {initial.hasKey && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={clearKey} onChange={(e) => setClearKey(e.target.checked)} />
              {t("apiKeyClear")}
            </label>
          )}
          <p className="text-xs text-muted-foreground">🔒 {t("apiKeySecurity")}</p>
        </div>
      )}

      {provider === "ollama" && (
        <div className="space-y-1.5 max-w-xs">
          <Label>{t("numGpu")}</Label>
          <Input
            type="number"
            min={0}
            value={numGpu}
            placeholder="—"
            onChange={(e) => setNumGpu(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("numGpuHint")}</p>
        </div>
      )}

      <div className="space-y-1.5 max-w-xs">
        <Label>{t("timeout")}</Label>
        <Input type="number" min={1000} value={timeoutMs} onChange={(e) => setTimeoutMs(e.target.value)} />
        <p className="text-xs text-muted-foreground">{t("timeoutHint")}</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onSave} disabled={busy !== null}>
          {busy === "save" ? t("saving") : t("save")}
        </Button>
        <Button variant="outline" onClick={onTest} disabled={busy !== null}>
          {busy === "test" ? t("testing") : t("test")}
        </Button>
        {saved && <span className="text-sm text-emerald-600 dark:text-emerald-400">{t("saved")}</span>}
        {test && (
          <span className="flex items-center gap-2 text-sm">
            <Badge variant={test.ok ? "default" : "secondary"} className="text-[10px]">
              {test.ok ? t("online") : t("offline")}
            </Badge>
            <span className="text-muted-foreground">{test.detail}</span>
          </span>
        )}
      </div>
    </div>
  );
}
