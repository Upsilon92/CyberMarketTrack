"use client";

// Revenue rows management on the company edit page: add, EDIT (in-place) and
// delete. Adding a year that already exists upserts it; editing an existing row
// updates it by id (so the year can be changed too).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/components/admin/api";

const CURRENCIES = [
  { value: "USD", label: "$ - USD" },
  { value: "EUR", label: "€ - EUR" },
];

interface RevenueRow {
  id: string;
  year: number;
  amount: number;
  currency: string;
  source: string | null;
}

export function RevenueManager({
  companyId,
  revenues,
}: {
  companyId: string;
  revenues: RevenueRow[];
}) {
  const router = useRouter();
  const t = useTranslations("admin.revenues");
  const tAdmin = useTranslations("admin");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [year, setYear] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setEditingId(null);
    setYear("");
    setAmount("");
    setCurrency("USD");
    setSource("");
  }

  function startEdit(r: RevenueRow) {
    setEditingId(r.id);
    setYear(String(r.year));
    setAmount(String(r.amount));
    setCurrency(r.currency);
    setSource(r.source ?? "");
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = { companyId, year, amount, currency, source };
      if (editingId) await api(`/api/revenues/${editingId}`, "PUT", payload);
      else await api("/api/revenues", "POST", payload);
      resetForm();
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
          <div
            key={r.id}
            className={`p-2.5 flex items-center gap-3 ${editingId === r.id ? "bg-muted/50" : ""}`}
          >
            <span className="tabular-nums w-14">{r.year}</span>
            <span className="tabular-nums">
              {r.amount.toLocaleString()} M{r.currency}
            </span>
            {r.source && <span className="text-xs text-muted-foreground">{r.source}</span>}
            <span className="ml-auto flex gap-1.5">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => startEdit(r)}>
                {tAdmin("edit")}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={async () => {
                  if (!window.confirm(tAdmin("deleteConfirm"))) return;
                  await api(`/api/revenues/${r.id}`, "DELETE");
                  if (editingId === r.id) resetForm();
                  router.refresh();
                }}
              >
                {tAdmin("delete")}
              </Button>
            </span>
          </div>
        ))}
      </div>

      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
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
          <select
            className="border rounded-md bg-background text-foreground px-2 h-9 text-sm w-28"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {CURRENCIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground flex flex-col gap-1 flex-1 min-w-40">
          {t("source")}
          <Input value={source} onChange={(e) => setSource(e.target.value)} />
        </label>
        <Button type="submit" size="sm" disabled={busy}>
          {editingId ? tAdmin("save") : t("add")}
        </Button>
        {editingId && (
          <Button type="button" size="sm" variant="outline" onClick={resetForm} disabled={busy}>
            {tAdmin("cancel")}
          </Button>
        )}
      </form>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
