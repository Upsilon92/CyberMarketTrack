"use client";

// Explorer "frise": one horizontal lane per company that made acquisitions
// (the editor, then the companies it bought that THEMSELVES bought others…).
// Every acquisition is drawn ON the frise: a dot on the buyer's lane with a
// label = logo + name + flag, deal value and solution type. A sub-lane ends
// with an arrow into its buyer's lane at the acquisition date. Alternating
// year bands, labels stacked in tiers (never overlapping). Hover/click a dot
// or a label to inspect the event (with its source).
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { Flag } from "@/components/flag";
import { EntityChip, useEventLabel, useFormatters } from "@/components/explorer/entity";
import { countryName } from "@/lib/countries";
import { formatDealValue } from "@/lib/money";
import { buildFriseLanes, friseRange, layoutLabels, type FriseItem, type FriseLane } from "@/lib/explorer-frise";
import type { ExplorerIndex, TreeNode, XEvent, XType } from "@/lib/explorer-model";

const LANE_COLORS = ["var(--viz-1)", "var(--viz-3)", "var(--viz-5)", "var(--viz-7)"];
const LABEL_H = 50;
const TIER_H = LABEL_H + 10;
const LINE_GAP = 14; // dot → first label tier
const HEADER_H = 30;
const LEFT_W = 196;
const END_PAD = 120; // room for the root's "→ Name" end marker

// Label width from the REAL rendered text width (canvas measureText with the
// page font), so names are not truncated and tiers are computed precisely.
let measureCtx: CanvasRenderingContext2D | null = null;
function textWidth(text: string, font: string) {
  if (typeof document === "undefined") return text.length * 7.5;
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * 7.5;
  const family = getComputedStyle(document.body).fontFamily || "sans-serif";
  measureCtx.font = `${font} ${family}`;
  return measureCtx.measureText(text).width;
}
function labelWidth(name: string, line2: string, sub: string, arrow: boolean) {
  // padding 12 + logo 30 + flag 18 + flex gaps 4px each + safety margin 10
  const nameW = 12 + (arrow ? 15 : 0) + 30 + 4 + textWidth(name, "600 13px") + 4 + 18 + 10;
  const l2W = 12 + textWidth(line2, "700 12px");
  const subW = 12 + textWidth(sub, "400 10.5px");
  return Math.ceil(Math.max(92, Math.min(260, Math.max(nameW, l2W, subW))));
}

export function Swimlane({
  roots,
  ix,
  types,
  typeSlug,
  nowYear,
  showOther,
}: {
  roots: TreeNode[];
  ix: ExplorerIndex;
  types: XType[];
  typeSlug: string | null;
  nowYear: number;
  showOther: boolean;
}) {
  const t = useTranslations("explorer");
  const tOut = useTranslations("explorer.outcome");
  const locale = (useLocale() === "en" ? "en" : "fr") as "fr" | "en";
  const { date } = useFormatters();
  const label = useEventLabel();
  const [hover, setHover] = useState<XEvent | null>(null);
  const [pinned, setPinned] = useState<XEvent | null>(null);
  const shown = pinned ?? hover;

  const wrapRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(0);
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => setAvail(Math.floor(e.contentRect.width)));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const nameOf = (id: string | null, raw: string | null) => (id ? ix.company.get(id)?.name ?? raw ?? "?" : raw ?? "?");
  const typeLabel = (slug: string) => types.find((x) => x.slug === slug)?.label ?? slug;
  /** Up to 2 solution-type labels of a company (the filtered type first). */
  const typesText = (companyId: string | null) => {
    if (!companyId) return "";
    const s = [...(ix.typesOf.get(companyId) ?? [])];
    s.sort((a, b) => (a === typeSlug ? -1 : b === typeSlug ? 1 : 0));
    return s.slice(0, 2).map(typeLabel).join(" · ");
  };
  const money = (m: number | null) => formatDealValue(m, locale);

  const lanes = useMemo(() => buildFriseLanes(roots, ix, { showOther }), [roots, ix, showOther]);
  const { from, to } = useMemo(() => friseRange(lanes, nowYear), [lanes, nowYear]);
  const years = to - from;
  const plotAvail = Math.max(0, avail - LEFT_W);
  const yearW = Math.max(68, Math.floor((plotAvail - END_PAD) / Math.max(1, years)));
  const plotW = years * yearW + END_PAD;
  const px = (v: number) => (Math.max(from, Math.min(to, v)) - from) * yearW;

  /** Text shown in an item's label (2nd line) */
  const subOf = (it: FriseItem) => {
    if (it.kind === "buy") return typesText(it.companyId);
    if (it.kind === "join") return it.ev.outcome && it.ev.outcome !== "UNKNOWN" ? tOut(it.ev.outcome) : t("joinedBy");
    if (it.kind === "exit") return it.ev.type === "MERGER" ? t("mergedWith") : it.ev.outcome === "INVESTOR_OWNED" ? tOut("INVESTOR_OWNED") : t("boughtBy");
    return "";
  };

  // Layout: label tiers per lane, then vertical positions.
  const geo = useMemo(() => {
    let y = HEADER_H;
    return lanes.map((lane) => {
      const labels = lane.items
        .filter((i) => i.labelled)
        .map((i) => ({
          key: i.key,
          x: px(i.t),
          w: labelWidth(i.name, `${i.ev.year}  ${money(i.ev.amount) ?? t("undisclosed")}`, subOf(i), i.kind !== "buy"),
        }));
      const lay = layoutLabels(labels, plotW);
      const widths = new Map(labels.map((l) => [l.key, l.w]));
      const top = y;
      const above = lay.tiersAbove * TIER_H;
      const below = lay.tiersBelow * TIER_H;
      const lineY = top + 12 + above + (above ? LINE_GAP : 14);
      const height = Math.max(64, lineY - top + (below ? LINE_GAP + below : 18) + 10);
      y += height;
      return { lane, lay, widths, top, lineY, height };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lanes, plotW, from, to, locale, typeSlug]);
  const totalH = (geo.at(-1)?.top ?? HEADER_H) + (geo.at(-1)?.height ?? 0) + 8;

  const yearList = Array.from({ length: years }, (_, i) => from + i);
  const step = yearW < 40 ? 5 : 1;

  const inspect = (e: XEvent) => ({
    onMouseEnter: () => setHover(e),
    onMouseLeave: () => setHover(null),
    onFocus: () => setHover(e),
    onBlur: () => setHover(null),
    onClick: () => setPinned((p) => (p?.id === e.id ? null : e)),
  });

  const laneColor = (l: FriseLane) => LANE_COLORS[Math.min(l.depth, 3)];

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden animate-in fade-in duration-300">
      {/* Inspector: hovered or pinned event */}
      <div className="border-b px-4 py-3 min-h-[60px] bg-muted/30 text-sm">
        {shown ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 animate-in fade-in duration-150">
            <span className="font-semibold">{label(shown, nameOf)}</span>
            <span className="text-muted-foreground tabular-nums">{date(shown)}</span>
            {money(shown.amount) && <span className="font-semibold tabular-nums">{money(shown.amount)}</span>}
            {shown.outcome && shown.outcome !== "UNKNOWN" && (
              <span className="text-xs rounded-full border px-2 py-0.5 text-muted-foreground">{tOut(shown.outcome)}</span>
            )}
            {shown.url && (
              <a href={shown.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-primary hover:underline">
                {t("source")} <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {shown.tgtId && (
              <Link href={`/companies/${shown.tgtId}`} className="text-primary hover:underline">
                {t("openProfileOf", { name: nameOf(shown.tgtId, null) })}
              </Link>
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

      <div ref={wrapRef} className="overflow-x-auto">
        {avail > 0 && (
          <div className="flex" style={{ width: LEFT_W + plotW, height: totalH }}>
            {/* Lane names (sticky while scrolling horizontally) */}
            <div className="sticky left-0 z-30 shrink-0 bg-card border-r relative" style={{ width: LEFT_W }}>
              <div style={{ height: HEADER_H }} className="border-b px-3 flex items-center text-[11px] text-muted-foreground">
                {t("lanesHeader")}
              </div>
              {geo.map(({ lane, lineY, height, top }) => {
                const c = lane.node.companyId ? ix.company.get(lane.node.companyId) ?? null : null;
                return (
                  <div
                    key={lane.key}
                    className={`absolute left-0 ${lane.blockStart && top > HEADER_H ? "border-t-2" : ""}`}
                    style={{ top, height, width: LEFT_W }}
                  >
                    <span className="absolute left-0 w-1 rounded-r" style={{ top: lineY - top - 14, height: 28, background: laneColor(lane) }} />
                    <div className="absolute min-w-0 right-2" style={{ top: lineY - top - (lane.joinT !== null ? 20 : 15), left: 10 + Math.min(lane.depth, 3) * 12 }}>
                      <EntityChip company={c} name={lane.node.name} size={lane.depth === 0 ? 26 : 20} className={lane.depth === 0 ? "text-[15px]" : "text-sm"} />
                      {lane.joinT !== null && lane.node.via && (
                        <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                          {t("laneJoined", { year: lane.node.via.year })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Plot */}
            <div className="relative shrink-0" style={{ width: plotW, height: totalH }}>
              <svg width={plotW} height={totalH} className="absolute inset-0" aria-hidden>
                <defs>
                  {LANE_COLORS.map((col, i) => (
                    <marker key={i} id={`fr-arrow-${i}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                      <path d="M0,0 L10,5 L0,10 z" fill={col} />
                    </marker>
                  ))}
                </defs>
                {/* alternating year bands + year labels */}
                {yearList.map((yv, i) => (
                  <g key={yv}>
                    {i % 2 === 0 && <rect x={px(yv)} y={0} width={yearW} height={totalH} fill="var(--viz-band)" />}
                    {(yv % step === 0 || step === 1) && (
                      <text x={px(yv) + yearW / 2} y={HEADER_H / 2} dy="0.35em" textAnchor="middle" className="fill-foreground text-[13px] font-semibold tabular-nums">
                        {yv}
                      </text>
                    )}
                  </g>
                ))}
                <line x1={0} x2={plotW} y1={HEADER_H} y2={HEADER_H} stroke="var(--viz-grid)" />
                {geo.map(({ lane, top }) =>
                  lane.blockStart && top > HEADER_H ? <line key={`sep-${lane.key}`} x1={0} x2={plotW} y1={top} y2={top} stroke="var(--border)" strokeWidth={2} /> : null
                )}

                {/* join connectors: sub-lane → buyer lane, arrow into the buyer */}
                {geo.map(({ lane, lineY }) => {
                  if (lane.parent === null || lane.joinT === null) return null;
                  const parentY = geo[lane.parent].lineY;
                  const x = px(lane.joinT);
                  return (
                    <line
                      key={`j-${lane.key}`}
                      x1={x}
                      y1={lineY}
                      x2={x}
                      y2={parentY + 7}
                      stroke={laneColor(lane)}
                      strokeWidth={2}
                      markerEnd={`url(#fr-arrow-${Math.min(lane.depth, 3)})`}
                    />
                  );
                })}

                {/* lane lines */}
                {geo.map(({ lane, lineY }) => {
                  const col = laneColor(lane);
                  const i = Math.min(lane.depth, 3);
                  if (lane.parent === null) {
                    return (
                      <line key={`l-${lane.key}`} x1={0} x2={plotW - END_PAD + 40} y1={lineY} y2={lineY} stroke={col} strokeWidth={3} markerEnd={`url(#fr-arrow-${i})`} />
                    );
                  }
                  const x0 = px(lane.startT), xj = px(lane.joinT ?? lane.endT), x1 = px(lane.endT);
                  return (
                    <g key={`l-${lane.key}`}>
                      <line x1={x0} x2={xj} y1={lineY} y2={lineY} stroke={col} strokeWidth={2.5} strokeLinecap="round" />
                      {x1 > xj + 1 && <line x1={xj} x2={x1} y1={lineY} y2={lineY} stroke={col} strokeWidth={2} strokeDasharray="5 4" opacity={0.7} />}
                    </g>
                  );
                })}

                {/* leader lines from dots to labels */}
                {geo.map(({ lane, lay, lineY }) =>
                  lane.items.map((it) => {
                    const p = lay.placements.get(it.key);
                    if (!p) return null;
                    const x = px(it.t);
                    const yEnd = p.side === "above" ? lineY - LINE_GAP - p.tier * TIER_H - 2 : lineY + LINE_GAP + p.tier * TIER_H + 2;
                    return <line key={`ld-${it.key}`} x1={x} x2={x} y1={lineY} y2={yEnd} stroke="currentColor" strokeOpacity={0.25} strokeWidth={1} />;
                  })
                )}
              </svg>

              {/* root end markers: "→ Name" */}
              {geo.map(({ lane, lineY }) =>
                lane.parent === null ? (
                  <div key={`end-${lane.key}`} className="absolute text-sm font-semibold whitespace-nowrap" style={{ left: plotW - END_PAD + 46, top: lineY - 10, color: laneColor(lane) }}>
                    {lane.node.name}
                  </div>
                ) : null
              )}

              {/* dots */}
              {geo.map(({ lane, lineY }) =>
                lane.items.map((it) => {
                  const x = px(it.t);
                  const active = shown?.id === it.ev.id;
                  const big = it.ev.importance === "MAJOR";
                  const size = it.kind === "other" ? 9 : big ? 15 : 12;
                  const shape = it.kind === "buy" ? "rounded-full" : it.kind === "other" ? "rounded-[2px]" : "rotate-45 rounded-[3px]";
                  const fill = it.kind === "buy" || it.kind === "join" ? laneColor(lane) : it.kind === "exit" ? "var(--viz-other)" : "var(--viz-4)";
                  return (
                    <button
                      key={`d-${it.key}`}
                      type="button"
                      aria-label={label(it.ev, nameOf)}
                      {...inspect(it.ev)}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 ${shape} transition-transform hover:scale-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground ${active ? "scale-125" : ""}`}
                      style={{ left: x, top: lineY, width: size, height: size, background: fill, boxShadow: "0 0 0 2px var(--card)", zIndex: 5 }}
                    />
                  );
                })
              )}

              {/* labels */}
              {geo.map(({ lane, lay, widths, lineY }) =>
                lane.items.map((it) => {
                  const p = lay.placements.get(it.key);
                  if (!p) return null;
                  const w = widths.get(it.key) ?? 120;
                  const c = it.companyId ? ix.company.get(it.companyId) ?? null : null;
                  const value = money(it.ev.amount);
                  const sub = subOf(it);
                  const top = p.side === "above" ? lineY - LINE_GAP - p.tier * TIER_H - LABEL_H : lineY + LINE_GAP + p.tier * TIER_H;
                  const active = shown?.id === it.ev.id;
                  return (
                    <button
                      key={`lb-${it.key}`}
                      type="button"
                      {...inspect(it.ev)}
                      className={`absolute text-left rounded-md px-1.5 py-1 leading-tight transition-colors bg-card/85 backdrop-blur-[1px] hover:bg-muted ${
                        active ? "ring-2 ring-primary/60" : ""
                      } ${it.kind === "buy" && typeSlug && it.companyId && ix.typesOf.get(it.companyId)?.has(typeSlug) ? "ring-1 ring-emerald-500/50" : ""}`}
                      style={{ left: p.left, top, width: w, height: LABEL_H, zIndex: 10 }}
                    >
                      <span className="flex items-center gap-1 min-w-0">
                        {it.kind !== "buy" && <span className="text-[10px] text-muted-foreground shrink-0">{it.kind === "join" ? "→" : "←"}</span>}
                        <CompanyLogo name={it.name} logoUrl={c?.logo ?? null} width={30} height={15} />
                        <span className="truncate text-[13px] font-semibold">{it.name}</span>
                        {c?.country && <Flag iso={c.country} size="1em" title={countryName(c.country, locale)} className="shrink-0" />}
                      </span>
                      <span className="flex items-baseline gap-1.5 mt-0.5 min-w-0">
                        <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">{it.ev.year}</span>
                        {value ? (
                          <span className="text-[12px] font-bold tabular-nums shrink-0">{value}</span>
                        ) : (
                          it.kind !== "other" && <span className="text-[10px] italic text-muted-foreground shrink-0">{t("undisclosed")}</span>
                        )}
                      </span>
                      {sub && <span className="block truncate text-[10.5px] text-muted-foreground">{sub}</span>}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="border-t px-4 py-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: LANE_COLORS[0] }} />{t("legendBuys")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-5 h-0.5" style={{ background: LANE_COLORS[1] }} />→ {t("legendSubLane")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rotate-45 rounded-[2px]" style={{ background: "var(--viz-other)" }} />{t("legendBought")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed" style={{ borderColor: LANE_COLORS[1] }} />{t("legendSubsidiary")}</span>
        {showOther && <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-[2px]" style={{ background: "var(--viz-4)" }} />{t("legendOther")}</span>}
        <span className="ml-auto">{t("legendDepthColors")}</span>
      </div>
    </div>
  );
}
