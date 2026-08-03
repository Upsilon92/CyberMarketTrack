// Admin LLM page — provider/model/key config, cumulative token counter,
// centralized on-demand analysis (companies/solutions/events), and the
// deterministic importance re-calibration. (Auth enforced by the admin layout.)
import { getTranslations } from "next-intl/server";
import { loadLlmConfig, readLlmSettings, readLlmUsage } from "@/lib/llm";
import { loadMarket, loadAllEvents } from "@/lib/queries";
import { LlmSettingsForm } from "@/components/admin/llm-settings-form";
import { TokenUsage } from "@/components/admin/token-usage";
import { LlmAnalyzePanel } from "@/components/admin/llm-analyze-panel";
import { RecalibrateImportance } from "@/components/admin/recalibrate-importance";

export const dynamic = "force-dynamic";

export default async function AdminLlmPage() {
  const t = await getTranslations("admin.llmPage");
  const tTypes = await getTranslations("eventTypes");
  const [cfg, stored, usage, market, events] = await Promise.all([
    loadLlmConfig(),
    readLlmSettings(),
    readLlmUsage(),
    loadMarket(),
    loadAllEvents(),
  ]);

  const companies = [...market.companies]
    .map((c) => ({ value: c.id, label: c.timeline.currentName }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const solutions = [...market.solutions]
    .map((s) => ({ value: s.id, label: s.timeline.currentName }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const eventOptions = events.map((e) => ({
    value: e.id,
    label: `${tTypes(e.type)} ${e.year}${e.subjectCompany ? ` — ${e.subjectCompany.initialName}` : ""}`,
  }));

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
        <TokenUsage usage={usage} />
      </div>
      <div className="border-t pt-6">
        <LlmAnalyzePanel companies={companies} solutions={solutions} events={eventOptions} />
      </div>
      <div className="border-t pt-6">
        <RecalibrateImportance />
      </div>
    </div>
  );
}
