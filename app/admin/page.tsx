// Admin dashboard: quick links + counters.
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { loadMarket, isStale } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const t = await getTranslations("admin");
  const tProp = await getTranslations("proposals");
  const market = await loadMarket();
  const [eventCount, pendingProposals] = await Promise.all([
    prisma.event.count(),
    prisma.proposal.count({ where: { status: "PENDING" } }),
  ]);
  const staleCount =
    market.companies.filter((c) => isStale(c.updatedAt)).length +
    market.solutions.filter((s) => isStale(s.updatedAt)).length;

  // Companies/Solutions/Tags are managed on their public pages now, so the
  // dashboard only surfaces the admin-only tools.
  const cards = [
    { href: "/admin/proposals", label: tProp("navLabel"), count: pendingProposals },
    { href: "/admin/audit", label: t("audit"), count: eventCount },
    { href: "/admin/review", label: t("review"), count: staleCount },
    { href: "/admin/import", label: t("import"), count: null },
    { href: "/admin/backup", label: t("backup"), count: null },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {cards.map((c) => (
        <Link key={c.href} href={c.href}>
          <Card className="card-hover">
            <CardContent className="py-6 text-center">
              {c.count !== null && <div className="text-2xl font-bold">{c.count}</div>}
              <div className="text-sm text-muted-foreground">{c.label}</div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
