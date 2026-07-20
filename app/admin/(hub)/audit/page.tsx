// Audit log — filterable by entity type (traceability foundation for the
// future collaborative mode).
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { FilterBar, type FilterDef } from "@/components/filter-bar";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AdminAudit({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  const { entity } = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("admin");
  const ta = await getTranslations("admin.auditPage");
  const tCommon = await getTranslations("common");

  const entries = await prisma.auditLog.findMany({
    where: entity ? { entityType: entity } : undefined,
    orderBy: { timestamp: "desc" },
    take: 200,
  });
  const entityTypes = await prisma.auditLog.findMany({
    select: { entityType: true },
    distinct: ["entityType"],
  });

  const filters: FilterDef[] = [
    {
      name: "entity",
      label: ta("filterEntity"),
      value: entity ?? "",
      options: entityTypes.map((e) => ({ value: e.entityType, label: e.entityType })),
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("audit")}</h1>
      <FilterBar filters={filters} allLabel={tCommon("all")} resetLabel={tCommon("reset")} />

      {entries.length === 0 && <p className="text-muted-foreground">{ta("empty")}</p>}

      <div className="divide-y border rounded-md text-sm">
        {entries.map((e) => (
          <div key={e.id} className="p-2.5 flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground tabular-nums w-36 shrink-0">
              {e.timestamp.toLocaleString(locale)}
            </span>
            <Badge
              variant={e.action === "DELETE" ? "destructive" : "outline"}
              className="text-[10px]"
            >
              {e.action}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {e.entityType}
            </Badge>
            <span>{e.summary}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
