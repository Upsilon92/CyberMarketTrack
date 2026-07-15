"use client";

// "View as of year" selector — the direct payoff of the period model.
// Navigates with ?at=YYYY; the server derives the state at that date.
import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

export function AsOfSelect({ minYear, value }: { minYear: number; value?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("common");
  const currentYear = new Date().getFullYear();

  const years: number[] = [];
  for (let y = currentYear; y >= minYear; y--) years.push(y);

  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      {t("asOf")}
      <select
        className="border rounded-md bg-background px-2 py-1 text-sm text-foreground"
        value={value ?? "now"}
        onChange={(e) => {
          const v = e.target.value;
          router.push(v === "now" ? pathname : `${pathname}?at=${v}`);
        }}
      >
        <option value="now">{t("asOfNow")}</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </label>
  );
}
