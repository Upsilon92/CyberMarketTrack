"use client";

// Searchable multi-select dropdown: a button showing "Label (n)" opens a panel
// with a filter field (accent-insensitive) and a checkbox list. Used for the
// solutions tag filters where each family can have many options.
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export interface MultiOption {
  value: string;
  label: string;
}

export function MultiCombobox({
  label,
  options,
  selected,
  onChange,
  placeholder,
  emptyText = "—",
  className,
}: {
  label: string;
  options: MultiOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  emptyText?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    return q ? options.filter((o) => norm(o.label).includes(q)) : options;
  }, [query, options]);

  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="border rounded-md bg-background text-foreground px-2.5 h-9 text-sm inline-flex items-center gap-1.5 min-w-40"
      >
        <span className="text-muted-foreground">{label}</span>
        {selected.length > 0 && (
          <span className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] w-4 h-4">
            {selected.length}
          </span>
        )}
        <span className="ml-auto text-muted-foreground">▾</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-64 rounded-md border bg-popover text-popover-foreground shadow-md">
          <div className="p-2 border-b">
            <Input
              autoFocus
              className="h-8 text-sm"
              placeholder={placeholder ?? label}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <ul className="max-h-60 overflow-auto p-1 text-sm">
            {filtered.length === 0 ? (
              <li className="px-2 py-2 text-muted-foreground">{emptyText}</li>
            ) : (
              filtered.map((o) => (
                <li key={o.value}>
                  <label className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-accent">
                    <Checkbox
                      checked={selected.includes(o.value)}
                      onCheckedChange={() => toggle(o.value)}
                    />
                    <span>{o.label}</span>
                  </label>
                </li>
              ))
            )}
          </ul>
          {selected.length > 0 && (
            <div className="border-t p-1">
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full text-left px-2 py-1 text-xs text-primary hover:underline"
              >
                {`Effacer (${selected.length})`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
