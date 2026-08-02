"use client";

// Admin control for the Phase 2 RSS→LLM pipeline: shows the LLM status (provider,
// model, online/offline, backlog, last-run date) and a button to run the analysis
// now — streaming a LIVE progress bar + per-item results (no extra tokens: this
// narrates the single in-flight run via NDJSON, it does not re-analyze).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Status {
  provider: string;
  model: string;
  baseUrl?: string;
  online: boolean;
  detail: string;
  backlog: number;
  processed: number;
  lastRunAt: string | null;
}
interface Report {
  skipped?: string;
  newItems: number;
  processed: number;
  proposalsCreated: number;
  notRelevant: number;
  duplicates: number;
  errors: number;
}
type Outcome = "proposal" | "duplicate" | "notRelevant" | "error";
interface LogItem {
  index: number;
  total: number;
  title: string;
  outcome: Outcome;
  detail?: string;
}

const OUTCOME_STYLE: Record<Outcome, string> = {
  proposal: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  duplicate: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  notRelevant: "bg-muted text-muted-foreground border-border",
  error: "bg-destructive/15 text-destructive border-destructive/30",
};

export function RssAnalyze() {
  const t = useTranslations("proposals");
  const locale = useLocale();
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [log, setLog] = useState<LogItem[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [skipped, setSkipped] = useState<string | null>(null);

  async function loadStatus() {
    try {
      const r = await fetch("/api/rss/analyze");
      setStatus(r.ok ? await r.json() : null);
    } catch {
      setStatus(null);
    }
  }
  useEffect(() => {
    loadStatus();
  }, []);

  async function run() {
    setBusy(true);
    setReport(null);
    setLog([]);
    setProgress(null);
    setSkipped(null);
    try {
      const res = await fetch("/api/rss/analyze/stream", { method: "POST" });
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
            setLog((l) => [...l, e as unknown as LogItem]);
          } else if (e.type === "skipped") setSkipped(e.detail as string);
          else if (e.type === "done") setReport(e.report as Report);
        }
      }
      await loadStatus();
      router.refresh();
    } catch {
      setSkipped(t("rssStreamError"));
    } finally {
      setBusy(false);
    }
  }

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="border rounded-md p-3 space-y-2 bg-muted/20">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{t("rssTitle")}</span>
        {status ? (
          <>
            <Badge variant={status.online ? "default" : "secondary"} className="text-[10px]">
              {status.online ? t("llmOnline") : t("llmOffline")}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {status.provider}:{status.model}
              {status.baseUrl ? ` @ ${status.baseUrl}` : ""} · {t("backlog", { count: status.backlog })}
            </span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">…</span>
        )}
        <Button size="sm" className="ml-auto" onClick={run} disabled={busy}>
          {busy ? t("rssRunning") : t("rssRunNow")}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {status?.lastRunAt
          ? t("rssLastRun", { date: new Date(status.lastRunAt).toLocaleString(locale) })
          : t("rssLastRunNever")}
      </p>

      {status && !status.online && !busy && (
        <p className="text-xs text-amber-600 dark:text-amber-400">{status.detail}</p>
      )}

      {/* Live progress */}
      {progress && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t("rssProgress", { done: progress.done, total: progress.total })}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 w-full rounded bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Live per-item log */}
      {log.length > 0 && (
        <ul className="max-h-48 overflow-y-auto space-y-1 text-xs">
          {log.map((it, i) => (
            <li key={i} className="flex items-start gap-2">
              <Badge variant="outline" className={`text-[9px] shrink-0 ${OUTCOME_STYLE[it.outcome]}`}>
                {t(`outcome_${it.outcome}` as "outcome_proposal")}
              </Badge>
              <span className="min-w-0">
                <span className="line-clamp-1">{it.title}</span>
                {it.detail && <span className="text-muted-foreground"> — {it.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {skipped && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {t("rssSkipped", { detail: skipped })}
        </p>
      )}

      {report && !report.skipped && (
        <p className="text-xs text-muted-foreground">
          {t("rssReport", {
            newItems: report.newItems,
            processed: report.processed,
            proposals: report.proposalsCreated,
            notRelevant: report.notRelevant,
            duplicates: report.duplicates,
            errors: report.errors,
          })}
        </p>
      )}
    </div>
  );
}
