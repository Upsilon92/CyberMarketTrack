// =============================================================================
// Explorer — market statistics (PURE, no Prisma): deals per year stacked by
// solution type, deal values, top acquirers, countries, outcomes, top deals.
// "Deal" = ACQUISITION or MERGER (buyer → target). Deal values are in millions
// of USD and only count when disclosed (amount > 0) — never estimated.
// =============================================================================
import type { ExplorerData, ExplorerIndex, XEvent } from "@/lib/explorer-model";
import { DOMAINS, domainOfTypes } from "@/lib/domains";

export type Granularity = "domain" | "type";

export const DEAL_EVENT_TYPES = new Set(["ACQUISITION", "MERGER"]);
/** Max named solution types in the stacked chart; the rest fold into "other". */
export const MAX_STACK_TYPES = 7;
export const OTHER = "__other";

export interface Deal {
  ev: XEvent;
  year: number;
  amount: number | null; // disclosed value (M$) or null
  acqId: string | null;
  tgtId: string | null;
  category: string; // stack category: a domain / type slug, or OTHER
  /** domain inferred from the description (no typed solution) */
  guessed: boolean;
}

export interface YearBucket {
  year: number;
  count: Record<string, number>;
  value: Record<string, number>;
  total: number;
  totalValue: number;
  guessed: number;
  disclosed: number;
}

export interface MarketStats {
  deals: Deal[];
  categories: string[]; // stack order (top types first, OTHER last if used)
  years: YearBucket[];
  firstYear: number;
  lastYear: number;
  disclosedCount: number;
  disclosedSum: number;
  medianValue: number | null;
  busiestYear: { year: number; n: number } | null;
  topAcquirersByValue: { id: string; value: number; count: number; disclosed: number }[];
  acquirerCountries: { code: string; n: number }[];
  targetCountries: { code: string; n: number }[];
  outcomes: { key: string; n: number }[];
  biggest: Deal[];
}

const inc = (o: Record<string, number>, k: string, v = 1) => {
  o[k] = (o[k] ?? 0) + v;
};

export function computeMarketStats(
  data: ExplorerData,
  ix: ExplorerIndex,
  opts: { fromYear?: number | null; granularity?: Granularity } = {}
): MarketStats {
  const byDomain = (opts.granularity ?? "domain") === "domain";
  const all = data.events.filter((e) => DEAL_EVENT_TYPES.has(e.type) && (e.acqId || e.acqRaw));

  // 1) Rank solution types by how many deals' targets carry them.
  const typeDeals = new Map<string, number>();
  for (const e of all) for (const t of (e.tgtId ? ix.typesOf.get(e.tgtId) : null) ?? []) typeDeals.set(t, (typeDeals.get(t) ?? 0) + 1);
  const ranked = [...typeDeals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
  const top = ranked.slice(0, MAX_STACK_TYPES);
  const rank = new Map(ranked.map((t, i) => [t, i]));

  // 2) Each deal gets ONE category: its best-ranked type if in the top list.
  const deals: Deal[] = all
    .filter((e) => opts.fromYear == null || e.year >= opts.fromYear)
    .map((e) => {
      const types = [...((e.tgtId ? ix.typesOf.get(e.tgtId) : null) ?? [])].sort((a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9));
      const best = types[0];
      let category: string = best && top.includes(best) ? best : OTHER;
      let guessed = false;
      if (byDomain) {
        const typed = domainOfTypes(types);
        const guess = !typed && e.tgtId ? ix.company.get(e.tgtId)?.domainGuess ?? null : null;
        category = typed ?? guess ?? OTHER;
        guessed = !typed && !!guess;
      }
      return {
        ev: e,
        year: e.year,
        amount: e.amount && e.amount > 0 ? e.amount : null,
        acqId: e.acqId,
        tgtId: e.tgtId,
        category,
        guessed,
      };
    });

  const used = new Set(deals.map((d) => d.category));
  const named = byDomain ? DOMAINS.filter((d) => used.has(d)) : top.filter((t) => used.has(t));
  const categories = [...named, ...(used.has(OTHER) ? [OTHER] : [])];

  // 3) Year buckets (continuous range, empty years included).
  const yearsWithDeals = deals.map((d) => d.year);
  const firstYear = yearsWithDeals.length ? Math.min(...yearsWithDeals) : data.nowYear;
  const lastYear = Math.max(data.nowYear, ...yearsWithDeals);
  const byYear = new Map<number, YearBucket>();
  for (let y = firstYear; y <= lastYear; y++) byYear.set(y, { year: y, count: {}, value: {}, total: 0, totalValue: 0, guessed: 0, disclosed: 0 });
  for (const d of deals) {
    const b = byYear.get(d.year)!;
    inc(b.count, d.category);
    b.total++;
    if (d.guessed) b.guessed++;
    if (d.amount) b.disclosed++;
    if (d.amount) {
      inc(b.value, d.category, d.amount);
      b.totalValue += d.amount;
    }
  }
  const years = [...byYear.values()];

  // 4) Values
  const values = deals.map((d) => d.amount).filter((v): v is number => v !== null).sort((a, b) => a - b);
  const median = values.length ? (values.length % 2 ? values[(values.length - 1) / 2] : (values[values.length / 2 - 1] + values[values.length / 2]) / 2) : null;
  const busiest = years.reduce<{ year: number; n: number } | null>((m, b) => (b.total > (m?.n ?? 0) ? { year: b.year, n: b.total } : m), null);

  // 5) Acquirers by disclosed value
  const acq = new Map<string, { value: number; count: number; disclosed: number }>();
  for (const d of deals) {
    if (!d.acqId) continue;
    const a = acq.get(d.acqId) ?? { value: 0, count: 0, disclosed: 0 };
    a.count++;
    if (d.amount) {
      a.value += d.amount;
      a.disclosed++;
    }
    acq.set(d.acqId, a);
  }
  const topAcquirersByValue = [...acq.entries()]
    .filter(([id, a]) => a.value > 0 && ix.company.has(id))
    .map(([id, a]) => ({ id, ...a }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // 6) Countries (acquirer / target), outcomes
  const aC: Record<string, number> = {}, tC: Record<string, number> = {}, out: Record<string, number> = {};
  for (const d of deals) {
    const ac = d.acqId ? ix.company.get(d.acqId)?.country : null;
    const tc = d.tgtId ? ix.company.get(d.tgtId)?.country : null;
    if (ac) inc(aC, ac);
    if (tc) inc(tC, tc);
    if (d.ev.type === "ACQUISITION") inc(out, d.ev.outcome ?? "UNKNOWN");
  }
  const sortCount = (o: Record<string, number>) =>
    Object.entries(o)
      .map(([code, n]) => ({ code, n }))
      .sort((a, b) => b.n - a.n || a.code.localeCompare(b.code));
  const OUT_ORDER = ["ABSORBED", "AUTONOMOUS", "INVESTOR_OWNED", "UNKNOWN"];

  return {
    deals,
    categories,
    years,
    firstYear,
    lastYear,
    disclosedCount: values.length,
    disclosedSum: values.reduce((s, v) => s + v, 0),
    medianValue: median,
    busiestYear: busiest,
    topAcquirersByValue,
    acquirerCountries: sortCount(aC).slice(0, 8),
    targetCountries: sortCount(tC).slice(0, 8),
    outcomes: OUT_ORDER.map((key) => ({ key, n: out[key] ?? 0 })).filter((o) => o.n > 0),
    biggest: deals.filter((d) => d.amount).sort((a, b) => b.amount! - a.amount!).slice(0, 10),
  };
}
