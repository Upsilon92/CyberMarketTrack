"use client";

// Admin control for the Phase 2 RSS→LLM pipeline: shows the LLM status (provider,
// model, online/offline, backlog) and a button to run the analysis now.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/components/admin/api";

interface Status {
  provider: string;
  model: string;
  baseUrl?: string;
  online: boolean;
  detail: string;
  backlog: number;
  processed: number;
}
interface Report {
  ok: boolean;
  skipped?: string;
  llm: string;
  newItems: number;
  processed: number;
  proposalsCreated: number;
  notRelevant: number;
  errors: number;
}

export function RssAnalyze() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);

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
    try {
      const r = await api<Report>("/api/rss/analyze", "POST", {});
      setReport(r);
      await loadStatus();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border rounded-md p-3 space-y-2 bg-muted/20">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Analyse RSS (LLM)</span>
        {status ? (
          <>
            <Badge variant={status.online ? "default" : "secondary"} className="text-[10px]">
              {status.online ? "LLM en ligne" : "LLM hors-ligne"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {status.provider}:{status.model}
              {status.baseUrl ? ` @ ${status.baseUrl}` : ""} · backlog {status.backlog}
            </span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">…</span>
        )}
        <Button size="sm" className="ml-auto" onClick={run} disabled={busy}>
          {busy ? "Analyse…" : "Analyser le flux maintenant"}
        </Button>
      </div>

      {status && !status.online && (
        <p className="text-xs text-amber-600 dark:text-amber-400">{status.detail}</p>
      )}

      {report && (
        <p className="text-xs text-muted-foreground">
          {report.skipped
            ? `Sauté — LLM indisponible : ${report.skipped}. Les ${report.newItems} nouveaux items attendent la prochaine analyse.`
            : `${report.newItems} nouveaux items · ${report.processed} analysés · ${report.proposalsCreated} propositions créées · ${report.notRelevant} non pertinents · ${report.errors} erreurs.`}
        </p>
      )}
    </div>
  );
}
