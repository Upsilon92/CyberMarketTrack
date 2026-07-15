"use client";

// Delete with confirmation (spec: confirmation avant suppression).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/components/admin/api";

export function DeleteButton({
  path,
  redirectTo,
  confirmKey = "deleteConfirm",
}: {
  path: string;
  redirectTo?: string;
  confirmKey?: "deleteConfirm" | "deleteEventConfirm";
}) {
  const router = useRouter();
  const t = useTranslations("admin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    if (!window.confirm(t(confirmKey))) return;
    setBusy(true);
    setError(null);
    try {
      await api(path, "DELETE");
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === "hasSolutions" ? t("hasSolutions") : t("genericError")
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button variant="destructive" size="sm" onClick={onDelete} disabled={busy}>
        {t("delete")}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
