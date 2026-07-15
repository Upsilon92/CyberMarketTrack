"use client";

// CSV import screen: template download, file upload, dry-run preview,
// confirmation, and the final report (created / skipped / errors + reasons).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/components/admin/api";
import { CSV_TEMPLATES, toCsv } from "@/lib/csv";

interface RowResult {
  line: number;
  status: "created" | "skipped" | "error";
  label: string;
  reason?: string;
}

interface Report {
  dryRun: boolean;
  created: number;
  skipped: number;
  errors: number;
  results: RowResult[];
}

const TYPES = ["companies", "solutions", "tags", "events", "revenues"] as const;

export function CsvImport() {
  const router = useRouter();
  const t = useTranslations("admin.importPage");
  const tAdmin = useTranslations("admin");

  const [type, setType] = useState<(typeof TYPES)[number]>("companies");
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function downloadTemplate() {
    const tpl = CSV_TEMPLATES[type];
    const content = toCsv(tpl.headers, [tpl.example]);
    const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `template-${type}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setReport(null);
    setError(null);
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setError(t("tooBig"));
      setCsv(null);
      return;
    }
    setFileName(file.name);
    setCsv(await file.text());
  }

  async function run(dryRun: boolean) {
    if (!csv) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<Report>("/api/import", "POST", { type, csv, dryRun });
      setReport(res);
      if (!dryRun) router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError && (err.code === "invalidCsv" || err.code === "tooBig")
          ? t(err.code)
          : tAdmin("genericError")
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <p className="text-sm text-muted-foreground">{t("hint")}</p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground flex flex-col gap-1">
          {t("type")}
          <select
            className="border rounded-md bg-background text-foreground px-2 py-2 text-sm"
            value={type}
            onChange={(e) => {
              setType(e.target.value as (typeof TYPES)[number]);
              setReport(null);
            }}
          >
            {TYPES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <Button variant="outline" size="sm" onClick={downloadTemplate}>
          {t("template")}
        </Button>
        <label className="text-xs text-muted-foreground flex flex-col gap-1">
          {t("file")}
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-sm" />
        </label>
        <Button size="sm" onClick={() => run(true)} disabled={busy || !csv}>
          {t("preview")}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {report && (
        <div className="border rounded-md p-4 space-y-3">
          <p className="font-medium text-sm">
            {t("report")} {report.dryRun && fileName ? `— ${fileName}` : ""}
          </p>
          <div className="flex gap-2 text-sm">
            <Badge className="bg-emerald-600 text-white">{t("created", { count: report.created })}</Badge>
            <Badge variant="secondary">{t("skipped", { count: report.skipped })}</Badge>
            <Badge variant="destructive">{t("errors", { count: report.errors })}</Badge>
          </div>

          <div className="max-h-72 overflow-y-auto divide-y text-sm border rounded">
            {report.results.map((r) => (
              <div key={r.line} className="p-2 flex items-center gap-2">
                <span className="text-muted-foreground w-14 shrink-0">
                  {t("line")} {r.line}
                </span>
                <Badge
                  variant={
                    r.status === "created" ? "default" : r.status === "skipped" ? "secondary" : "destructive"
                  }
                  className="text-[10px]"
                >
                  {r.status}
                </Badge>
                <span className="truncate">{r.label}</span>
                {r.reason && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    {r.reason === "duplicate" ? t("duplicate") : r.reason}
                  </span>
                )}
              </div>
            ))}
          </div>

          {report.dryRun && report.created > 0 && (
            <Button onClick={() => run(false)} disabled={busy}>
              {t("confirm", { count: report.created })}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
