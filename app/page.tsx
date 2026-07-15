// Home page: global search, simple stats, latest market events.
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SearchBar } from "@/components/search-bar";
import { EventLine } from "@/components/event-line";
import { Card, CardContent } from "@/components/ui/card";
import { getStats, loadAllEvents } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const t = await getTranslations("home");
  const tCommon = await getTranslations("common");
  const [stats, events] = await Promise.all([getStats(), loadAllEvents()]);
  const latest = events.slice(0, 8);

  return (
    <div className="space-y-10">
      <section className="text-center space-y-4 pt-8">
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">{t("subtitle")}</p>
        <div className="flex justify-center pt-2">
          <SearchBar />
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
        {[
          { href: "/companies", label: t("statCompanies", { count: stats.companies }) },
          { href: "/solutions", label: t("statSolutions", { count: stats.solutions }) },
          { href: "/news", label: t("statEvents", { count: stats.events }) },
        ].map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="hover:border-primary/50 transition-colors">
              <CardContent className="py-6 text-center font-semibold">{s.label}</CardContent>
            </Card>
          </Link>
        ))}
      </section>

      <section className="max-w-3xl mx-auto space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">{t("latestEvents")}</h2>
          <Link href="/news" className="text-sm text-primary hover:underline">
            {t("seeAllNews")} →
          </Link>
        </div>
        <Card>
          <CardContent className="divide-y [&>*]:py-2.5">
            {latest.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">{tCommon("noResults")}</p>
            )}
            {latest.map((e) => (
              <EventLine key={e.id} event={e} />
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
