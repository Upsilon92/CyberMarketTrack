// Admin LLM configuration page — manage the provider/model/key from the UI
// instead of environment variables. (Auth is enforced by the admin layout.)
import { getTranslations } from "next-intl/server";
import { loadLlmConfig, readLlmSettings, readLlmUsage } from "@/lib/llm";
import { LlmSettingsForm } from "@/components/admin/llm-settings-form";
import { BatchEnrich } from "@/components/admin/batch-enrich";

export const dynamic = "force-dynamic";

export default async function AdminLlmPage() {
  const t = await getTranslations("admin.llmPage");
  const [cfg, stored, usage] = await Promise.all([loadLlmConfig(), readLlmSettings(), readLlmUsage()]);

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-xl font-bold">{t("title")}</h1>
        <LlmSettingsForm
          initial={{
            provider: cfg.provider,
            baseUrl: cfg.baseUrl,
            model: cfg.model,
            timeoutMs: cfg.timeoutMs,
            numGpu: cfg.numGpu ?? null,
            hasKey: !!stored.apiKeyEnc,
          }}
        />
      </div>
      <div className="border-t pt-6">
        <BatchEnrich initialUsage={usage} />
      </div>
    </div>
  );
}
