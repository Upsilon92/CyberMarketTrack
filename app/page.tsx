// Home page: hero with global search, stat cards, latest market events.
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SearchBar } from "@/components/search-bar";
import { EventLine } from "@/components/event-line";
import { Card, CardContent } from "@/components/ui/card";
import { getStats, loadAllEvents } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const t = await getTranslations("home");
  const [stats, events] = await Promise.all([getStats(), loadAllEvents()]);

  // Latest events split into 3 columns by importance (most recent first).
  const columns = [
    { key: "MAJOR", title: t("colMajor"), items: events.filter((e) => e.importance === "MAJOR").slice(0, 8) },
    { key: "MEDIUM", title: t("colMedium"), items: events.filter((e) => e.importance === "MEDIUM").slice(0, 8) },
    { key: "MINOR", title: t("colMinor"), items: events.filter((e) => e.importance === "MINOR").slice(0, 8) },
  ];

  const statCards = [
    { href: "/companies", value: stats.companies, label: t("statCompaniesLabel"), icon: "building" },
    { href: "/solutions", value: stats.solutions, label: t("statSolutionsLabel"), icon: "shield" },
    { href: "/news", value: stats.events, label: t("statEventsLabel"), icon: "activity" },
  ] as const;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border hero-surface">
        <div className="absolute inset-0 grid-overlay pointer-events-none" />
        <div className="relative px-6 py-12 sm:py-16 text-center space-y-5">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            {t("badge")}
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight max-w-3xl mx-auto text-balance">
            {t("title")}
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto text-balance">{t("subtitle")}</p>
          <div className="flex justify-center pt-1">
            <SearchBar />
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="card-hover h-full">
              <CardContent className="py-5 flex items-center gap-4">
                <span className="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-primary/10 text-primary shrink-0">
                  <StatIcon name={s.icon} />
                </span>
                <span>
                  <span className="block text-2xl font-bold tabular-nums leading-none">{s.value}</span>
                  <span className="block text-sm text-muted-foreground mt-1">{s.label}</span>
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      {/* Latest events, 3 columns by importance */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">{t("latestEvents")}</h2>
          <Link href="/news" className="text-sm text-primary hover:underline">
            {t("seeAllNews")} →
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {columns.map((col) => (
            <Card key={col.key} className="overflow-hidden">
              <div
                className={`px-4 py-2.5 border-b text-sm font-semibold flex items-center gap-2 ${
                  col.key === "MAJOR"
                    ? "text-emerald-700 dark:text-emerald-300"
                    : col.key === "MEDIUM"
                      ? "text-amber-700 dark:text-amber-300"
                      : "text-muted-foreground"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    col.key === "MAJOR"
                      ? "bg-emerald-500"
                      : col.key === "MEDIUM"
                        ? "bg-amber-500"
                        : "bg-muted-foreground/50"
                  }`}
                />
                {col.title}
              </div>
              <CardContent className="divide-y [&>*]:py-2.5">
                {col.items.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4">{t("colEmpty")}</p>
                )}
                {col.items.map((e) => (
                  <EventLine key={e.id} event={e} compact />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatIcon({ name }: { name: "building" | "shield" | "activity" }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (name === "building")
    return (
      <svg {...common}>
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <path d="M9 22v-4h6v4M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01" />
      </svg>
    );
  if (name === "shield")
    return (
      <svg {...common}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}
