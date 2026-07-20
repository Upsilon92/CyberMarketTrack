// "New event" entry point (linked from the News "+"): pick the entity the event
// concerns, then land on its history editor to add the event. Events always
// attach to a company or a solution, so creation goes through that subject.
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LiveListFilter, type LiveListItem } from "@/components/live-list-filter";
import { loadMarket } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  const t = await getTranslations("admin");
  const tCommon = await getTranslations("common");
  const market = await loadMarket();

  const companies = [...market.companies].sort((a, b) =>
    a.timeline.currentName.localeCompare(b.timeline.currentName)
  );
  const solutions = [...market.solutions].sort((a, b) =>
    a.timeline.currentName.localeCompare(b.timeline.currentName)
  );

  const row = (name: string, kind: string, href: string) => (
    <Link href={href} className="flex items-center justify-between gap-2 p-3 hover:bg-accent">
      <span className="font-medium text-sm">{name}</span>
      <span className="text-xs text-muted-foreground">{kind}</span>
    </Link>
  );

  const items: LiveListItem[] = [
    ...companies.map((c) => ({
      id: "c-" + c.id,
      search: c.timeline.currentName.toLowerCase(),
      node: row(c.timeline.currentName, t("companies"), `/admin/companies/${c.id}/history`),
    })),
    ...solutions.map((s) => ({
      id: "s-" + s.id,
      search: s.timeline.currentName.toLowerCase(),
      node: row(s.timeline.currentName, t("solutions"), `/admin/solutions/${s.id}/history`),
    })),
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("addEvent")}</h1>
      <p className="text-sm text-muted-foreground">{t("addEventPickHint")}</p>
      <LiveListFilter
        items={items}
        placeholder={t("eventsSearch")}
        emptyLabel={tCommon("noResults")}
        containerClassName="divide-y border rounded-md"
      />
    </div>
  );
}
