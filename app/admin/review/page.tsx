// "Pages to review": stale entities (not updated for FRESHNESS_MONTHS),
// oldest first — the maintenance work list.
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { loadMarket, isStale } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AdminReview() {
  const locale = await getLocale();
  const t = await getTranslations("admin");
  const tr = await getTranslations("admin.reviewPage");
  const market = await loadMarket();

  const stale = [
    ...market.companies
      .filter((c) => isStale(c.updatedAt))
      .map((c) => ({
        kind: "company" as const,
        id: c.id,
        name: c.timeline.currentName,
        updatedAt: c.updatedAt,
      })),
    ...market.solutions
      .filter((s) => isStale(s.updatedAt))
      .map((s) => ({
        kind: "solution" as const,
        id: s.id,
        name: s.timeline.currentName,
        updatedAt: s.updatedAt,
      })),
  ].sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("review")}</h1>
      <p className="text-sm text-muted-foreground">
        {tr("hint", { months: process.env.FRESHNESS_MONTHS ?? "12" })}
      </p>

      {stale.length === 0 && <p className="text-muted-foreground">{tr("empty")}</p>}

      <div className="divide-y border rounded-md text-sm">
        {stale.map((e) => (
          <div key={`${e.kind}-${e.id}`} className="p-3 flex items-center gap-3">
            <Badge variant="outline" className="text-[10px]">
              {e.kind === "company" ? t("companies") : t("solutions")}
            </Badge>
            <Link
              href={`/admin/${e.kind === "company" ? "companies" : "solutions"}/${e.id}`}
              className="text-primary hover:underline font-medium"
            >
              {e.name}
            </Link>
            <span className="ml-auto text-muted-foreground text-xs">
              {tr("lastUpdated")} : {e.updatedAt.toLocaleDateString(locale)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
