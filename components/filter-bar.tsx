"use client";

// Generic filter bar driven by URL search params: each select updates the
// query string, so filtered lists stay server-rendered and shareable.
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export interface FilterDef {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  /** For sort selects: no "All" empty option */
  noAllOption?: boolean;
}

export function FilterBar({
  filters,
  allLabel,
  resetLabel,
}: {
  filters: FilterDef[];
  allLabel: string;
  resetLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(name: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(name, value);
    else params.delete(name);
    router.push(`${pathname}?${params.toString()}`);
  }

  const hasActive = filters.some((f) => !f.noAllOption && f.value);

  return (
    <div className="flex flex-wrap items-end gap-3">
      {filters.map((f) => (
        <label key={f.name} className="flex flex-col gap-1 text-xs text-muted-foreground">
          {f.label}
          <select
            className="border rounded-md bg-background text-foreground px-2 py-1.5 text-sm min-w-32"
            value={f.value}
            onChange={(e) => setParam(f.name, e.target.value)}
          >
            {!f.noAllOption && <option value="">{allLabel}</option>}
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      {hasActive && (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="text-sm text-primary hover:underline pb-2"
        >
          {resetLabel}
        </button>
      )}
    </div>
  );
}
