"use client";

// Swimlane timeline: one lane per company — the editor, the companies it bought,
// the companies THOSE bought (acquisitions of acquisitions)… — on one shared
// time axis. Vertical connectors link each acquired company to its buyer at
// the acquisition date. Hover/click a marker to inspect it (with its source).
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import { EntityChip, eventTone, useEventLabel, useFormatters } from "@/components/explorer/entity";
import { dateValue, GONE, type ExplorerIndex, type TreeNode, type XEvent } from "@/lib/explorer-model";

const ROW_H = 52;
const DEPTH_BAR = ["bg-primary/70", "bg-violet-500/60", "bg-fuchsia-500/55", "bg-amber-500/55"];
const DEPTH_RING = ["ring-primary/40", "ring-violet-500/40", "ring-fuchsia-500/40", "ring-amber-500/40"];

export interface Lane {
  node: TreeNode;
  parentRow: number | null;
  /** Section header lanes (type view: one block per editor) */
  groupStart?: boolean;
}

export function Swimlane({
  lanes,
  ix,
  nowYear,
  showOther,
}: {
  lanes: Lane[];
  ix: ExplorerIndex;
  nowYear: number;
  showOther: boolean;
}) {
  const t = useTranslations("explorer");
  const tOut = useTranslations("explorer.outcome");
  const { date, amount } = useFormatters();
  const label = useEventLabel();
  const [hover, setHover] = useState<XEvent | null>(null);
  const [pinned, setPinned] = useState<XEvent | null>(null);
  const shown = pinned ?? hover;

  const nameOf = (id: string | null, raw: string | null) => (id ? ix.company.get(id)?.name ?? "?" : raw ?? "?");

  // Time range: first displayed EVENT (not founding years, which can be 1911)
  // to the end of the current year.
  const { from, to, ticks } = useMemo(() => {
    let min = Infinity;
    for (const l of lanes) {
      const id = l.node.companyId;
      if (l.node.via) min = Math.min(min, dateValue(l.node.via));
      if (id) {
        for (const e of ix.boughtBy.get(id) ?? []) min = Math.min(min, dateValue(e));
        for (const e of ix.acquiredIn.get(id) ?? []) min = Math.min(min, dateValue(e));
        if (showOther) for (const e of ix.other.get(id) ?? []) min = Math.min(min, dateValue(e));
        const f = ix.company.get(id)?.founded;
        if (f && f >= (isFinite(min) ? min - 6 : 0)) min = Math.min(min, f);
      }
    }
    const start = isFinite(min) ? Math.floor(min) - 1 : nowYear - 10;
    const end = nowYear + 1;
    const span = end - start;
    const step = span > 40 ? 10 : span > 24 ? 5 : span > 12 ? 2 : 1;
    const ticks: number[] = [];
    for (let y = Math.ceil(start / step) * step; y <= end; y += step) ticks.push(y);
    return { from: start, to: end, ticks };
  }, [lanes, ix, nowYear, showOther]);

  const pct = (v: number) => `${Math.max(0, Math.min(100, ((v - from) / (to - from)) * 100))}%`;

  const marker = (e: XEvent, asBuyer: boolean, shape: "dot" | "diamond" | "square") => {
    const big = e.importance === "MAJOR";
    const size = big ? 16 : e.importance === "MEDIUM" ? 13 : 11;
    const active = shown?.id === e.id;
    return (
      <button
        key={e.id + (asBuyer ? "-b" : "-t")}
        type="button"
        aria-label={label(e, nameOf)}
        onMouseEnter={() => setHover(e)}
        onMouseLeave={() => setHover(null)}
        onFocus={() => setHover(e)}
        onClick={() => setPinned((p) => (p?.id === e.id ? null : e))}
        className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ${eventTone(e, asBuyer)} ring-2 ring-background shadow-sm transition-transform hover:scale-125 focus:outline-none focus-visible:ring-foreground ${
          shape === "dot" ? "rounded-full" : shape === "diamond" ? "rotate-45 rounded-[3px]" : "rounded-[3px]"
        } ${active ? "scale-125 ring-foreground" : ""}`}
        style={{ left: pct(dateValue(e)), width: size, height: size, zIndex: 3 }}
      />
    );
  };

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden animate-in fade-in duration-300">
      {/* Inspector: hovered or pinned event */}
      <div className="border-b px-4 py-3 min-h-[64px] bg-muted/30 text-sm">
        {shown ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 animate-in fade-in duration-150">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${eventTone(shown, false)}`} />
            <span className="font-semibold">{label(shown, nameOf)}</span>
            <span className="text-muted-foreground tabular-nums">{date(shown)}</span>
            {amount(shown.amount) && <span className="font-medium">{amount(shown.amount)}</span>}
            {shown.outcome && shown.outcome !== "UNKNOWN" && (
              <span className="text-xs rounded-full border px-2 py-0.5 text-muted-foreground">{tOut(shown.outcome)}</span>
            )}
            {shown.url && (
              <a href={shown.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-primary hover:underline">
                {t("source")} <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {pinned && (
              <button type="button" onClick={() => setPinned(null)} className="ml-auto text-xs text-muted-foreground hover:text-foreground">
                {t("unpin")}
              </button>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground">{t("inspectorHint")}</p>
        )}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[960px]">
          {/* Year axis */}
          <div className="flex sticky top-0 z-10 bg-card border-b">
            <div className="w-72 shrink-0 sticky left-0 bg-card z-20 px-4 py-2 text-xs text-muted-foreground border-r">
              {t("lanesHeader")}
            </div>
            <div className="relative flex-1 h-8">
              {ticks.map((y) => (
                <span key={y} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-[11px] text-muted-foreground tabular-nums" style={{ left: pct(y) }}>
                  {y}
                </span>
              ))}
            </div>
          </div>

          {lanes.map((lane, row) => {
            const n = lane.node;
            const c = n.companyId ? ix.company.get(n.companyId) ?? null : null;
            const depth = Math.min(n.depth, 3);
            const via = n.via;
            // Life bar: from founding (or first sighting) to the exit date.
            const own = n.companyId ? ix.acquiredIn.get(n.companyId) ?? [] : [];
            const absorbedAt =
              (via && (via.outcome === "ABSORBED" || via.type === "MERGER" || via.type === "ABSORPTION") ? via : null) ??
              (c && GONE.has(c.status) ? [...own].reverse().find((e) => e.outcome === "ABSORBED" || e.type === "MERGER") ?? null : null);
            const startV = c?.founded ?? (via ? dateValue(via) - 0.5 : from);
            const endV = absorbedAt ? dateValue(absorbedAt) : to;
            const joinV = via ? dateValue(via) : null;
            const buys = n.children.map((ch) => ch.via).filter((e): e is XEvent => !!e);
            const exits = own.filter((e) => e.id !== via?.id);
            const others = showOther && n.companyId ? ix.other.get(n.companyId) ?? [] : [];
            const gap = lane.parentRow !== null ? row - lane.parentRow : 0;

            return (
              <div key={n.key + row} className={`flex group ${lane.groupStart && row > 0 ? "border-t-2 border-border" : "border-t border-border/50"}`} style={{ height: ROW_H }}>
                <div
                  className={`w-72 shrink-0 sticky left-0 z-20 bg-card group-hover:bg-muted/40 border-r flex items-center pr-2 ${n.typeMatch ? "bg-emerald-500/5" : ""}`}
                  style={{ paddingLeft: 12 + depth * 16 }}
                >
                  {depth > 0 && <span className="text-muted-foreground/60 mr-1.5 text-xs">↳</span>}
                  <EntityChip company={c} name={n.name} size={22} className="text-sm" />
                </div>
                <div className="relative flex-1 group-hover:bg-muted/20">
                  {/* gridlines */}
                  {ticks.map((y) => (
                    <span key={y} className="absolute inset-y-0 w-px bg-border/40" style={{ left: pct(y) }} />
                  ))}
                  {/* connector to the buyer's lane */}
                  {joinV !== null && gap > 0 && (
                    <span
                      className="absolute w-0.5 bg-violet-400/60"
                      style={{ left: pct(joinV), top: -(gap * ROW_H) + ROW_H / 2, height: gap * ROW_H, zIndex: 1 }}
                    />
                  )}
                  {/* life bar */}
                  <span
                    className={`absolute top-1/2 -translate-y-1/2 h-2.5 rounded-full ${DEPTH_BAR[depth]} ring-1 ${DEPTH_RING[depth]}`}
                    style={{ left: pct(Math.max(startV, from)), width: `calc(${pct(Math.min(joinV ?? endV, endV))} - ${pct(Math.max(startV, from))})`, zIndex: 2 }}
                  />
                  {/* after joining a buyer without being absorbed: lighter, striped */}
                  {joinV !== null && endV > joinV && (
                    <span
                      className="absolute top-1/2 -translate-y-1/2 h-2.5 rounded-full opacity-40 bg-[repeating-linear-gradient(45deg,var(--color-violet-500)_0_4px,transparent_4px_8px)]"
                      style={{ left: pct(joinV), width: `calc(${pct(endV)} - ${pct(joinV)})`, zIndex: 2 }}
                    />
                  )}
                  {c?.founded && c.founded < from && (
                    <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground" style={{ zIndex: 3 }}>
                      ← {c.founded}
                    </span>
                  )}
                  {others.map((e) => marker(e, false, "square"))}
                  {exits.map((e) => marker(e, false, "diamond"))}
                  {via && marker(via, false, "diamond")}
                  {buys.map((e) => marker(e, true, "dot"))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="border-t px-4 py-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-fuchsia-500" />{t("legendBuys")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rotate-45 rounded-[2px] bg-violet-500" />{t("legendBought")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rotate-45 rounded-[2px] bg-amber-500" />{t("legendMerger")}</span>
        {showOther && <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[2px] bg-teal-500" />{t("legendFunding")}</span>}
        {showOther && <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[2px] bg-sky-500" />{t("legendIpo")}</span>}
        <span className="inline-flex items-center gap-1.5"><span className="w-5 h-1.5 rounded-full bg-primary/70" />{t("legendLife")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-5 h-1.5 rounded-full opacity-50 bg-[repeating-linear-gradient(45deg,var(--color-violet-500)_0_3px,transparent_3px_6px)]" />{t("legendSubsidiary")}</span>
        <span className="ml-auto">{t("legendSize")}</span>
      </div>
    </div>
  );
}
