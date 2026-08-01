"use client";

// On-demand LLM research trigger. Two modes:
//  - companyId given  -> a single "Analyse (LLM)" button (from a company page)
//  - no companyId     -> a name field + button (from the proposals page)
// Creates an AUTO "Bundle" proposal (company + solutions + M&A) for review.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LlmResearch({
  companyId,
  companyName,
  eventId,
  label = "Analyse (LLM)",
}: {
  companyId?: string;
  companyName?: string;
  eventId?: string;
  label?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(companyName ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    | { ok: true; proposalId: string; company: string; solutions: number; events: number }
    | { ok: false; message: string }
    | null
  >(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const body = companyId
        ? { companyId, ...(eventId ? { eventId } : {}) }
        : { companyName: name.trim() };
      const r = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        setResult({ ok: true, ...data });
        router.refresh();
      } else if (data.code === "llmOffline") {
        setResult({ ok: false, message: `LLM indisponible : ${data.detail ?? ""}` });
      } else {
        setResult({ ok: false, message: data.error ?? "Erreur" });
      }
    } catch {
      setResult({ ok: false, message: "Erreur réseau" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {!companyId && (
          <Input
            className="w-64"
            placeholder="Nom d'une entreprise à analyser…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && !busy && run()}
          />
        )}
        <Button size="sm" variant="outline" onClick={run} disabled={busy || (!companyId && !name.trim())}>
          {busy ? "Analyse en cours…" : label}
        </Button>
      </div>
      {result &&
        (result.ok ? (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Proposition créée pour <b>{result.company}</b> : {result.solutions} solution(s),{" "}
            {result.events} événement(s).{" "}
            <Link href="/admin/proposals" className="underline">
              Voir dans les propositions
            </Link>
          </p>
        ) : (
          <p className="text-xs text-amber-600 dark:text-amber-400">{result.message}</p>
        ))}
    </div>
  );
}
