// Site header: navigation, language switcher, theme toggle, admin settings.
// Server component; the interactive bits are small client components.
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { MobileNav } from "@/components/mobile-nav";
import { NavLink } from "@/components/nav-link";
import { HeaderSearch } from "@/components/header-search";

export async function Header() {
  const t = await getTranslations("nav");

  const links = [
    { href: "/", label: t("home") },
    { href: "/companies", label: t("companies") },
    { href: "/solutions", label: t("solutions") },
    { href: "/tags", label: t("tags") },
    { href: "/comparators", label: t("comparators") },
    { href: "/news", label: t("news") },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
        {/* Mobile hamburger */}
        <MobileNav links={links} />

        <Link href="/" className="flex items-center gap-2 shrink-0 group">
          <ShieldMark />
          <span className="font-semibold tracking-tight text-[15px]">
            CyberMarket<span className="brand-gradient">Track</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-0.5 text-sm ml-2">
          {links.slice(1).map((l) => (
            <NavLink key={l.href} href={l.href} label={l.label} />
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <HeaderSearch />
          <LocaleSwitcher />
          <ThemeToggle />
          {/* Settings / admin access (gear) */}
          <Link
            href="/admin"
            aria-label={t("admin")}
            title={t("admin")}
            className="inline-flex items-center justify-center w-9 h-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <GearIcon />
          </Link>
        </div>
      </div>
    </header>
  );
}

// Small inline shield mark (no icon library needed)
function ShieldMark() {
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 text-primary ring-1 ring-primary/20">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    </span>
  );
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}
