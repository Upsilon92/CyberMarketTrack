// "Pages to review": maintenance work list. Two reasons are surfaced:
//  - staleness (not updated for FRESHNESS_MONTHS)
//  - broken logo URL (checked client-side, see BrokenLogoCheck)
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { BrokenLogoCheck } from "@/components/admin/broken-logo-check";
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

  // Companies whose logo is a remote URL (http/https) — candidates for the
  // client-side broken-logo check. Data-URI (uploaded) logos are always valid.
  const logoCandidates = market.companies
    .filter((c) => c.logoUrl && /^https?:\/\//i.test(c.logoUrl))
    .map((c) => ({ id: c.id, name: c.timeline.currentName, logoUrl: c.logoUrl! }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{t("review")}</h1>
        <p className="text-sm text-muted-foreground">
          {tr("hint", { months: process.env.FRESHNESS_MONTHS ?? "12" })}
        </p>
      </div>

      {/* Reason 1: staleness */}
      <div className="space-y-2">
        <h2 className="font-medium text-sm">
          {tr("staleTitle", { months: process.env.FRESHNESS_MONTHS ?? "12" })}
        </h2>
        {stale.length === 0 ? (
          <p className="text-muted-foreground text-sm">{tr("empty")}</p>
        ) : (
          <div className="divide-y border rounded-md text-sm">
            {stale.map((e) => (
              <div key={`${e.kind}-${e.id}`} className="p-3 flex items-center gap-3">
                <Badge variant="secondary" className="text-[10px]">
                  {tr("reasonStale")}
                </Badge>
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
        )}
      </div>

      {/* Reason 2: broken logo URLs (checked in the browser) */}
      <BrokenLogoCheck candidates={logoCandidates} />
    </div>
  );
}
