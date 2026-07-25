"use client";

// A lightweight, dependency-free typeahead combobox: an <input> that filters a
// list of options as you type (accent-insensitive, matching label + keywords)
// and lets you pick one. Controlled via `value` / `onValueChange`.
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

export interface ComboOption {
  value: string;
  label: string;
  /** Extra searchable text (e.g. the ISO code, aliases) */
  keywords?: string;
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Combobox({
  value,
  onValueChange,
  options,
  placeholder,
  emptyText,
  id,
  className,
  allowClear = true,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
  emptyText?: string;
  id?: string;
  className?: string;
  allowClear?: boolean;
}) {
  const selected = options.find((o) => o.value === value);
  const [query, setQuery] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  // Keep the visible text in sync when the value changes from outside.
  useEffect(() => {
    setQuery(selected?.label ?? "");
  }, [selected?.label]);

  // Close (and restore the selected label) when clicking outside.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(selected?.label ?? "");
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [selected?.label]);

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    // Empty query, or query still equal to the current selection -> show all.
    if (!q || (selected && query === selected.label)) return options.slice(0, 50);
    return options
      .filter(
        (o) => norm(o.label).includes(q) || (o.keywords ? norm(o.keywords).includes(q) : false)
      )
      .slice(0, 50);
  }, [query, options, selected]);

  function pick(o: ComboOption) {
    onValueChange(o.value);
    setQuery(o.label);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <Input
        id={id}
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
          if (e.target.value === "" && allowClear) onValueChange("");
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            if (open && filtered[active]) {
              e.preventDefault();
              pick(filtered[active]);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
            setQuery(selected?.label ?? "");
          }
        }}
      />
      {open && (
        <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md text-sm">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground">{emptyText ?? "—"}</li>
          ) : (
            filtered.map((o, i) => (
              <li
                key={o.value}
                className={`px-3 py-1.5 cursor-pointer ${
                  i === active ? "bg-accent text-accent-foreground" : ""
                } ${o.value === value ? "font-medium" : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
              >
                {o.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
