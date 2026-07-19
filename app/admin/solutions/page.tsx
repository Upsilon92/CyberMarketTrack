// Admin solutions list + live name/vendor filter.
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DeleteButton } from "@/components/admin/delete-button";
import { LiveListFilter, type LiveListItem } from "@/components/live-list-filter";
import { loadMarket, ownerDisplayName, isStale } from "@/lib/queries";
import { formerNamePeriods } from "@/lib/timeline";

export const dynamic = "force-dynamic";

export default async function AdminSolutions() {
  const t = await getTranslations("admin");
  const tCommon = await getTranslations("common");
  const tSolutions = await getTranslations("solutions");
  const market = await loadMarket();
  const list = [...market.solutions].sort((a, b) =>
    a.timeline.currentName.localeCompare(b.timeline.currentName)
  );

  const items: LiveListItem[] = list.map((s) => {
    const formers = formerNamePeriods(s.timeline);
    const vendorName = market.companyNameById.get(s.timeline.currentOwnerCompanyId) ?? "";
    const search = [
      s.timeline.currentName,
      ...formers.map((p) => p.name),
      ...s.aliases.map((a) => a.name),
      vendorName,
    ]
      .join(" ")
      .toLowerCase();
    const node = (
      <div className="p-3 flex flex-wrap items-center gap-2 text-sm">
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
    );
    return { id: s.id, search, node };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("solutions")}</h1>
        <Link href="/admin/solutions/new">
          <Button>{t("newSolution")}</Button>
        </Link>
      </div>

      <LiveListFilter
        items={items}
        placeholder={tSolutions("searchPlaceholder")}
        emptyLabel={tCommon("noResults")}
        containerClassName="divide-y border rounded-md"
      />
    </div>
  );
}
