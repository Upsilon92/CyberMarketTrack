"use client";

// Consolidated header account/settings menu — one compact button on mobile.
// Theme and Language are nested submenus (click the user button → click Theme →
// pick Light/Dark/System; same for Language). The logout is a server action
// passed from the (server) header.
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useTheme } from "next-themes";
import { useLocale, useTranslations } from "next-intl";
import { setLocale } from "@/app/actions/locale";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function UserIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

const THEME_ICON: Record<string, string> = { light: "☀️", dark: "🌙", system: "🖥️" };

export function UserMenu({
  isLoggedIn,
  username,
  logoutAction,
}: {
  isLoggedIn: boolean;
  username?: string | null;
  logoutAction: () => Promise<void>;
}) {
  const tCommon = useTranslations("common");
  const tLogin = useTranslations("login");
  const tAdmin = useTranslations("admin");
  const { theme, setTheme } = useTheme();
  const locale = useLocale();
  const [, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const currentTheme = mounted ? (theme ?? "system") : "system";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="w-9" aria-label={tLogin("title")}>
          <UserIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {isLoggedIn && (
          <>
            {username && <DropdownMenuLabel>{username}</DropdownMenuLabel>}
            <DropdownMenuItem asChild>
              <Link href="/admin/account">{tAdmin("account")}</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {/* Theme submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span className="mr-2">{THEME_ICON[currentTheme]}</span>
            {tCommon("theme")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={currentTheme} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">☀️ {tCommon("themeLight")}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">🌙 {tCommon("themeDark")}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                🖥️ {tCommon("themeSystem")}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Language submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span className="mr-2">🌐</span>
            {tCommon("language")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={locale}
              onValueChange={(v) => startTransition(() => setLocale(v))}
            >
              <DropdownMenuRadioItem value="fr">🇫🇷 Français</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="en">🇬🇧 English</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />
        {isLoggedIn ? (
          <DropdownMenuItem asChild>
            <form action={logoutAction}>
              <button type="submit" className="w-full text-left">
                {tLogin("signOut")}
              </button>
            </form>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild>
            <Link href="/login">{tLogin("submit")}</Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
