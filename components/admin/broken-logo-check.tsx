"use client";

// Client-side broken-logo detection: loads each company's http(s) logo URL in
// the browser and reports the ones that fail to load. Done client-side on
// purpose — it avoids the server fetching arbitrary external URLs (SSRF).
// Data-URI logos (uploaded) are always valid and are not checked.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

interface Candidate {
  id: string;
  name: string;
  logoUrl: string;
}

export function BrokenLogoCheck({ candidates }: { candidates: Candidate[] }) {
  const t = useTranslations("admin.reviewPage");
  const [broken, setBroken] = useState<Candidate[]>([]);
  const [checked, setChecked] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (candidates.length === 0) {
      setDone(true);
      return;
    }
    let completed = 0;
    let cancelled = false;
    const found: Candidate[] = [];

    for (const c of candidates) {
      const img = new Image();
      const finish = (ok: boolean) => {
        if (cancelled) return;
        if (!ok) found.push(c);
        completed++;
        setChecked(completed);
        if (completed === candidates.length) {
          setBroken([...found].sort((a, b) => a.name.localeCompare(b.name)));
          setDone(true);
        }
      };
      img.onload = () => finish(img.naturalWidth > 0);
      img.onerror = () => finish(false);
      img.src = c.logoUrl;
    }
    return () => {
      cancelled = true;
    };
  }, [candidates]);

  if (candidates.length === 0) return null;

  return (
    <div className="space-y-2">
      <h2 className="font-medium text-sm flex items-center gap-2">
        {t("brokenLogosTitle")}
        {!done && (
          <span className="text-xs text-muted-foreground font-normal">
            {t("checking", { done: checked, total: candidates.length })}
          </span>
        )}
      </h2>
      {done && broken.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("brokenLogosNone")}</p>
      )}
      {broken.length > 0 && (
        <div className="divide-y border rounded-md text-sm">
          {broken.map((c) => (
            <div key={c.id} className="p-3 flex items-center gap-3">
              <Badge variant="destructive" className="text-[10px]">
                {t("reasonBrokenLogo")}
              </Badge>
              <Link
                href={`/admin/companies/${c.id}`}
                className="text-primary hover:underline font-medium"
              >
                {c.name}
              </Link>
              <span className="ml-auto text-muted-foreground text-xs truncate max-w-[40%]">
                {c.logoUrl}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
