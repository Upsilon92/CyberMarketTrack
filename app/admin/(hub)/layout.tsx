// Settings hub layout: the admin sub-nav (dashboard + cross-cutting tools).
// Only the hub pages live here; entity edit forms sit outside this group so they
// don't show the settings sub-menu.
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function AdminHubLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("admin");

  const links = [
    { href: "/admin", label: t("dashboard") },
    { href: "/admin/import", label: t("import") },
    { href: "/admin/audit", label: t("audit") },
    { href: "/admin/review", label: t("review") },
    { href: "/admin/backup", label: t("backup") },
    { href: "/admin/account", label: t("account") },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1 border-b pb-2 text-sm overflow-x-auto">
        <span className="font-semibold mr-2">{t("title")}</span>
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
      {children}
    </div>
  );
}
