"use client";

// Backup screen: one-click JSON export, SQLite download, and JSON restore
// with an explicit warning + confirmation (the restore wipes everything).
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/components/admin/api";

export function BackupManager() {
  const router = useRouter();
  const t = useTranslations("admin.backupPage");
  const tAdmin = useTranslations("admin");
  const restoreRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!window.confirm(t("restoreConfirm"))) return;

    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: await file.text(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, data);
      setMessage(t("restored"));
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError && (err.code === "invalidFile" || err.code === "tooBig")
          ? t(err.code)
          : tAdmin("genericError")
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="space-y-2">
        <h2 className="font-medium">{t("exportTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("exportHint")}</p>
        <div className="flex gap-2">
          <a href="/api/backup/export" download>
            <Button variant="outline">{t("exportJson")}</Button>
          </a>
          <a href="/api/backup/sqlite" download>
            <Button variant="outline">{t("downloadSqlite")}</Button>
          </a>
          <a href="/api/backup/logos" download>
            <Button variant="outline">{t("downloadLogos")}</Button>
          </a>
        </div>
      </div>

      <div className="space-y-2 border border-destructive/40 rounded-md p-4">
        <h2 className="font-medium text-destructive">{t("restoreTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("restoreWarning")}</p>
        <Button
          variant="destructive"
          disabled={busy}
          onClick={() => restoreRef.current?.click()}
        >
          {busy ? tAdmin("saving") : t("restore")}
        </Button>
        <input
          ref={restoreRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={onRestore}
        />
        {message && <p className="text-sm text-emerald-600">{message}</p>}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
