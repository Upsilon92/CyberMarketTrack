"use client";

// Live client-side text filter over a server-rendered list. Each item carries a
// precomputed lowercase `search` string and its already-rendered `node`, so
// filtering is instant while typing and nothing is re-fetched. Reused by the
// public Companies/Solutions lists and the admin lists (different layouts via
// `containerClassName`).
import { useState } from "react";
import { Input } from "@/components/ui/input";

export interface LiveListItem {
  id: string;
  search: string;
  node: React.ReactNode;
}

export function LiveListFilter({
  items,
  placeholder,
  emptyLabel,
  containerClassName = "grid grid-cols-1 lg:grid-cols-2 gap-3",
}: {
  items: LiveListItem[];
  placeholder: string;
  emptyLabel: string;
  /** Wrapper around the matching items (grid for cards, divide-y for admin rows) */
  containerClassName?: string;
}) {
  const [q, setQ] = useState("");
  const nq = q.trim().toLowerCase();
  const filtered = nq ? items.filter((i) => i.search.includes(nq)) : items;

  return (
    <div className="space-y-3">
      <Input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="max-w-sm"
        aria-label={placeholder}
      />
      {filtered.length === 0 ? (
        <p className="text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className={containerClassName}>
          {filtered.map((i) => (
            <div key={i.id}>{i.node}</div>
          ))}
        </div>
      )}
    </div>
  );
}
