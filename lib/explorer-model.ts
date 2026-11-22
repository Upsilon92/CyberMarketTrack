// =============================================================================
// Explorer — compact, serializable market model + PURE tree logic (no Prisma),
// shared by the server builder (lib/explorer.ts) and the client visualization.
// =============================================================================

export interface XCompany {
  id: string;
  name: string; // derived current name
  country: string | null;
  logo: string | null; // external URL, or /api/logos/{id} for uploaded logos
  founded: number | null;
  status: string; // derived status (INDEPENDENT, SUBSIDIARY, ABSORBED, …)
  ownerId: string | null; // current owner (derived)
  /** market domain inferred from the description (used only when the company has no typed solution) */
  domainGuess: string | null;
}

export interface XEvent {
  id: string;
  type: string;
  year: number;
  month: number | null;
  /** M&A: the buyer (company id) / raw name; other events: null */
  acqId: string | null;
  acqRaw: string | null;
  /** M&A: the bought company (id) / raw name; other events: the subject */
  tgtId: string | null;
  tgtRaw: string | null;
  amount: number | null;
  outcome: string | null;
  importance: string;
  newName: string | null;
  round: string | null;
  url: string | null;
}

export interface XSolution {
  id: string;
  name: string;
  vendorId: string; // current vendor (derived)
  originId: string; // original vendor
  types: string[]; // SOLUTION_TYPE tag slugs
}

export interface XType {
  slug: string;
  label: string;
  description: string | null;
}

export interface ExplorerData {
  companies: XCompany[];
  events: XEvent[];
  solutions: XSolution[];
  types: XType[];
  nowYear: number;
}

/** Event types that move a company INTO another one (buyer → target). */
export const MA_TYPES = new Set(["ACQUISITION", "CO_INVESTMENT", "ABSORPTION", "MERGER"]);
export const GONE = new Set(["ABSORBED", "MERGED", "DEFUNCT"]);

export const dateValue = (e: { year: number; month: number | null }) => e.year + ((e.month ?? 1) - 1) / 12;

// --- Indexes -----------------------------------------------------------------

export interface ExplorerIndex {
  company: Map<string, XCompany>;
  /** buyer id -> M&A events it made (sorted by date) */
  boughtBy: Map<string, XEvent[]>;
  /** target id -> M&A events where it was bought */
  acquiredIn: Map<string, XEvent[]>;
  /** subject id -> non-M&A events (funding, IPO, rename…) */
  other: Map<string, XEvent[]>;
  /** company id -> solution type slugs it develops/owns (origin or vendor) */
  typesOf: Map<string, Set<string>>;
  solutionsOf: Map<string, XSolution[]>;
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
}

export function buildIndex(d: ExplorerData): ExplorerIndex {
  const company = new Map(d.companies.map((c) => [c.id, c]));
  const boughtBy = new Map<string, XEvent[]>();
  const acquiredIn = new Map<string, XEvent[]>();
  const other = new Map<string, XEvent[]>();
  for (const e of d.events) {
    if (MA_TYPES.has(e.type)) {
      if (e.acqId) push(boughtBy, e.acqId, e);
      if (e.tgtId) push(acquiredIn, e.tgtId, e);
    } else if (e.tgtId) push(other, e.tgtId, e);
  }
  for (const list of [...boughtBy.values(), ...acquiredIn.values(), ...other.values()])
    list.sort((a, b) => dateValue(a) - dateValue(b));
  const typesOf = new Map<string, Set<string>>();
  const solutionsOf = new Map<string, XSolution[]>();
  for (const s of d.solutions) {
    for (const cid of new Set([s.originId, s.vendorId])) {
      const set = typesOf.get(cid) ?? new Set<string>();
      s.types.forEach((t) => set.add(t));
      typesOf.set(cid, set);
    }
    push(solutionsOf, s.vendorId, s);
  }
  return { company, boughtBy, acquiredIn, other, typesOf, solutionsOf };
}

// --- Acquisition tree (with "acquisitions of acquisitions") -------------------

export interface TreeNode {
  key: string;
  companyId: string | null; // null when the target is only known by name
  name: string;
  depth: number;
  /** The M&A event that attached this node to its parent (null for the root) */
  via: XEvent | null;
  children: TreeNode[];
  /** Does this node (or its own solutions) match the type filter? */
  typeMatch: boolean;
}

/**
 * Build the acquisition tree of `rootId`: every company it bought, then what
 * THOSE bought, recursively (depth-limited, cycle-safe). With `typeSlug`, the
 * tree is pruned to branches leading to a company of that solution type.
 */
export function acquisitionTree(
  ix: ExplorerIndex,
  rootId: string,
  opts: { maxDepth?: number; typeSlug?: string | null } = {}
): TreeNode {
  const maxDepth = opts.maxDepth ?? 3;
  const slug = opts.typeSlug ?? null;
  const visited = new Set<string>([rootId]);

  const make = (companyId: string | null, name: string, depth: number, via: XEvent | null): TreeNode => {
    const node: TreeNode = {
      key: `${companyId ?? name}-${via?.id ?? "root"}`,
      companyId,
      name,
      depth,
      via,
      children: [],
      typeMatch: !!(slug && companyId && ix.typesOf.get(companyId)?.has(slug)),
    };
    if (companyId && depth < maxDepth) {
      for (const e of ix.boughtBy.get(companyId) ?? []) {
        const tid = e.tgtId;
        if (tid && visited.has(tid)) continue;
        if (tid) visited.add(tid);
        const tName = tid ? ix.company.get(tid)?.name ?? "?" : e.tgtRaw ?? "?";
        node.children.push(make(tid, tName, depth + 1, e));
      }
    }
    return node;
  };

  const root = make(rootId, ix.company.get(rootId)?.name ?? "?", 0, null);
  if (!slug) return root;

  // Keep only branches that contain a type match (the root is always kept).
  const prune = (n: TreeNode): TreeNode | null => {
    const kids = n.children.map(prune).filter((x): x is TreeNode => !!x);
    if (n.depth === 0 || n.typeMatch || kids.length) return { ...n, children: kids };
    return null;
  };
  return prune(root)!;
}

/** Flatten a tree depth-first (row order for the swimlane timeline). */
export function flatten(n: TreeNode, out: TreeNode[] = []): TreeNode[] {
  out.push(n);
  n.children.forEach((c) => flatten(c, out));
  return out;
}

export function countDescendants(n: TreeNode): number {
  return n.children.reduce((s, c) => s + 1 + countDescendants(c), 0);
}

/**
 * Companies relevant to a solution type: active (not absorbed/merged/defunct)
 * vendors of a solution with that type, plus active companies whose
 * acquisition tree contains a company of that type.
 */
export function editorsOfType(ix: ExplorerIndex, d: ExplorerData, slug: string): string[] {
  const out = new Set<string>();
  for (const s of d.solutions) {
    if (!s.types.includes(slug)) continue;
    const c = ix.company.get(s.vendorId);
    if (c && !GONE.has(c.status)) out.add(c.id);
  }
  for (const [buyerId] of ix.boughtBy) {
    const c = ix.company.get(buyerId);
    if (!c || GONE.has(c.status) || out.has(buyerId)) continue;
    const t = acquisitionTree(ix, buyerId, { typeSlug: slug });
    if (t.children.length) out.add(buyerId);
  }
  return [...out];
}
