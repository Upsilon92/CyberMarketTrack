"use client";

// Market Explorer: pick an EDITOR and/or a SOLUTION TYPE (either, or both),
// then view the acquisition history as a swimlane TIMELINE (with acquisitions
// of acquisitions) or as nested CARDS. State lives in the URL (shareable).
import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { CalendarRange, LayoutGrid, RotateCcw, Layers, Building2, Tag } from "lucide-react";
import { Combobox } from "@/components/ui/combobox";
import { Badge } from "@/components/ui/badge";
import { Swimlane } from "@/components/explorer/swimlane";
import { TreeCards } from "@/components/explorer/tree-cards";
import { EntityChip } from "@/components/explorer/entity";
import { MarketStatsPanel } from "@/components/explorer/stats";
import { countryName } from "@/lib/countries";
import {
  acquisitionTree,
  buildIndex,
  countDescendants,
  editorsOfType,
  type ExplorerData,
  type TreeNode,
} from "@/lib/explorer-model";

export type ViewMode = "timeline" | "cards";

export interface ExplorerState {
  company: string | null;
  type: string | null;
  view: ViewMode;
  depth: number;
  other: boolean;
}

const MAX_EDITORS = 40;

export function Explorer({ data, initial }: { data: ExplorerData; initial: ExplorerState }) {
  const t = useTranslations("explorer");
  const tStatus = useTranslations("statuses");
  const locale = useLocale() as "fr" | "en";
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [s, setS] = useState<ExplorerState>(initial);

  const ix = useMemo(() => buildIndex(data), [data]);

  const update = (patch: Partial<ExplorerState>) => {
    const next = { ...s, ...patch };
    setS(next);
    const qs = new URLSearchParams();
    if (next.company) qs.set("company", next.company);
    if (next.type) qs.set("type", next.type);
    if (next.view !== "timeline") qs.set("view", next.view);
    if (next.depth !== 3) qs.set("depth", String(next.depth));
    if (!next.other) qs.set("other", "0");
    startTransition(() => { const q = qs.toString(); router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false }); });
  };

  const companyOptions = useMemo(
    () =>
      [...data.companies]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({ value: c.id, label: c.name, keywords: `${c.country ?? ""} ${countryName(c.country, locale)}` })),
    [data.companies, locale]
  );
  const typeOptions = useMemo(
    () => data.types.map((x) => ({ value: x.slug, label: x.label, keywords: `${x.slug} ${x.description ?? ""}` })),
    [data.types]
  );

  const company = s.company ? ix.company.get(s.company) ?? null : null;
  const type = s.type ? data.types.find((x) => x.slug === s.type) ?? null : null;

  // ---- Company view (optionally filtered by type) -----------------------------
  const companyTree = useMemo(
    () => (company ? acquisitionTree(ix, company.id, { maxDepth: s.depth, typeSlug: type?.slug ?? null }) : null),
    [ix, company, type, s.depth]
  );

  // ---- Type view: every editor of that type, with type-related acquisitions --
  const typeTrees = useMemo(() => {
    if (!type || company) return null;
    const editors = editorsOfType(ix, data, type.slug)
      .map((id) => acquisitionTree(ix, id, { maxDepth: s.depth, typeSlug: type.slug }))
      .sort((a, b) => countDescendants(b) - countDescendants(a) || a.name.localeCompare(b.name));
    return { all: editors.length, shown: editors.slice(0, MAX_EDITORS) };
  }, [ix, data, type, company, s.depth]);

  // ---- Landing shortcuts ------------------------------------------------------
  const topAcquirers = useMemo(
    () =>
      [...ix.boughtBy.entries()]
        .map(([id, evs]) => ({ id, n: evs.length }))
        .filter((x) => ix.company.has(x.id))
        .sort((a, b) => b.n - a.n)
        .slice(0, 16),
    [ix]
  );
  const topTypes = useMemo(() => {
    const count = new Map<string, number>();
    for (const sol of data.solutions) for (const ty of sol.types) count.set(ty, (count.get(ty) ?? 0) + 1);
    return data.types
      .map((x) => ({ ...x, n: count.get(x.slug) ?? 0 }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 18);
  }, [data]);

  const solutionsOfCompany = company ? (ix.solutionsOf.get(company.id) ?? []).filter((x) => !type || x.types.includes(type.slug)) : [];
  const typeLabel = (slug: string) => data.types.find((x) => x.slug === slug)?.label ?? slug;

  const seg = (active: boolean) =>
    `inline-flex items-center gap-1.5 px-3 h-8 text-sm transition-colors ${
      active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"
    }`;

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="xp-company" className="text-xs font-medium text-muted-foreground inline-flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> {t("editor")}
            </label>
            <Combobox
              id="xp-company"
              value={s.company ?? ""}
              onValueChange={(v) => update({ company: v || null })}
              options={companyOptions}
              placeholder={t("editorPlaceholder")}
              emptyText={t("noMatch")}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="xp-type" className="text-xs font-medium text-muted-foreground inline-flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5" /> {t("solutionType")}
            </label>
            <Combobox
              id="xp-type"
              value={s.type ?? ""}
              onValueChange={(v) => update({ type: v || null })}
              options={typeOptions}
              placeholder={t("typePlaceholder")}
              emptyText={t("noMatch")}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border overflow-hidden" role="group" aria-label={t("view")}>
            <button type="button" className={seg(s.view === "timeline")} onClick={() => update({ view: "timeline" })} aria-pressed={s.view === "timeline"}>
              <CalendarRange className="w-4 h-4" /> {t("viewTimeline")}
            </button>
            <button type="button" className={seg(s.view === "cards")} onClick={() => update({ view: "cards" })} aria-pressed={s.view === "cards"}>
              <LayoutGrid className="w-4 h-4" /> {t("viewCards")}
            </button>
          </div>
          <div className="inline-flex items-center gap-2 text-sm">
            <Layers className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">{t("depth")}</span>
            <div className="inline-flex rounded-lg border overflow-hidden">
              {[1, 2, 3].map((d) => (
                <button key={d} type="button" className={seg(s.depth === d)} onClick={() => update({ depth: d })} aria-pressed={s.depth === d}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          {s.view === "timeline" && (
            <label className="inline-flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={s.other} onChange={(e) => update({ other: e.target.checked })} />
              {t("showOther")}
            </label>
          )}
          {(s.company || s.type) && (
            <button
              type="button"
              onClick={() => update({ company: null, type: null })}
              className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="w-4 h-4" /> {t("reset")}
            </button>
          )}
        </div>
      </div>

      {/* ---------------- Landing ---------------- */}
      {!company && !type && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 animate-in fade-in duration-300 [&>*]:min-w-0">
          <section className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
            <h2 className="font-semibold">{t("topAcquirers")}</h2>
            <div className="flex flex-wrap gap-2">
              {topAcquirers.map(({ id, n }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => update({ company: id })}
                  className="inline-flex items-center gap-2 rounded-full border bg-background px-2.5 py-1 text-sm hover:border-primary/50 hover:bg-primary/5 transition-colors"
                >
                  <EntityChip company={ix.company.get(id)} size={18} link={false} />
                  <span className="text-xs rounded-full bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 px-1.5">{n}</span>
                </button>
              ))}
            </div>
          </section>
          <section className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
            <h2 className="font-semibold">{t("topTypes")}</h2>
            <div className="flex flex-wrap gap-2">
              {topTypes.map((x) => (
                <button
                  key={x.slug}
                  type="button"
                  onClick={() => update({ type: x.slug })}
                  title={x.description ?? undefined}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-sm hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-colors"
                >
                  {x.label}
                  <span className="text-xs text-muted-foreground">{x.n}</span>
                </button>
              ))}
            </div>
          </section>
          <p className="lg:col-span-2 text-sm text-muted-foreground">{t("landingHint")}</p>
          <MarketStatsPanel
            data={data}
            ix={ix}
            onPickCompany={(id) => update({ company: id })}
            onPickType={(slug) => update({ type: slug })}
          />
        </div>
      )}

      {/* ---------------- Company (± type) ---------------- */}
      {company && companyTree && (
        <div className="space-y-4">
          <section className="rounded-xl border bg-card p-4 shadow-sm flex flex-wrap items-center gap-x-6 gap-y-3 animate-in fade-in duration-300">
            <EntityChip company={company} size={44} className="text-lg" />
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {company.country && <span>{countryName(company.country, locale)}</span>}
              {company.founded && <span>· {t("founded", { year: company.founded })}</span>}
              <Badge variant="outline">{tStatus(company.status)}</Badge>
              {company.ownerId && ix.company.get(company.ownerId) && (
                <span className="inline-flex items-center gap-1.5">
                  · {t("ownedBy")} <EntityChip company={ix.company.get(company.ownerId)} size={18} />
                </span>
              )}
              {type && <Badge className="bg-emerald-600 hover:bg-emerald-600">{type.label}</Badge>}
            </div>
            <div className="ml-auto flex items-center gap-4 text-sm">
              <Stat n={companyTree.children.length} label={t("statDirect")} />
              <Stat n={countDescendants(companyTree)} label={t("statTotal")} />
              <Link href={`/companies/${company.id}`} className="text-primary hover:underline">{t("openProfile")}</Link>
            </div>
          </section>

          {s.view === "timeline" ? (
            companyTree.children.length || s.other ? (
              <Swimlane roots={[companyTree]} ix={ix} types={data.types} typeSlug={type?.slug ?? null} nowYear={data.nowYear} showOther={s.other} />
            ) : (
              <p className="text-sm text-muted-foreground">{t("noAcquisitions")}</p>
            )
          ) : (
            <TreeCards root={companyTree} ix={ix} types={data.types} typeSlug={type?.slug ?? null} />
          )}

          {solutionsOfCompany.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">{t("solutionsOf", { name: company.name })}</h3>
              <div className="flex flex-wrap gap-2">
                {solutionsOfCompany.map((sol) => (
                  <Link key={sol.id} href={`/solutions/${sol.id}`} className="rounded-lg border bg-card px-3 py-1.5 text-sm hover:border-primary/50 transition-colors">
                    <span className="font-medium">{sol.name}</span>
                    {sol.types.length > 0 && <span className="ml-2 text-xs text-muted-foreground">{sol.types.map(typeLabel).join(" · ")}</span>}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ---------------- Type only ---------------- */}
      {!company && type && typeTrees && (
        <div className="space-y-4">
          <section className="rounded-xl border bg-card p-4 shadow-sm animate-in fade-in duration-300">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-lg font-semibold">{type.label}</h2>
              <span className="text-sm text-muted-foreground">{t("editorsCount", { n: typeTrees.all })}</span>
            </div>
            {type.description && <p className="text-sm text-muted-foreground mt-1">{type.description}</p>}
            {typeTrees.all > MAX_EDITORS && <p className="text-xs text-muted-foreground mt-1">{t("truncated", { n: MAX_EDITORS })}</p>}
          </section>

          {typeTrees.shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noEditors")}</p>
          ) : s.view === "timeline" ? (
            <Swimlane roots={typeTrees.shown} ix={ix} types={data.types} typeSlug={type.slug} nowYear={data.nowYear} showOther={false} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {typeTrees.shown.map((tree) => {
                const ed = tree.companyId ? ix.company.get(tree.companyId) : null;
                const sols = tree.companyId ? (ix.solutionsOf.get(tree.companyId) ?? []).filter((x) => x.types.includes(type.slug)) : [];
                return (
                  <section key={tree.key} className="rounded-xl border bg-card p-4 shadow-sm space-y-3 card-hover">
                    <div className="flex items-center gap-3">
                      <EntityChip company={ed} name={tree.name} size={32} />
                      <button
                        type="button"
                        onClick={() => update({ company: tree.companyId })}
                        className="ml-auto text-xs text-primary hover:underline"
                      >
                        {t("focus")}
                      </button>
                    </div>
                    {sols.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {sols.map((sol) => (
                          <Link key={sol.id} href={`/solutions/${sol.id}`} className="rounded-md bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 text-xs hover:underline">
                            {sol.name}
                          </Link>
                        ))}
                      </div>
                    )}
                    <TreeCards root={tree} ix={ix} types={data.types} typeSlug={type.slug} />
                  </section>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <span className="text-center leading-tight">
      <span className="block text-xl font-semibold tabular-nums">{n}</span>
      <span className="block text-[11px] text-muted-foreground">{label}</span>
    </span>
  );
}
