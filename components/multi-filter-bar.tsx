"use client";

// Multi-select filter bar driven by URL search params. Each group's selected
// values are stored comma-separated in one query param, so filtered lists stay
// server-rendered and shareable. Options render as toggle chips.
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";

export interface MultiFilterGroup {
  /** URL param name (e.g. "type", "country", "status") */
  param: string;
  label: string;
  selected: string[];
  options: { value: string; label: string }[];
}

export function MultiFilterBar({
  groups,
  sort,
  resetLabel,
}: {
  groups: MultiFilterGroup[];
  /** Single-select sort dropdown (optional) */
  sort?: { label: string; value: string; options: { value: string; label: string }[] };
  resetLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(fn: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    fn(params);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function toggle(param: string, selected: string[], value: string) {
    const next = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
    update((p) => {
      if (next.length) p.set(param, next.join(","));
      else p.delete(param);
    });
  }

  const hasActive = groups.some((g) => g.selected.length > 0);

  return (
    <div className="space-y-2.5">
      {groups.map((g) => (
        <div key={g.param} className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground w-16 shrink-0">{g.label}</span>
          {g.options.map((o) => {
            const active = g.selected.includes(o.value);
            return (
              <button key={o.value} type="button" onClick={() => toggle(g.param, g.selected, o.value)}>
                <Badge
                  variant={active ? "default" : "outline"}
                  className="cursor-pointer select-none font-normal"
                >
                  {o.label}
                </Badge>
              </button>
            );
          })}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3 pt-0.5">
        {sort && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {sort.label}
            <select
              className="border rounded-md bg-background text-foreground px-2 py-1.5 text-sm"
              value={sort.value}
              onChange={(e) =>
                update((p) => {
                  if (e.target.value) p.set("sort", e.target.value);
                  else p.delete("sort");
                })
              }
            >
              {sort.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {hasActive && (
          <button
            type="button"
            onClick={() => {
              // Keep sort, clear the multi-select groups
              const params = new URLSearchParams(searchParams.toString());
              for (const g of groups) params.delete(g.param);
              const qs = params.toString();
              router.push(qs ? `${pathname}?${qs}` : pathname);
            }}
            className="text-sm text-primary hover:underline"
          >
            {resetLabel}
          </button>
        )}
      </div>
    </div>
  );
}
