"use client";

// Explorer landing — market statistics: KPI tiles, deals per year stacked by
// solution type (count or disclosed value), top acquirers by disclosed value,
// acquirer/target countries, deal outcomes and the biggest deals.
// Hand-built SVG/HTML (no chart lib): thin marks, 2px surface gaps, hairline
// grid, legend + hover tooltip + table view (identity never by color alone).
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Table2, BarChart3 } from "lucide-react";
import { EntityChip } from "@/components/explorer/entity";
import { Flag } from "@/components/flag";
import { countryName } from "@/lib/countries";
import { formatDealValue } from "@/lib/money";
import { computeMarketStats, OTHER, type Granularity, type MarketStats } from "@/lib/explorer-stats";
import type { ExplorerData, ExplorerIndex } from "@/lib/explorer-model";

const SERIES = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)", "var(--viz-5)", "var(--viz-6)", "var(--viz-7)", "var(--viz-8)"];
const colorOf = (cats: string[], c: string) => (c === OTHER ? "var(--viz-other)" : SERIES[cats.indexOf(c)] ?? "var(--viz-other)");

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

export function MarketStatsPanel({
  data,
  ix,
  onPickCompany,
  onPickType,
}: {
  data: ExplorerData;
  ix: ExplorerIndex;
  onPickCompany: (id: string) => void;
  onPickType: (slug: string) => void;
}) {
  const t = useTranslations("explorer.stats");
  const locale = (useLocale() === "en" ? "en" : "fr") as "fr" | "en";
  const tDom = useTranslations("explorer.domains");
  const [range, setRange] = useState<"recent" | "all">("recent");
  const [granularity, setGranularity] = useState<Granularity>("domain");
  const fromYear = range === "recent" ? data.nowYear - 14 : null;
  const stats = useMemo(() => computeMarketStats(data, ix, { fromYear, granularity }), [data, ix, fromYear, granularity]);
  const money = (m: number | null) => formatDealValue(m, locale) ?? "—";
  const typeLabel = (c: string) =>
    c === OTHER
      ? t("other")
      : granularity === "domain"
        ? tDom(c as Parameters<typeof tDom>[0])
        : data.types.find((x) => x.slug === c)?.label ?? c;

  const seg = (active: boolean) =>
    `px-2.5 h-7 text-xs transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`;

  return (
    <div className="space-y-5 lg:col-span-2 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <div className="inline-flex rounded-lg border overflow-hidden" role="group" aria-label={t("period")}>
          <button type="button" className={seg(range === "recent")} aria-pressed={range === "recent"} onClick={() => setRange("recent")}>
            {t("recent", { n: 15 })}
          </button>
          <button type="button" className={seg(range === "all")} aria-pressed={range === "all"} onClick={() => setRange("all")}>
            {t("allYears")}
          </button>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label={t("kpiDeals")} value={stats.deals.length.toLocaleString(locale)} sub={t("kpiSince", { year: stats.firstYear })} />
        <Tile label={t("kpiValue")} value={money(stats.disclosedSum)} sub={t("kpiDisclosedOnly")} />
        <Tile label={t("kpiMedian")} value={money(stats.medianValue)} sub={t("kpiDisclosedN", { n: stats.disclosedCount })} />
        <Tile
          label={t("kpiDisclosedShare")}
          value={stats.deals.length ? `${Math.round((stats.disclosedCount / stats.deals.length) * 100)} %` : "—"}
          sub={t("kpiDisclosedHint")}
        />
        <Tile label={t("kpiBusiest")} value={stats.busiestYear ? String(stats.busiestYear.year) : "—"} sub={stats.busiestYear ? t("kpiDealsN", { n: stats.busiestYear.n }) : ""} />
      </div>

      <StackedYears
        stats={stats}
        typeLabel={typeLabel}
        money={money}
        onPickType={onPickType}
        granularity={granularity}
        setGranularity={setGranularity}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <Panel title={t("topByValue")} hint={t("topByValueHint")}>
          <BarList
            items={stats.topAcquirersByValue.map((a) => ({
              key: a.id,
              label: <EntityChip company={ix.company.get(a.id)} size={18} link={false} className="text-sm" />,
              value: a.value,
              valueLabel: money(a.value),
              extra: t("dealsDisclosed", { n: a.disclosed, total: a.count }),
              onClick: () => onPickCompany(a.id),
            }))}
          />
        </Panel>
        <Panel title={t("biggest")} hint={t("biggestHint")}>
          <ol className="divide-y text-sm">
            {stats.biggest.map((d, i) => {
              const acq = d.acqId ? ix.company.get(d.acqId) : null;
              const tgt = d.tgtId ? ix.company.get(d.tgtId) : null;
              return (
                <li key={d.ev.id} className="flex items-center gap-2 py-1.5">
                  <span className="w-5 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <EntityChip company={acq} name={d.ev.acqRaw ?? "?"} size={16} />
                    <span className="text-muted-foreground">→</span>
                    <EntityChip company={tgt} name={d.ev.tgtRaw ?? "?"} size={16} />
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">{d.year}</span>
                  <span className="w-20 text-right font-semibold tabular-nums">{money(d.amount)}</span>
                </li>
              );
            })}
          </ol>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        <Panel title={t("acquirerCountries")}>
          <BarList
            items={stats.acquirerCountries.map((c) => ({
              key: c.code,
              label: <CountryLabel code={c.code} locale={locale} />,
              value: c.n,
              valueLabel: c.n.toLocaleString(locale),
            }))}
          />
        </Panel>
        <Panel title={t("targetCountries")}>
          <BarList
            items={stats.targetCountries.map((c) => ({
              key: c.code,
              label: <CountryLabel code={c.code} locale={locale} />,
              value: c.n,
              valueLabel: c.n.toLocaleString(locale),
            }))}
          />
        </Panel>
        <Panel title={t("outcomes")} hint={t("outcomesHint")}>
          <OutcomeBar outcomes={stats.outcomes} />
        </Panel>
      </div>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums leading-none">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
      <div>
        <h3 className="font-semibold">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function CountryLabel({ code, locale }: { code: string; locale: "fr" | "en" }) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <Flag iso={code} size="1.1em" />
      <span className="truncate">{countryName(code, locale)}</span>
    </span>
  );
}

/** Horizontal bars, one series: label · bar (≤ 14px thick) · value at the tip. */
function BarList({
  items,
}: {
  items: { key: string; label: React.ReactNode; value: number; valueLabel: string; extra?: string; onClick?: () => void }[];
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-1.5">
      {items.map((it) => {
        const inner = (
          <>
            <span className="w-28 sm:w-40 shrink-0 min-w-0 text-left text-sm">{it.label}</span>
            <span className="relative flex-1 h-3.5">
              <span
                className="absolute inset-y-0 left-0 rounded-r-[4px] bg-[var(--viz-1)] transition-[width] duration-500"
                style={{ width: `${Math.max(1.5, (it.value / max) * 100)}%` }}
              />
            </span>
            <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums">
              {it.valueLabel}
              {it.extra && <span className="block text-[10px] font-normal text-muted-foreground">{it.extra}</span>}
            </span>
          </>
        );
        return (
          <li key={it.key}>
            {it.onClick ? (
              <button type="button" onClick={it.onClick} className="w-full flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-muted/60 transition-colors">
                {inner}
              </button>
            ) : (
              <div className="flex items-center gap-2 px-1 py-0.5">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function OutcomeBar({ outcomes }: { outcomes: MarketStats["outcomes"] }) {
  const t = useTranslations("explorer.outcome");
  const total = outcomes.reduce((s, o) => s + o.n, 0) || 1;
  const colors = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-other)"];
  const colorFor = (k: string) => colors[["ABSORBED", "AUTONOMOUS", "INVESTOR_OWNED", "UNKNOWN"].indexOf(k)] ?? "var(--viz-other)";
  return (
    <div className="space-y-3">
      <div className="flex h-4 w-full gap-[2px]" role="img" aria-label={outcomes.map((o) => `${t(o.key)} ${o.n}`).join(", ")}>
        {outcomes.map((o, i) => (
          <span
            key={o.key}
            title={`${t(o.key)} : ${o.n}`}
            className={`h-full ${i === 0 ? "rounded-l-[4px]" : ""} ${i === outcomes.length - 1 ? "rounded-r-[4px]" : ""}`}
            style={{ width: `${(o.n / total) * 100}%`, background: colorFor(o.key) }}
          />
        ))}
      </div>
      <ul className="space-y-1 text-sm">
        {outcomes.map((o) => (
          <li key={o.key} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colorFor(o.key) }} />
            <span className="flex-1 first-letter:uppercase">{t(o.key)}</span>
            <span className="tabular-nums font-medium">{o.n}</span>
            <span className="w-10 text-right tabular-nums text-xs text-muted-foreground">{Math.round((o.n / total) * 100)} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Deals per year, stacked by solution type of the TARGET (count or value). */
function StackedYears({
  stats,
  typeLabel,
  money,
  onPickType,
  granularity,
  setGranularity,
}: {
  stats: MarketStats;
  typeLabel: (c: string) => string;
  money: (m: number | null) => string;
  onPickType: (slug: string) => void;
  granularity: Granularity;
  setGranularity: (g: Granularity) => void;
}) {
  const t = useTranslations("explorer.stats");
  const locale = useLocale();
  const [metric, setMetric] = useState<"count" | "value">("count");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const [wrapRef, width] = useWidth<HTMLDivElement>();

  const cats = stats.categories;
  const shown = cats.filter((c) => !hidden.has(c));
  const val = (b: MarketStats["years"][number], c: string) => (metric === "count" ? b.count[c] ?? 0 : b.value[c] ?? 0);
  const colTotal = (b: MarketStats["years"][number]) => shown.reduce((s, c) => s + val(b, c), 0);
  const max = niceMax(Math.max(0, ...stats.years.map(colTotal)));
  const fmt = (v: number) => (metric === "count" ? v.toLocaleString(locale) : money(v));
  const axisFmt = (v: number) =>
    metric === "count" ? v.toLocaleString(locale) : v >= 1000 ? `${(v / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })}${locale === "fr" ? " Md$" : "B"}` : `${v}${locale === "fr" ? " M$" : "M"}`;

  // Geometry
  const H = 300, padL = 52, padR = 8, padT = 22, padB = 28;
  const W = Math.max(260, width);
  const n = stats.years.length;
  const slot = (W - padL - padR) / Math.max(1, n);
  const barW = Math.min(24, Math.max(6, slot * 0.62));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const labelEvery = slot < 26 ? 5 : slot < 40 ? 2 : 1;
  const hb = hover !== null ? stats.years[hover] : null;

  const toggle = (c: string) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(c)) next.delete(c);
      else if (shown.length > 1) next.add(c);
      return next;
    });

  const seg = (active: boolean) =>
    `inline-flex items-center gap-1 px-2.5 h-7 text-xs transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`;

  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{metric === "count" ? t("perYearCount") : t("perYearValue")}</h3>
          <p className="text-xs text-muted-foreground max-w-2xl">
            {metric === "count" ? t("perYearCountHint") : t("perYearValueHint")}{" "}
            {granularity === "domain" ? t("domainHint") : t("typeHint")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border overflow-hidden" role="group" aria-label={t("granularity")}>
            <button type="button" className={seg(granularity === "domain")} aria-pressed={granularity === "domain"} onClick={() => { setHidden(new Set()); setGranularity("domain"); }}>
              {t("byDomain")}
            </button>
            <button type="button" className={seg(granularity === "type")} aria-pressed={granularity === "type"} onClick={() => { setHidden(new Set()); setGranularity("type"); }}>
              {t("byType")}
            </button>
          </div>
          <div className="inline-flex rounded-lg border overflow-hidden" role="group" aria-label={t("metric")}>
            <button type="button" className={seg(metric === "count")} aria-pressed={metric === "count"} onClick={() => setMetric("count")}>
              {t("metricCount")}
            </button>
            <button type="button" className={seg(metric === "value")} aria-pressed={metric === "value"} onClick={() => setMetric("value")}>
              {t("metricValue")}
            </button>
          </div>
          <button type="button" className={`${seg(table)} rounded-lg border`} aria-pressed={table} onClick={() => setTable((v) => !v)}>
            {table ? <BarChart3 className="w-3.5 h-3.5" /> : <Table2 className="w-3.5 h-3.5" />}
            {table ? t("showChart") : t("showTable")}
          </button>
        </div>
      </div>

      {/* Legend (click = show / hide a type) */}
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {cats.map((c) => {
          const off = hidden.has(c);
          return (
            <span key={c} className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => toggle(c)}
                aria-pressed={!off}
                className={`inline-flex items-center gap-1.5 rounded px-1 text-xs transition-opacity ${off ? "opacity-40 line-through" : ""}`}
                title={t("legendToggle")}
              >
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: colorOf(cats, c) }} />
                {typeLabel(c)}
              </button>
              {c !== OTHER && granularity === "type" && (
                <button type="button" onClick={() => onPickType(c)} className="text-[10px] text-primary hover:underline" title={t("openType")}>
                  ↗
                </button>
              )}
            </span>
          );
        })}
      </div>

      {table ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-1 pr-2 font-medium">{t("year")}</th>
                {cats.map((c) => (
                  <th key={c} className="text-right py-1 px-2 font-medium whitespace-nowrap">{typeLabel(c)}</th>
                ))}
                <th className="text-right py-1 pl-2 font-semibold">{t("total")}</th>
              </tr>
            </thead>
            <tbody>
              {stats.years.map((b) => (
                <tr key={b.year} className="border-b border-border/50">
                  <td className="py-1 pr-2">{b.year}</td>
                  {cats.map((c) => (
                    <td key={c} className="text-right py-1 px-2">{val(b, c) ? fmt(val(b, c)) : "·"}</td>
                  ))}
                  <td className="text-right py-1 pl-2 font-semibold">{fmt(metric === "count" ? b.total : b.totalValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrapRef} className="relative overflow-hidden" onMouseLeave={() => setHover(null)}>
          {width > 0 && (
            <svg width={W} height={H} role="img" aria-label={metric === "count" ? t("perYearCount") : t("perYearValue")} className="block">
              {ticks.map((v) => (
                <g key={v}>
                  <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--viz-grid)" strokeWidth={1} />
                  <text x={padL - 6} y={y(v)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
                    {axisFmt(v)}
                  </text>
                </g>
              ))}
              {stats.years.map((b, i) => {
                const cx = padL + slot * i + slot / 2;
                let acc = 0;
                const tot = colTotal(b);
                const visible = shown.filter((c) => val(b, c) > 0);
                return (
                  <g key={b.year}>
                    {hover === i && <rect x={cx - slot / 2} y={padT} width={slot} height={H - padT - padB} fill="var(--viz-band)" />}
                    {visible.map((c, k) => {
                      const v = val(b, c);
                      const y0 = y(acc), y1 = y(acc + v);
                      acc += v;
                      const top = k === visible.length - 1;
                      const h = Math.max(0, y0 - y1 - (top ? 0 : 2)); // 2px surface gap between segments
                      if (h <= 0) return null;
                      const r = top ? Math.min(4, h) : 0;
                      const x = cx - barW / 2;
                      const yy = y1 + (top ? 0 : 2);
                      return (
                        <path
                          key={c}
                          d={`M${x},${yy + h} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + barW - r} Q${x + barW},${yy} ${x + barW},${yy + r} V${yy + h} Z`}
                          fill={colorOf(cats, c)}
                          opacity={hover === null || hover === i ? 1 : 0.55}
                        />
                      );
                    })}
                    {tot > 0 && (slot >= 30 || hover === i) && (
                      <text x={cx} y={y(tot) - 5} textAnchor="middle" className="fill-foreground text-[10px] font-medium tabular-nums">
                        {metric === "count" ? tot : axisFmt(tot)}
                      </text>
                    )}
                    {(i % labelEvery === 0 || i === n - 1) && (
                      <text x={cx} y={H - padB + 16} textAnchor="middle" className="fill-muted-foreground text-[10px] tabular-nums">
                        {b.year}
                      </text>
                    )}
                    {/* hit target: the whole column slot */}
                    <rect
                      x={cx - slot / 2}
                      y={padT}
                      width={slot}
                      height={H - padT - padB}
                      fill="transparent"
                      onMouseEnter={() => setHover(i)}
                      onFocus={() => setHover(i)}
                      tabIndex={0}
                      aria-label={`${b.year} : ${fmt(tot)}`}
                    />
                  </g>
                );
              })}
              <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity={0.35} strokeWidth={1} />
            </svg>
          )}
          {hb && hover !== null && (
            <div
              className="pointer-events-none absolute z-10 min-w-44 rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg"
              style={{
                left: Math.min(W - 190, Math.max(0, padL + slot * hover + slot / 2 + 12)),
                top: 8,
              }}
            >
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="font-semibold">{hb.year}</span>
                <span className="font-semibold tabular-nums">{fmt(colTotal(hb))}</span>
              </div>
              {[...shown].reverse().filter((c) => val(hb, c) > 0).map((c) => (
                <div key={c} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm" style={{ background: colorOf(cats, c) }} />
                  <span className="flex-1 truncate">{typeLabel(c)}</span>
                  <span className="tabular-nums">{fmt(val(hb, c))}</span>
                </div>
              ))}
              {granularity === "domain" && hb.guessed > 0 && (
                <div className="mt-1 text-[10px] text-muted-foreground">{t("guessedOf", { n: hb.guessed })}</div>
              )}
              {metric === "value" && hb.total > 0 && (
                <div className="mt-1 text-[10px] text-muted-foreground">{t("disclosedOf", { n: hb.disclosed, total: hb.total })}</div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
