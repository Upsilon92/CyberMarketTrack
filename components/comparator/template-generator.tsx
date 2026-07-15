"use client";

// Template generator form: columns from any tag family, rows filtered by a
// base tag, two renderings (checks / coverage). Navigates with query params;
// the server generates the content.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { TAG_FAMILIES } from "@/lib/constants";

export function TemplateGeneratorForm({
  tags,
}: {
  tags: { slug: string; family: string; label: string }[];
}) {
  const router = useRouter();
  const t = useTranslations("comparators.generator");
  const tFamilies = useTranslations("tagFamilies");
  const [family, setFamily] = useState("SCOPE");
  const [baseTag, setBaseTag] = useState("");
  const [mode, setMode] = useState<"checks" | "coverage">("checks");

  return (
    <details className="border rounded-md p-3 print:hidden">
      <summary className="text-sm font-medium cursor-pointer">{t("title")}</summary>
      <div className="flex flex-wrap items-end gap-3 pt-3">
        <label className="text-xs text-muted-foreground flex flex-col gap-1">
          {t("columnsFamily")}
          <select
            className="border rounded-md bg-background text-foreground px-2 py-1.5 text-sm"
            value={family}
            onChange={(e) => setFamily(e.target.value)}
          >
            {TAG_FAMILIES.map((f) => (
              <option key={f} value={f}>
                {tFamilies(f)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground flex flex-col gap-1">
          {t("baseTag")}
          <select
            className="border rounded-md bg-background text-foreground px-2 py-1.5 text-sm min-w-40"
            value={baseTag}
            onChange={(e) => setBaseTag(e.target.value)}
          >
            <option value="">{t("allSolutions")}</option>
            {tags.map((tg) => (
              <option key={tg.slug} value={tg.slug}>
                {tg.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground flex flex-col gap-1">
          {t("mode")}
          <select
            className="border rounded-md bg-background text-foreground px-2 py-1.5 text-sm"
            value={mode}
            onChange={(e) => setMode(e.target.value as "checks" | "coverage")}
          >
            <option value="checks">{t("checks")}</option>
            <option value="coverage">{t("coverage")}</option>
          </select>
        </label>
        <Button
          size="sm"
          onClick={() =>
            router.push(
              `/comparators/new?family=${family}&mode=${mode}${baseTag ? `&tag=${baseTag}` : ""}`
            )
          }
        >
          {t("generate")}
        </Button>
      </div>
    </details>
  );
}
