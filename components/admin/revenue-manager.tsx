"use client";

// Revenue rows management on the company edit page (upsert per year).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/components/admin/api";

export function RevenueManager({
  companyId,
  revenues,
}: {
  companyId: string;
  revenues: { id: string; year: number; amount: number; currency: string; source: string | null }[];
}) {
  const router = useRouter();
  const t = useTranslations("admin.revenues");
  const tAdmin = useTranslations("admin");
  const [year, setYear] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/revenues", "POST", { companyId, year, amount, currency, source });
      setYear("");
      setAmount("");
      setSource("");
      router.refresh();
    } catch {
      setError(tAdmin("genericError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="divide-y border rounded-md text-sm">
        {revenues.length === 0 && <p className="p-3 text-muted-foreground">—</p>}
        {revenues.map((r) => (
          <div key={r.id} className="p-2.5 flex items-center gap-3">
            <span className="tabular-nums w-14">{r.year}</span>
            <span className="tabular-nums">
              {r.amount.toLocaleString()} M{r.currency}
            </span>
            {r.source && <span className="text-xs text-muted-foreground">{r.source}</span>}
            <span className="ml-auto">
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={async () => {
                  if (!window.confirm(tAdmin("deleteConfirm"))) return;
                  await api(`/api/revenues/${r.id}`, "DELETE");
                  router.refresh();
                }}
              >
                {tAdmin("delete")}
              </Button>
            </span>
          </div>
        ))}
      </div>

      <form onSubmit={onAdd} className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted-foreground flex flex-col gap-1">
          {t("year")}
          <Input type="number" className="w-24" value={year} onChange={(e) => setYear(e.target.value)} required />
        </label>
        <label className="text-xs text-muted-foreground flex flex-col gap-1">
          {t("amount")}
          <Input type="number" step="any" className="w-28" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </label>
        <label className="text-xs text-muted-foreground flex flex-col gap-1">
          {t("currency")}
          <Input maxLength={3} className="w-20" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} required />
        </label>
        <label className="text-xs text-muted-foreground flex flex-col gap-1 flex-1 min-w-40">
          {t("source")}
          <Input value={source} onChange={(e) => setSource(e.target.value)} />
        </label>
        <Button type="submit" size="sm" disabled={busy}>
          {t("add")}
        </Button>
      </form>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
