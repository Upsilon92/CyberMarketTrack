"use client";

// Admin: cumulative LLM token counter (fed by EVERY LLM call — research, enrich,
// RSS analysis). Read-only + a reset button.
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/components/admin/api";

interface Usage {
  prompt: number;
  completion: number;
  total: number;
  requests: number;
  since: string;
}

export function TokenUsage({ usage }: { usage: Usage }) {
  const t = useTranslations("admin.llmPage");
  const locale = useLocale();
  const router = useRouter();
  const fmt = (n: number) => n.toLocaleString(locale);

  async function reset() {
    if (!window.confirm(t("usageResetConfirm"))) return;
    await api("/api/admin/llm/usage", "DELETE");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <h2 className="text-base font-semibold">{t("usageTitle")}</h2>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge variant="outline">
          {t("usageTotal")}: {fmt(usage.total)}
        </Badge>
        <span className="text-muted-foreground">
          {t("usagePrompt")} {fmt(usage.prompt)} · {t("usageCompletion")} {fmt(usage.completion)} ·{" "}
          {t("usageRequests", { count: usage.requests })}
        </span>
        <Button size="sm" variant="outline" onClick={reset}>
          {t("usageReset")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("usageSince", { date: new Date(usage.since).toLocaleString(locale) })} · {t("usageHint")}
      </p>
    </div>
  );
}
