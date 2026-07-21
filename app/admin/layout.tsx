// Admin auth boundary + settings sub-nav. The nav is a client component that
// hides itself on entity edit/create forms (see AdminNav).
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { AdminNav } from "@/components/admin/admin-nav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/login");

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
      <AdminNav title={t("title")} links={links} />
      {children}
    </div>
  );
}
