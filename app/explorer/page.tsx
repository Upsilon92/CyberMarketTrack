// Market Explorer — visualize an editor's history (acquisitions, and
// acquisitions of acquisitions) and/or a solution type's market (every editor
// of that type + the type-related acquisitions), as a timeline or as cards.
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { buildExplorerData } from "@/lib/explorer";
import { Explorer, type ExplorerState } from "@/components/explorer/explorer";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("explorer");
  return { title: t("title") };
}

const ID_RE = /^[a-z0-9]{8,40}$/i;
const SLUG_RE = /^[a-z0-9_-]{1,60}$/;

export default async function ExplorerPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; type?: string; view?: string; depth?: string; other?: string }>;
}) {
  const sp = await searchParams;
  const locale = ((await getLocale()) === "en" ? "en" : "fr") as "fr" | "en";
  const t = await getTranslations("explorer");
  const data = await buildExplorerData(locale);

  // Validate every URL parameter against the dataset — never trust the query.
  const company = sp.company && ID_RE.test(sp.company) && data.companies.some((c) => c.id === sp.company) ? sp.company : null;
  const type = sp.type && SLUG_RE.test(sp.type) && data.types.some((x) => x.slug === sp.type) ? sp.type : null;
  const depth = Number(sp.depth);
  const initial: ExplorerState = {
    company,
    type,
    view: sp.view === "cards" ? "cards" : "timeline",
    depth: depth === 1 || depth === 2 || depth === 3 ? depth : 3,
    other: sp.other !== "0",
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <Explorer data={data} initial={initial} />
    </div>
  );
}
