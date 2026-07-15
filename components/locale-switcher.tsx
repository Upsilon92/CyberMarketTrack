"use client";

// Language switcher (FR/EN). Persists the choice in a cookie via a server
// action, then the whole tree re-renders in the new locale.
import { useLocale } from "next-intl";
import { useTransition } from "react";
import { setLocale } from "@/app/actions/locale";
import { Button } from "@/components/ui/button";

export function LocaleSwitcher() {
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();
  const next = locale === "fr" ? "en" : "fr";

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={() => startTransition(() => setLocale(next))}
      aria-label={`Switch language to ${next.toUpperCase()}`}
      className="font-mono text-xs w-10"
    >
      {next.toUpperCase()}
    </Button>
  );
}
