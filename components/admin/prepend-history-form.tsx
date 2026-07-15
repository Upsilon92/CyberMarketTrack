"use client";

// "Add an earlier past" assistant (collapsible) on a solution's history screen.
// Corrects the anchor + creates the rename/transfer events server-side, atomically.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/components/admin/api";

export function PrependHistoryForm({
  solutionId,
  currentName,
  currentVendorLabel,
  companies,
}: {
  solutionId: string;
  currentName: string;
  currentVendorLabel: string;
  companies: { id: string; label: string }[];
}) {
  const router = useRouter();
  const t = useTranslations("admin.prepend");
  const tAdmin = useTranslations("admin");
  const [open, setOpen] = useState(false);
  const [previousName, setPreviousName] = useState("");
  const [previousVendorId, setPreviousVendorId] = useState("");
  const [changeYear, setChangeYear] = useState("");
  const [changeMonth, setChangeMonth] = useState("");
  const [newLaunchYear, setNewLaunchYear] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onApply() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await api<{ ok: boolean; created: number }>(
        `/api/solutions/${solutionId}/prepend-history`,
        "POST",
        {
          previousName,
          previousVendorId,
          changeYear,
          changeMonth: changeMonth === "" ? null : changeMonth,
          newLaunchYear: newLaunchYear === "" ? null : newLaunchYear,
        }
      );
      setMessage(res.created === 0 ? t("nothing") : t("applied"));
      setPreviousName("");
      setPreviousVendorId("");
      setChangeYear("");
      setChangeMonth("");
      setNewLaunchYear("");
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.fields?.previousName) setError(t("atLeastOne"));
      else if (e instanceof ApiError && e.codes?.length)
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
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("previousName", { current: currentName })}</Label>
              <Input value={previousName} onChange={(e) => setPreviousName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("previousVendor", { current: currentVendorLabel })}</Label>
              <select
                className="border rounded-md bg-background text-foreground px-2 py-2 text-sm w-full"
                value={previousVendorId}
                onChange={(e) => setPreviousVendorId(e.target.value)}
              >
                <option value="">{t("keep")}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
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
              <Label>{t("newLaunchYear")}</Label>
              <Input
                type="number"
                value={newLaunchYear}
                onChange={(e) => setNewLaunchYear(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={onApply} disabled={busy || !changeYear}>
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
