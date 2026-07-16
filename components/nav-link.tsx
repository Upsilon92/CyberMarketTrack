"use client";

// Header nav link with active-route highlighting.
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-md transition-colors ${
        active
          ? "text-foreground bg-accent font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
      }`}
    >
      {label}
    </Link>
  );
}
