"use client";

// Admin: one-click deterministic re-calibration of existing events' importance
// to the editorial rules (no LLM, no tokens).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/components/admin/api";

export function RecalibrateImportance() {
  const t = useTranslations("admin.llmPage");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ scanned: number; updated: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!window.confirm(t("recalConfirm"))) return;
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const r = await api<{ scanned: number; updated: number }>("/api/admin/events/recalibrate", "POST");
      setResult(r);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("recalError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <h2 className="text-base font-semibold">{t("recalTitle")}</h2>
      <p className="text-sm text-muted-foreground">{t("recalIntro")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={run} disabled={busy}>
          {busy ? t("recalRunning") : t("recalRun")}
        </Button>
        {result && (
          <span className="text-xs text-muted-foreground">
            {t("recalDone", { scanned: result.scanned, updated: result.updated })}
          </span>
        )}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  );
}
