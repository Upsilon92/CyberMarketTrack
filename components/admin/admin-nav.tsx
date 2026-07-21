"use client";

// Admin settings sub-nav. Rendered by the admin layout on the hub pages
// (dashboard + tools) but hidden on the entity edit/create forms
// (companies / solutions / tags / events) so those don't show the sub-menu.
import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminNav({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  const path = usePathname();
  if (/^\/admin\/(companies|solutions|tags|events)(\/|$)/.test(path)) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 border-b pb-2 text-sm overflow-x-auto">
      <span className="font-semibold mr-2">{title}</span>
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="px-2.5 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent whitespace-nowrap"
        >
          {l.label}
        </Link>
      ))}
    </div>
  );
}
