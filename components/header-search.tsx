"use client";

// Compact global search in the header: a magnifying-glass icon with a small
// input, available on every page. Submits to /search?q=…
// On mobile it collapses to just the icon (tap to expand via focus-within).
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { useTranslations } from "next-intl";

export function HeaderSearch() {
  const router = useRouter();
  const t = useTranslations("common");
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <form
      className="flex items-center rounded-md border border-border bg-background/60 focus-within:ring-1 focus-within:ring-ring focus-within:border-ring transition-colors h-8"
      onSubmit={(e) => {
        e.preventDefault();
        const q = new FormData(e.currentTarget).get("q")?.toString().trim() ?? "";
        if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
      }}
    >
      <button
        type="submit"
        aria-label={t("search")}
        className="grid place-items-center w-8 h-8 text-muted-foreground hover:text-foreground shrink-0"
        onClick={() => inputRef.current?.focus()}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </button>
      <input
        ref={inputRef}
        name="q"
        placeholder={t("search")}
        aria-label={t("search")}
        className="bg-transparent outline-none text-sm pr-2 w-0 focus:w-40 sm:w-28 sm:focus:w-48 transition-[width] duration-200"
      />
    </form>
  );
}
