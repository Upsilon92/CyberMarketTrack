"use client";

// Multi-select tag filters (one group per tag family) + vendor select.
// State lives in the URL: each family has its own comma-separated param.
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";

interface TagGroup {
  param: string;
  label: string;
  selected: string[];
  options: { value: string; label: string }[];
}

export function MultiTagFilter({
  groups,
  vendor,
  resetLabel,
}: {
  groups: TagGroup[];
  vendor: { label: string; value: string; options: { value: string; label: string }[]; allLabel: string };
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

  function toggleTag(param: string, selected: string[], value: string) {
    const next = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
    update((p) => {
      if (next.length) p.set(param, next.join(","));
      else p.delete(param);
    });
  }

  const hasActive = vendor.value !== "" || groups.some((g) => g.selected.length > 0);

  return (
    <div className="space-y-2">
      {groups.map((g) =>
        g.options.length === 0 ? null : (
          <div key={g.param} className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground w-28 shrink-0">{g.label}</span>
            {g.options.map((o) => {
              const active = g.selected.includes(o.value);
              return (
                <button key={o.value} type="button" onClick={() => toggleTag(g.param, g.selected, o.value)}>
                  <Badge
                    variant={active ? "default" : "outline"}
                    className="cursor-pointer select-none"
                  >
                    {o.label}
                  </Badge>
                </button>
              );
            })}
          </div>
        )
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {vendor.label}
          <select
            className="border rounded-md bg-background text-foreground px-2 py-1.5 text-sm min-w-40"
            value={vendor.value}
            onChange={(e) =>
              update((p) => {
                if (e.target.value) p.set("vendor", e.target.value);
                else p.delete("vendor");
              })
            }
          >
            <option value="">{vendor.allLabel}</option>
            {vendor.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {hasActive && (
          <button
            type="button"
            onClick={() => router.push(pathname)}
            className="text-sm text-primary hover:underline"
          >
            {resetLabel}
          </button>
        )}
      </div>
    </div>
  );
}
