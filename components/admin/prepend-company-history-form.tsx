"use client";

// "Add an earlier past" assistant (collapsible) on a company's history screen.
// Rewinds the name anchor + creates the COMPANY_RENAME event server-side,
// atomically. Mirrors the solution assistant.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/components/admin/api";

export function PrependCompanyHistoryForm({
  companyId,
  currentName,
}: {
  companyId: string;
  currentName: string;
}) {
  const router = useRouter();
  const t = useTranslations("admin.prependCompany");
  const tAdmin = useTranslations("admin");
  const [open, setOpen] = useState(false);
  const [previousName, setPreviousName] = useState("");
  const [changeYear, setChangeYear] = useState("");
  const [changeMonth, setChangeMonth] = useState("");
  const [newFoundedYear, setNewFoundedYear] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onApply() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await api<{ ok: boolean; created: number }>(
        `/api/companies/${companyId}/prepend-history`,
        "POST",
        {
          previousName,
          changeYear,
          changeMonth: changeMonth === "" ? null : changeMonth,
          newFoundedYear: newFoundedYear === "" ? null : newFoundedYear,
        }
      );
      setMessage(res.created === 0 ? t("nothing") : t("applied"));
      setPreviousName("");
      setChangeYear("");
      setChangeMonth("");
      setNewFoundedYear("");
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.codes?.length)
        setError(e.codes.map((c) => tAdmin(`issue.${c}` as Parameters<typeof tAdmin>[0])).join(" "));
      else setError(tAdmin("genericError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border rounded-md">
      <button
        type="button"
        className="w-full text-left px-3 py-2 text-sm font-medium flex items-center gap-2"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-muted-foreground">{open ? "▾" : "▸"}</span>
        {t("title")}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
          <div className="space-y-1.5">
            <Label>{t("previousName", { current: currentName })}</Label>
            <Input value={previousName} onChange={(e) => setPreviousName(e.target.value)} />
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>{t("changeYear")} *</Label>
              <Input type="number" value={changeYear} onChange={(e) => setChangeYear(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("changeMonth")}</Label>
              <Input
                type="number"
                min={1}
                max={12}
                value={changeMonth}
                onChange={(e) => setChangeMonth(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("newFoundedYear")}</Label>
              <Input
                type="number"
                value={newFoundedYear}
                onChange={(e) => setNewFoundedYear(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={onApply} disabled={busy || !previousName || !changeYear}>
              {busy ? tAdmin("saving") : t("apply")}
            </Button>
            {message && <span className="text-sm text-emerald-600">{message}</span>}
            {error && (
              <span className="text-sm text-destructive" role="alert">
                {error}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
