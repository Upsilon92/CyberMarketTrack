"use client";

// Alias management (undated alternative names only — former names are derived
// from rename events and must NOT be entered here; the hint says so).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/components/admin/api";

export function AliasManager({
  companyId,
  solutionId,
  aliases,
}: {
  companyId?: string;
  solutionId?: string;
  aliases: { id: string; name: string }[];
}) {
  const router = useRouter();
  const t = useTranslations("admin.aliases");
  const tAdmin = useTranslations("admin");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api("/api/aliases", "POST", {
        name,
        companyId: companyId ?? null,
        solutionId: solutionId ?? null,
      });
      setName("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
      <div className="flex flex-wrap gap-1.5">
        {aliases.map((a) => (
          <Badge key={a.id} variant="secondary" className="gap-1.5">
            {a.name}
            <button
              type="button"
              aria-label={`${tAdmin("delete")} ${a.name}`}
              className="hover:text-destructive"
              disabled={busy}
              onClick={async () => {
                await api(`/api/aliases/${a.id}`, "DELETE");
                router.refresh();
              }}
            >
              ×
            </button>
          </Badge>
        ))}
      </div>
      <form onSubmit={onAdd} className="flex items-end gap-2">
        <label className="text-xs text-muted-foreground flex flex-col gap-1">
          {t("name")}
          <Input className="w-56" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <Button type="submit" size="sm" disabled={busy || !name.trim()}>
          {t("add")}
        </Button>
      </form>
    </div>
  );
}
