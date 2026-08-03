"use client";

// Admin: token usage counter + batch enrichment of existing companies. Each
// company produces an AUTO "Bundle" PROPOSAL to review (nothing is applied to
// the base here). Streams live progress (bar + per-company log + running token
// count); the cumulative counter is refreshed on completion.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { api } from "@/components/admin/api";

interface Usage {
  prompt: number;
  completion: number;
  total: number;
  requests: number;
  since: string;
}
type Outcome = "proposed" | "empty" | "error";
interface Report {
  skipped?: string;
  total: number;
  processed: number;
  proposalsCreated: number;
  errors: number;
  usage: { prompt: number; completion: number; total: number };
  counts?: { proposals: number; eventsProposed: number; solutionsProposed: number };
}
interface LogItem {
  company: string;
  outcome: Outcome;
  detail?: string;
}

const OUTCOME_STYLE: Record<Outcome, string> = {
  proposed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  empty: "bg-muted text-muted-foreground border-border",
  error: "bg-destructive/15 text-destructive border-destructive/30",
};

export function BatchEnrich({ initialUsage }: { initialUsage: Usage }) {
  const t = useTranslations("admin.llmPage");
  const locale = useLocale();
  const router = useRouter();

  const [limit, setLimit] = useState("15");
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [skipAnalyzed, setSkipAnalyzed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [liveTokens, setLiveTokens] = useState<number | null>(null);
  const [log, setLog] = useState<LogItem[]>([]);
  const [report, setReport] = useState<Report | null>(null);

  const fmt = (n: number) => n.toLocaleString(locale);

  async function resetUsage() {
    if (!window.confirm(t("usageResetConfirm"))) return;
    await api("/api/admin/llm/usage", "DELETE");
    router.refresh();
  }

  async function run() {
    setBusy(true);
    setReport(null);
    setLog([]);
    setProgress(null);
    setLiveTokens(null);
    try {
      const res = await fetch("/api/admin/enrich/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: Number(limit) || 15, onlyMissing, skipAnalyzed }),
      });
      if (!res.ok || !res.body) throw new Error("stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let e: Record<string, unknown>;
          try {
            e = JSON.parse(line);
          } catch {
            continue;
          }
          if (e.type === "start") setProgress({ done: 0, total: (e.total as number) ?? 0 });
          else if (e.type === "item") {
            setProgress({ done: e.index as number, total: e.total as number });
            const u = e.usage as { total: number } | undefined;
            if (u) setLiveTokens(u.total);
            setLog((l) => [
              ...l,
              { company: e.company as string, outcome: e.outcome as Outcome, detail: e.detail as string | undefined },
            ]);
          } else if (e.type === "skipped") setReport({ skipped: e.detail as string } as Report);
          else if (e.type === "done") setReport(e.report as Report);
        }
      }
      router.refresh(); // refresh the cumulative counter
    } catch {
      setReport({ skipped: t("batchError") } as Report);
    } finally {
      setBusy(false);
    }
  }

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Cumulative token counter */}
      <div className="space-y-2">
        <h2 className="text-base font-semibold">{t("usageTitle")}</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge variant="outline">{t("usageTotal")}: {fmt(initialUsage.total)}</Badge>
          <span className="text-muted-foreground">
            {t("usagePrompt")} {fmt(initialUsage.prompt)} · {t("usageCompletion")} {fmt(initialUsage.completion)} ·{" "}
            {t("usageRequests", { count: initialUsage.requests })}
          </span>
          <Button size="sm" variant="outline" onClick={resetUsage}>
            {t("usageReset")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("usageSince", { date: new Date(initialUsage.since).toLocaleString(locale) })} · {t("usageHint")}
        </p>
      </div>

      {/* Batch enrichment */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold">{t("batchTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("batchIntro")}</p>

        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5 w-28">
            <Label>{t("batchLimit")}</Label>
            <Input type="number" min={1} max={1000} value={limit} onChange={(e) => setLimit(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 pb-1">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
              {t("batchOnlyMissing")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={skipAnalyzed} onChange={(e) => setSkipAnalyzed(e.target.checked)} />
              {t("batchSkipAnalyzed")}
            </label>
          </div>
          <Button onClick={run} disabled={busy} className="mb-0.5">
            {busy ? t("batchRunning") : t("batchRun")}
          </Button>
        </div>

        {progress && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("batchProgress", { done: progress.done, total: progress.total })}</span>
              <span>
                {pct}%{liveTokens != null ? ` · ${t("batchTokens", { tokens: fmt(liveTokens) })}` : ""}
              </span>
            </div>
            <div className="h-2 w-full rounded bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {log.length > 0 && (
          <ul className="max-h-56 overflow-y-auto space-y-1 text-xs">
            {log.map((it, i) => (
              <li key={i} className="flex items-start gap-2">
                <Badge variant="outline" className={`text-[9px] shrink-0 ${OUTCOME_STYLE[it.outcome]}`}>
                  {t(`outcome_${it.outcome}` as "outcome_proposed")}
                </Badge>
                <span className="min-w-0">
                  <span className="font-medium">{it.company}</span>
                  {it.detail && <span className="text-muted-foreground"> — {it.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}

        {report?.skipped && <p className="text-xs text-amber-600 dark:text-amber-400">{report.skipped}</p>}
        {report && !report.skipped && (
          <div className="space-y-2 text-xs">
            <p className="text-muted-foreground">
              {t("batchDone", {
                proposals: report.proposalsCreated,
                events: report.counts?.eventsProposed ?? 0,
                solutions: report.counts?.solutionsProposed ?? 0,
                errors: report.errors,
                tokens: fmt(report.usage.total),
              })}
            </p>
            {report.proposalsCreated > 0 && (
              <Link href="/admin/proposals" className="text-primary underline underline-offset-2">
                {t("batchReviewLink")}
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
