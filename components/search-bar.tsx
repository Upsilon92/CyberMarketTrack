"use client";

// Global search input: navigates to /search?q=…
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function SearchBar({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const t = useTranslations("common");

  return (
    <form
      className="flex gap-2 w-full max-w-xl"
      onSubmit={(e) => {
        e.preventDefault();
        const q = new FormData(e.currentTarget).get("q")?.toString().trim() ?? "";
        if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
      }}
    >
      <Input name="q" defaultValue={initialQuery} placeholder={t("searchPlaceholder")} aria-label={t("search")} />
      <Button type="submit">{t("search")}</Button>
    </form>
  );
}
