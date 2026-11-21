"use client";

// Non-timeline view: the acquisition tree as nested, collapsible cards
// (acquisitions of acquisitions are indented under their buyer).
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight, ExternalLink } from "lucide-react";
import { EntityChip, useEventLabel, useFormatters } from "@/components/explorer/entity";
import { countDescendants, type ExplorerIndex, type TreeNode, type XType } from "@/lib/explorer-model";

const OUTCOME_STYLE: Record<string, string> = {
  ABSORBED: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30",
  AUTONOMOUS: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
  INVESTOR_OWNED: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
};

export function TreeCards({
  root,
  ix,
  types,
  typeSlug,
}: {
  root: TreeNode;
  ix: ExplorerIndex;
  types: XType[];
  typeSlug: string | null;
}) {
  const t = useTranslations("explorer");
  if (!root.children.length) {
    return <p className="text-sm text-muted-foreground">{typeSlug ? t("noTypeAcquisitions") : t("noAcquisitions")}</p>;
  }
  return (
    <ol className="space-y-2.5">
      {root.children.map((n) => (
        <NodeCard key={n.key} node={n} ix={ix} types={types} typeSlug={typeSlug} />
      ))}
    </ol>
  );
}

function NodeCard({ node, ix, types, typeSlug }: { node: TreeNode; ix: ExplorerIndex; types: XType[]; typeSlug: string | null }) {
  const t = useTranslations("explorer");
  const tOut = useTranslations("explorer.outcome");
  const { date, amount } = useFormatters();
  const label = useEventLabel();
  const [open, setOpen] = useState(node.depth < 2);
  const c = node.companyId ? ix.company.get(node.companyId) ?? null : null;
  const e = node.via;
  const nameOf = (id: string | null, raw: string | null) => (id ? ix.company.get(id)?.name ?? "?" : raw ?? "?");
  const companyTypes = node.companyId ? [...(ix.typesOf.get(node.companyId) ?? [])] : [];
  const typeLabel = (slug: string) => types.find((x) => x.slug === slug)?.label ?? slug;
  const nested = countDescendants(node);

  return (
    <li className="animate-in fade-in slide-in-from-bottom-1 duration-300">
      <div
        className={`rounded-xl border bg-card p-3 shadow-sm transition-colors hover:border-primary/40 ${
          node.typeMatch ? "border-emerald-500/50 bg-emerald-500/[0.03]" : ""
        }`}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {node.children.length > 0 ? (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={open ? t("collapse") : t("expand")}
              className="rounded-md p-0.5 hover:bg-muted"
            >
              <ChevronRight className={`w-4 h-4 transition-transform ${open ? "rotate-90" : ""}`} />
            </button>
          ) : (
            <span className="w-5" />
          )}
          <EntityChip company={c} name={node.name} size={28} />
          {e && <span className="text-sm text-muted-foreground tabular-nums">{date(e)}</span>}
          {e && amount(e.amount) && <span className="text-sm font-semibold">{amount(e.amount)}</span>}
          {e?.outcome && e.outcome !== "UNKNOWN" && (
            <span className={`text-[11px] rounded-full border px-2 py-0.5 ${OUTCOME_STYLE[e.outcome] ?? ""}`}>{tOut(e.outcome)}</span>
          )}
          {nested > 0 && (
            <span className="text-[11px] rounded-full bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 px-2 py-0.5">
              {t("nestedCount", { n: nested })}
            </span>
          )}
          {e?.url && (
            <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline">
              {t("source")} <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        {(companyTypes.length > 0 || e) && (
          <div className="mt-2 pl-8 flex flex-wrap items-center gap-1.5 text-xs">
            {e && <span className="text-muted-foreground mr-1">{label(e, nameOf)}</span>}
            {companyTypes.slice(0, 6).map((slug) => (
              <span
                key={slug}
                className={`rounded-md px-1.5 py-0.5 border ${slug === typeSlug ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300" : "bg-muted/50"}`}
              >
                {typeLabel(slug)}
              </span>
            ))}
          </div>
        )}
      </div>
      {open && node.children.length > 0 && (
        <ol className="mt-2.5 ml-5 pl-4 border-l-2 border-violet-500/25 space-y-2.5">
          {node.children.map((ch) => (
            <NodeCard key={ch.key} node={ch} ix={ix} types={types} typeSlug={typeSlug} />
          ))}
        </ol>
      )}
    </li>
  );
}
