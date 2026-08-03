"use client";

// Centralized LLM analysis (Admin → LLM): pick an entity type, multi-select the
// entities (or type company names not yet in the base), run → streamed progress
// → one proposal per entity to review. Nothing is applied directly.
import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MultiCombobox, type MultiOption } from "@/components/ui/multi-combobox";

type EntityType = "company" | "solution" | "event";
type Outcome = "proposed" | "empty" | "error";

interface LogItem {
  label: string;
  outcome: Outcome;
  detail?: string;
}
interface Report {
  skipped?: string;
  proposalsCreated: number;
  empty: number;
  errors: number;
  usage: { total: number };
}

const OUTCOME_STYLE: Record<Outcome, string> = {
  proposed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  empty: "bg-muted text-muted-foreground border-border",
  error: "bg-destructive/15 text-destructive border-destructive/30",
};

export function LlmAnalyzePanel({
  companies,
  solutions,
  events,
}: {
  companies: MultiOption[];
  solutions: MultiOption[];
  events: MultiOption[];
}) {
  const t = useTranslations("admin.llmPage");
  const locale = useLocale();

  const [type, setType] = useState<EntityType>("company");
  const [selected, setSelected] = useState<string[]>([]);
  const [newNames, setNewNames] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [liveTokens, setLiveTokens] = useState<number | null>(null);
  const [log, setLog] = useState<LogItem[]>([]);
  const [report, setReport] = useState<Report | null>(null);

  const fmt = (n: number) => n.toLocaleString(locale);
  const options = type === "company" ? companies : type === "solution" ? solutions : events;

  function changeType(next: EntityType) {
    setType(next);
    setSelected([]);
    setNewNames("");
    setLog([]);
    setReport(null);
    setProgress(null);
  }

  const parsedNames = newNames.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  const canRun = !busy && (selected.length > 0 || (type === "company" && parsedNames.length > 0));

  async function run() {
    setBusy(true);
    setReport(null);
    setLog([]);
    setProgress(null);
    setLiveTokens(null);
    try {
      const res = await fetch("/api/admin/analyze/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, ids: selected, newNames: type === "company" ? parsedNames : undefined }),
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
            setLog((l) => [...l, { label: e.label as string, outcome: e.outcome as Outcome, detail: e.detail as string | undefined }]);
          } else if (e.type === "skipped") setReport({ skipped: e.detail as string } as Report);
          else if (e.type === "done") setReport(e.report as Report);
        }
      }
    } catch {
      setReport({ skipped: t("analyzeError") } as Report);
    } finally {
      setBusy(false);
    }
  }

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const TYPES: EntityType[] = ["company", "solution", "event"];

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">{t("analyzeTitle")}</h2>
      <p className="text-sm text-muted-foreground">{t("analyzeIntro")}</p>

      {/* Type selector */}
      <div className="flex flex-wrap gap-2">
        {TYPES.map((ty) => (
          <button
            key={ty}
            type="button"
            onClick={() => changeType(ty)}
            className={`px-3 py-1.5 rounded-md text-sm border ${
              type === ty ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"
            }`}
          >
            {t(`type_${ty}` as "type_company")}
          </button>
        ))}
      </div>

      {/* Entity multi-select */}
      <div className="flex flex-wrap items-start gap-3">
        <MultiCombobox
          label={t("analyzeSelect")}
          options={options}
          selected={selected}
          onChange={setSelected}
          placeholder={t("analyzeFilter")}
        />
        {selected.length > 0 && <span className="text-xs text-muted-foreground pt-2">{t("analyzeSelected", { n: selected.length })}</span>}
      </div>

      {/* New company names (company type only) */}
      {type === "company" && (
        <div className="space-y-1.5 max-w-xl">
          <Label>{t("analyzeNewNames")}</Label>
          <Textarea
            rows={2}
            value={newNames}
            onChange={(e) => setNewNames(e.target.value)}
            placeholder="Wiz, Cato Networks, …"
          />
          <p className="text-xs text-muted-foreground">{t("analyzeNewNamesHint")}</p>
        </div>
      )}

      <Button onClick={run} disabled={!canRun}>
        {busy ? t("analyzeRunning") : t("analyzeRun")}
      </Button>

      {/* Live progress */}
      {progress && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t("analyzeProgress", { done: progress.done, total: progress.total })}</span>
            <span>
              {pct}%{liveTokens != null ? ` · ${t("analyzeTokens", { tokens: fmt(liveTokens) })}` : ""}
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
                <span className="font-medium">{it.label}</span>
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
            {t("analyzeDone", {
              proposals: report.proposalsCreated,
              empty: report.empty,
              errors: report.errors,
              tokens: fmt(report.usage.total),
            })}
          </p>
          {report.proposalsCreated > 0 && (
            <Link href="/admin/proposals" className="text-primary underline underline-offset-2">
              {t("analyzeReviewLink")}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
