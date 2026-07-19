"use client";

// Theme selector (next-themes): Light / Dark / System. "System" follows the
// OS preference (ThemeProvider has enableSystem). The trigger icon reflects the
// chosen setting; a dropdown lets the user pick explicitly.
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("common");
  // Avoid hydration mismatch: the theme is only known client-side.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <Button variant="ghost" size="sm" className="w-9" aria-hidden />;

  const current = theme ?? "system";
  const icon = current === "light" ? "☀️" : current === "dark" ? "🌙" : "🖥️";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="w-9" aria-label={t("theme")} title={t("theme")}>
          {icon}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={current} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">☀️ {t("themeLight")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">🌙 {t("themeDark")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">🖥️ {t("themeSystem")}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
