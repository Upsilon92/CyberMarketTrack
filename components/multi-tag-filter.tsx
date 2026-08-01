"use client";

// Multi-select tag filters (one group per tag family) + vendor select.
// State lives in the URL: each family has its own comma-separated param.
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { MultiCombobox } from "@/components/ui/multi-combobox";

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

  function setTag(param: string, next: string[]) {
    update((p) => {
      if (next.length) p.set(param, next.join(","));
      else p.delete(param);
    });
  }

  const hasActive = vendor.value !== "" || groups.some((g) => g.selected.length > 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {groups.map((g) =>
          g.options.length === 0 ? null : (
            <MultiCombobox
              key={g.param}
              label={g.label}
              options={g.options}
              selected={g.selected}
              onChange={(next) => setTag(g.param, next)}
            />
          )
        )}
      </div>
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
