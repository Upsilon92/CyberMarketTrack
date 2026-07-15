// Admin layout: secondary navigation + sign-out. The proxy already redirects
// anonymous users, but we re-check the session server-side (defense in depth).
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/login");

  const t = await getTranslations("admin");
  const tLogin = await getTranslations("login");

  const links = [
    { href: "/admin", label: t("dashboard") },
    { href: "/admin/companies", label: t("companies") },
    { href: "/admin/solutions", label: t("solutions") },
    { href: "/admin/tags", label: t("tags") },
    { href: "/admin/import", label: t("import") },
    { href: "/admin/audit", label: t("audit") },
    { href: "/admin/review", label: t("review") },
    { href: "/admin/backup", label: t("backup") },
  ];

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

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
        <form action={doSignOut} className="ml-auto">
          <Button variant="ghost" size="sm" type="submit">
            {tLogin("signOut")}
          </Button>
        </form>
      </div>
      {children}
    </div>
  );
}
