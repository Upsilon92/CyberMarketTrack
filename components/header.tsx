// Site header: navigation, language switcher, theme toggle.
// Server component; the interactive bits are small client components.
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { MobileNav } from "@/components/mobile-nav";

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
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4">
        {/* Mobile hamburger */}
        <MobileNav links={links} />

        <Link href="/" className="font-semibold tracking-tight shrink-0">
          CyberMarket<span className="text-primary">Track</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 text-sm">
          {links.slice(1).map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
