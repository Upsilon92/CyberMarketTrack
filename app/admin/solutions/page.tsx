// Admin solutions list.
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DeleteButton } from "@/components/admin/delete-button";
import { loadMarket, ownerDisplayName, isStale } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AdminSolutions() {
  const t = await getTranslations("admin");
  const tCommon = await getTranslations("common");
  const market = await loadMarket();
  const list = [...market.solutions].sort((a, b) =>
    a.timeline.currentName.localeCompare(b.timeline.currentName)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("solutions")}</h1>
        <Link href="/admin/solutions/new">
          <Button>{t("newSolution")}</Button>
        </Link>
      </div>

      <div className="divide-y border rounded-md">
        {list.map((s) => (
          <div key={s.id} className="p-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{s.timeline.currentName}</span>
            <span className="text-xs text-muted-foreground">
              {ownerDisplayName(market, s.timeline.currentOwnerCompanyId)}
            </span>
            {isStale(s.updatedAt) && (
              <Badge variant="destructive" className="text-[10px]">
                {tCommon("toRecheck")}
              </Badge>
            )}
            <span className="ml-auto flex gap-1.5">
              <Link href={`/admin/solutions/${s.id}`}>
                <Button size="sm" variant="outline">
                  {t("edit")}
                </Button>
              </Link>
              <Link href={`/admin/solutions/${s.id}/history`}>
                <Button size="sm" variant="outline">
                  {t("history")}
                </Button>
              </Link>
              <DeleteButton path={`/api/solutions/${s.id}`} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
