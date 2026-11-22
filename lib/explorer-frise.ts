// =============================================================================
// Explorer "frise" (timeline) — PURE lane building + label layout.
//
// One horizontal LANE per company that has its own acquisitions (the editor,
// then its acquired companies that themselves bought others…). Leaf
// acquisitions are labelled dots ON their buyer's lane. A sub-lane ends with
// an arrow into its buyer's lane at the acquisition date ("acquisitions of
// acquisitions"). Labels alternate above/below the line and are stacked in
// tiers so they never overlap.
// =============================================================================
import { dateValue, GONE, type ExplorerIndex, type TreeNode, type XEvent } from "@/lib/explorer-model";

export type ItemKind = "buy" | "exit" | "join" | "other";

export interface FriseItem {
  key: string;
  kind: ItemKind;
  ev: XEvent;
  /** date value (fractional year) */
  t: number;
  /** company shown in the label (target for "buy", buyer for "exit"/"join") */
  companyId: string | null;
  name: string;
  /** labelled items get a tiered label; "other" events are bare markers */
  labelled: boolean;
}

export interface FriseLane {
  key: string;
  node: TreeNode;
  depth: number;
  /** index of the buyer lane (null for a root) */
  parent: number | null;
  /** date the lane joins its buyer (acquisition), null for roots */
  joinT: number | null;
  startT: number;
  endT: number;
  /** true when the company disappeared into its buyer at joinT */
  absorbed: boolean;
  /** first lane of a root block (type view: one block per editor) */
  blockStart: boolean;
  items: FriseItem[];
}

const isLane = (n: TreeNode) => n.depth === 0 || n.children.length > 0;

export function buildFriseLanes(roots: TreeNode[], ix: ExplorerIndex, opts: { showOther: boolean }): FriseLane[] {
  const lanes: FriseLane[] = [];
  const nameOf = (id: string | null, raw: string | null) => (id ? ix.company.get(id)?.name ?? raw ?? "?" : raw ?? "?");

  const visit = (n: TreeNode, parent: number | null, blockStart: boolean) => {
    const idx = lanes.length;
    const c = n.companyId ? ix.company.get(n.companyId) ?? null : null;
    const via = n.via;
    const items: FriseItem[] = [];

    // Leaf acquisitions → labelled dots on this lane
    for (const ch of n.children) {
      if (!ch.via || isLane(ch)) continue;
      items.push({ key: `b-${ch.via.id}`, kind: "buy", ev: ch.via, t: dateValue(ch.via), companyId: ch.companyId, name: ch.name, labelled: true });
    }
    // This company being bought by someone else (other than the tree link):
    // e.g. a private-equity take-private of the editor itself.
    for (const e of (n.companyId ? ix.acquiredIn.get(n.companyId) : null) ?? []) {
      if (e.id === via?.id) continue;
      items.push({ key: `x-${e.id}`, kind: "exit", ev: e, t: dateValue(e), companyId: e.acqId, name: nameOf(e.acqId, e.acqRaw), labelled: true });
    }
    // The acquisition that attaches this sub-lane to its buyer
    if (via && parent !== null) {
      items.push({ key: `j-${via.id}`, kind: "join", ev: via, t: dateValue(via), companyId: via.acqId, name: nameOf(via.acqId, via.acqRaw), labelled: true });
    }
    if (opts.showOther && n.companyId) {
      for (const e of ix.other.get(n.companyId) ?? []) items.push({ key: `o-${e.id}`, kind: "other", ev: e, t: dateValue(e), companyId: n.companyId, name: n.name, labelled: false });
    }
    items.sort((a, b) => a.t - b.t);

    const joinT = via && parent !== null ? dateValue(via) : null;
    const absorbed = !!via && (via.outcome === "ABSORBED" || via.type === "MERGER" || via.type === "ABSORPTION" || (!!c && GONE.has(c.status)));
    const ts = items.map((i) => i.t);
    const first = ts.length ? Math.min(...ts) : joinT ?? 0;
    const founded = c?.founded ?? null;
    // Sub-lanes start a bit before their first visible event (or at founding when close).
    const startT = parent === null ? -Infinity : founded && founded > first - 4 ? Math.min(founded, first - 0.4) : first - 0.6;
    const last = ts.length ? Math.max(...ts) : joinT ?? 0;
    const endT = parent === null ? Infinity : absorbed ? Math.max(joinT ?? last, last) : Math.max(joinT ?? last, last) + 0.35;

    lanes.push({ key: `${n.key}-${idx}`, node: n, depth: n.depth, parent, joinT, startT, endT, absorbed, blockStart, items });
    for (const ch of n.children) if (isLane(ch)) visit(ch, idx, false);
  };
  roots.forEach((r) => visit(r, null, true));
  return lanes;
}

/** Overall time range of the frise: first event year → end of the current year. */
export function friseRange(lanes: FriseLane[], nowYear: number): { from: number; to: number } {
  let min = Infinity;
  for (const l of lanes) {
    for (const i of l.items) min = Math.min(min, i.t);
    if (l.joinT !== null) min = Math.min(min, l.joinT);
    if (Number.isFinite(l.startT)) min = Math.min(min, l.startT);
  }
  const from = Number.isFinite(min) ? Math.floor(min) : nowYear - 5;
  return { from: Math.min(from, nowYear - 1), to: nowYear + 1 };
}

// --- Label layout ---------------------------------------------------------------

export interface Placement {
  key: string;
  side: "above" | "below";
  tier: number;
  left: number; // px, label box left edge
}

export interface LaneLayout {
  placements: Map<string, Placement>;
  tiersAbove: number;
  tiersBelow: number;
}

/**
 * Greedy tier assignment: labels sorted by x alternate above/below the lane;
 * each goes to the lowest tier (on the preferred side first) whose previous
 * label ends before this one starts. Never overlaps, no clipping at the edges.
 */
export function layoutLabels(
  labels: { key: string; x: number; w: number }[],
  plotW: number,
  gap = 10
): LaneLayout {
  const ends = { above: [] as number[], below: [] as number[] };
  const placements = new Map<string, Placement>();
  const sorted = [...labels].sort((a, b) => a.x - b.x);
  sorted.forEach((l, i) => {
    const left = Math.max(0, Math.min(l.x - 12, plotW - l.w));
    const pref: ("above" | "below")[] = i % 2 === 0 ? ["above", "below"] : ["below", "above"];
    let best: { side: "above" | "below"; tier: number } | null = null;
    for (const side of pref) {
      const tiers = ends[side];
      let tier = tiers.findIndex((end) => end + gap <= left);
      if (tier === -1) tier = tiers.length;
      if (!best || tier < best.tier) best = { side, tier };
    }
    const { side, tier } = best!;
    ends[side][tier] = left + l.w;
    placements.set(l.key, { key: l.key, side, tier, left });
  });
  return { placements, tiersAbove: ends.above.length, tiersBelow: ends.below.length };
}
