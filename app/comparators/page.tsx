// Saved comparators list (viewable by everyone; editing requires the admin
// session — the API enforces it).
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteButton } from "@/components/admin/delete-button";

export const dynamic = "force-dynamic";

export default async function ComparatorsPage() {
  const locale = await getLocale();
  const t = await getTranslations("comparators");
  const session = await auth();
  const canEdit = session?.user?.role === "ADMIN";

  const comparators = await prisma.comparator.findMany({ orderBy: { updatedAt: "desc" } });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        {canEdit && (
          <Link href="/comparators/new">
            <Button>{t("new")}</Button>
          </Link>
        )}
      </div>

      {comparators.length === 0 && <p className="text-muted-foreground">{t("empty")}</p>}

      <div className="grid gap-2">
        {comparators.map((c) => (
          <Card key={c.id}>
            <CardContent className="py-3 flex flex-wrap items-center gap-3">
              <Link href={`/comparators/${c.id}`} className="font-medium text-primary hover:underline">
                {c.name}
              </Link>
              <span className="text-xs text-muted-foreground">
                {t("updatedAt", { date: c.updatedAt.toLocaleDateString(locale) })}
              </span>
              {canEdit && (
                <span className="ml-auto">
                  <DeleteButton path={`/api/comparators/${c.id}`} />
                </span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
