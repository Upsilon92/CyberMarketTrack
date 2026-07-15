"use client";

// =============================================================================
// Comparator grid rendering.
//
// Two modes:
//  - "edit": every custom cell is editable inline, no merging
//  - "view": read-only render with category header groups, logos, flags and
//    MERGED solution bars (contiguous identical solutions span like a colspan
//    planning bar; works in both orientations via colspan/rowspan)
//
// Default attributes are recomputed display strings passed via the catalog —
// they are never stored in the comparator.
// =============================================================================
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  mergeSolutionCells,
  orderedCriteria,
  valueKey,
  type CellValue,
  type ComparatorContent,
  type ComparatorCriterion,
  type ComparatorItem,
} from "@/lib/comparator";
import type { CatalogItem } from "@/lib/comparator-data";
import { countryFlag } from "@/lib/flags";

// Stable color per solution label (coverage bars)
const BAR_COLORS = [
  "bg-sky-600",
  "bg-teal-600",
  "bg-violet-600",
  "bg-amber-600",
  "bg-rose-600",
  "bg-emerald-600",
  "bg-indigo-600",
  "bg-orange-600",
];
function barColor(label: string): string {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) | 0;
  return BAR_COLORS[Math.abs(h) % BAR_COLORS.length];
}

export interface GridProps {
  content: ComparatorContent;
  catalog: Map<string, CatalogItem>;
  mode: "edit" | "view";
  onChange?: (item: ComparatorItem, criterionId: string, value: CellValue | null) => void;
  onRemoveItem?: (item: ComparatorItem) => void;
  onRemoveCriterion?: (criterionId: string) => void;
  solutionOptions: { id: string; label: string }[];
}

const CELL = "border px-2 py-1.5 text-sm";
const HEAD = "border px-2 py-1.5 text-xs font-medium bg-muted/50";

export function ComparatorGrid(props: GridProps) {
  const { content } = props;
  if (content.items.length === 0) return null;
  return content.orientation === "itemsAsRows" ? (
    <ItemsAsRows {...props} />
  ) : (
    <ItemsAsColumns {...props} />
  );
}

// --- Shared cell rendering ------------------------------------------------------

function ViewCell({
  value,
  solutionOptions,
}: {
  value: CellValue | null;
  solutionOptions: { id: string; label: string }[];
}) {
  if (!value) return <span className="text-muted-foreground/40">·</span>;
  switch (value.t) {
    case "boolean":
      return value.v === "yes" ? (
        <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
      ) : (
        <span className="text-amber-600 dark:text-amber-400 font-bold" title="partial">◐</span>
      );
    case "rating":
      return <span className="text-amber-500">{"★".repeat(value.v)}<span className="text-muted-foreground/30">{"★".repeat(5 - value.v)}</span></span>;
    case "number":
      return <span className="tabular-nums">{value.v.toLocaleString()}</span>;
    case "text":
      return <span>{value.v}</span>;
    case "solution": {
      const label = value.solutionId
        ? (solutionOptions.find((s) => s.id === value.solutionId)?.label ?? value.name ?? "?")
        : (value.name ?? "?");
      return <span>{label}</span>;
    }
  }
}

/** Solution coverage bar (merged cells) — clickable when referencing the base. */
function SolutionBar({
  value,
  solutionOptions,
}: {
  value: CellValue;
  solutionOptions: { id: string; label: string }[];
}) {
  if (value.t !== "solution") return null;
  const label = value.solutionId
    ? (solutionOptions.find((s) => s.id === value.solutionId)?.label ?? value.name ?? "?")
    : (value.name ?? "?");
  const bar = (
    <div
      className={`${barColor(label)} text-white text-xs rounded px-2 py-1 text-center whitespace-nowrap overflow-hidden`}
      title={label}
    >
      {label}
    </div>
  );
  return value.solutionId ? <Link href={`/solutions/${value.solutionId}`}>{bar}</Link> : bar;
}

function EditCell({
  criterion,
  value,
  onChange,
  solutionOptions,
  placeholder,
}: {
  criterion: ComparatorCriterion;
  value: CellValue | null;
  onChange: (v: CellValue | null) => void;
  solutionOptions: { id: string; label: string }[];
  placeholder: string;
}) {
  switch (criterion.type) {
    case "boolean": {
      // click cycles: empty -> yes -> partial -> empty
      const next = () => {
        if (!value) onChange({ t: "boolean", v: "yes" });
        else if (value.t === "boolean" && value.v === "yes") onChange({ t: "boolean", v: "partial" });
        else onChange(null);
      };
      return (
        <button type="button" onClick={next} className="w-full h-full min-h-6 cursor-pointer">
          <ViewCell value={value} solutionOptions={solutionOptions} />
        </button>
      );
    }
    case "rating":
      return (
        <select
          className="bg-transparent text-sm w-full"
          value={value?.t === "rating" ? value.v : ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : { t: "rating", v: Number(e.target.value) })
          }
        >
          <option value="">·</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {"★".repeat(n)}
            </option>
          ))}
        </select>
      );
    case "number":
      return (
        <input
          type="number"
          className="bg-transparent text-sm w-20 outline-none"
          defaultValue={value?.t === "number" ? value.v : ""}
          onBlur={(e) =>
            onChange(e.target.value === "" ? null : { t: "number", v: Number(e.target.value) })
          }
        />
      );
    case "text":
      return (
        <input
          className="bg-transparent text-sm w-full min-w-24 outline-none"
          defaultValue={value?.t === "text" ? value.v : ""}
          onBlur={(e) => onChange(e.target.value === "" ? null : { t: "text", v: e.target.value })}
        />
      );
    case "solution": {
      const current = value?.t === "solution" ? value : null;
      const selectValue = current?.solutionId ?? (current?.name ? "__free__" : "");
      return (
        <div className="flex flex-col gap-1 min-w-36">
          <select
            className="bg-transparent text-sm w-full"
            value={selectValue}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") onChange(null);
              else if (v === "__free__") onChange({ t: "solution", solutionId: null, name: current?.name ?? "" });
              else {
                const opt = solutionOptions.find((s) => s.id === v);
                onChange({ t: "solution", solutionId: v, name: opt?.label ?? null });
              }
            }}
          >
            <option value="">·</option>
            <option value="__free__">✎ …</option>
            {solutionOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          {selectValue === "__free__" && (
            <input
              className="bg-transparent text-sm border rounded px-1 outline-none"
              placeholder={placeholder}
              defaultValue={current?.name ?? ""}
              onBlur={(e) =>
                onChange(
                  e.target.value === ""
                    ? null
                    : { t: "solution", solutionId: null, name: e.target.value }
                )
              }
            />
          )}
        </div>
      );
    }
  }
}

/** Attribute cell (default attributes — always derived, read-only). */
function AttrCell({ attr, item }: { attr: string; item: CatalogItem | undefined }) {
  if (!item) return null;
  if (attr === "logo") {
    return item.logoUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={item.logoUrl} alt={item.label} className="h-6 max-w-20 object-contain" />
    ) : null;
  }
  if (attr === "country")
    return item.country ? <span>{countryFlag(item.country)} {item.country}</span> : null;
  if (attr === "originCountry")
    return item.originCountry ? <span>{countryFlag(item.originCountry)} {item.originCountry}</span> : null;
  return <span>{item.attributes[attr] ?? ""}</span>;
}

// --- Header helpers ----------------------------------------------------------------

/** Groups the ordered criteria into [category|null, criteria[]] runs. */
function headerGroups(content: ComparatorContent) {
  const ordered = orderedCriteria(content);
  const groups: { name: string | null; criteria: ComparatorCriterion[] }[] = [];
  for (const c of ordered) {
    const catName = c.categoryId
      ? (content.categories.find((cat) => cat.id === c.categoryId)?.name ?? null)
      : null;
    const last = groups[groups.length - 1];
    if (last && last.name === catName) last.criteria.push(c);
    else groups.push({ name: catName, criteria: [c] });
  }
  return { ordered, groups };
}

function itemLink(item: CatalogItem | undefined, key: string) {
  if (!item) return <span className="text-muted-foreground">?</span>;
  const href = item.kind === "company" ? `/companies/${item.id}` : `/solutions/${item.id}`;
  return (
    <Link href={href} className="font-medium hover:underline whitespace-nowrap">
      {item.label}
    </Link>
  );
}

// --- Orientation 1: items as rows -----------------------------------------------------

function ItemsAsRows({
  content,
  catalog,
  mode,
  onChange,
  onRemoveItem,
  onRemoveCriterion,
  solutionOptions,
}: GridProps) {
  const t = useTranslations("comparators");
  const tAttrs = useTranslations("comparators.attributes");
  const { ordered, groups } = headerGroups(content);
  const attrs = content.defaultAttributes;

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse w-max min-w-full">
        <thead>
          <tr>
            <th className={HEAD} rowSpan={2} />
            {attrs.map((a) => (
              <th key={a} className={HEAD} rowSpan={2}>
                {tAttrs(a as Parameters<typeof tAttrs>[0])}
              </th>
            ))}
            {groups.map((g, i) =>
              g.name ? (
                <th key={i} className={`${HEAD} text-center`} colSpan={g.criteria.length}>
                  {g.name}
                </th>
              ) : (
                g.criteria.map((c) => (
                  <th key={c.id} className={`${HEAD} align-bottom`} rowSpan={2}>
                    {c.name}
                    {mode === "edit" && (
                      <button
                        type="button"
                        onClick={() => onRemoveCriterion?.(c.id)}
                        className="ml-1 text-muted-foreground hover:text-destructive"
                        aria-label={t("remove")}
                      >
                        ×
                      </button>
                    )}
                  </th>
                ))
              )
            )}
          </tr>
          <tr>
            {groups.map((g) =>
              g.name
                ? g.criteria.map((c) => (
                    <th key={c.id} className={HEAD}>
                      {c.name}
                      {mode === "edit" && (
                        <button
                          type="button"
                          onClick={() => onRemoveCriterion?.(c.id)}
                          className="ml-1 text-muted-foreground hover:text-destructive"
                          aria-label={t("remove")}
                        >
                          ×
                        </button>
                      )}
                    </th>
                  ))
                : null
            )}
          </tr>
        </thead>
        <tbody>
          {content.items.map((item) => {
            const key = `${item.kind}:${item.id}`;
            const cat = catalog.get(key);
            const getValue = (cid: string) => content.values[valueKey(item, cid)] ?? null;

            return (
              <tr key={key}>
                <td className={`${CELL} bg-muted/30`}>
                  <div className="flex items-center gap-2">
                    {itemLink(cat, key)}
                    {mode === "edit" && (
                      <button
                        type="button"
                        onClick={() => onRemoveItem?.(item)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={t("remove")}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </td>
                {attrs.map((a) => (
                  <td key={a} className={`${CELL} text-xs`}>
                    <AttrCell attr={a} item={cat} />
                  </td>
                ))}
                {mode === "view"
                  ? mergeSolutionCells(ordered, getValue).map((mc, i) => (
                      <td key={i} className={`${CELL} text-center align-middle`} colSpan={mc.span}>
                        {mc.value?.t === "solution" ? (
                          <SolutionBar value={mc.value} solutionOptions={solutionOptions} />
                        ) : (
                          <ViewCell value={mc.value} solutionOptions={solutionOptions} />
                        )}
                      </td>
                    ))
                  : ordered.map((c) => (
                      <td key={c.id} className={`${CELL} text-center`}>
                        <EditCell
                          criterion={c}
                          value={getValue(c.id)}
                          onChange={(v) => onChange?.(item, c.id, v)}
                          solutionOptions={solutionOptions}
                          placeholder={t("solutionCellPlaceholder")}
                        />
                      </td>
                    ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// --- Orientation 2: items as columns (transposed) -----------------------------------------

function ItemsAsColumns({
  content,
  catalog,
  mode,
  onChange,
  onRemoveItem,
  onRemoveCriterion,
  solutionOptions,
}: GridProps) {
  const t = useTranslations("comparators");
  const tAttrs = useTranslations("comparators.attributes");
  const { ordered, groups } = headerGroups(content);
  const attrs = content.defaultAttributes;

  // Precompute merged spans per item (view mode): criterionId -> {start, span} | skip
  const spanInfo = new Map<string, Map<string, { span: number } | "skip">>();
  if (mode === "view") {
    for (const item of content.items) {
      const key = `${item.kind}:${item.id}`;
      const getValue = (cid: string) => content.values[valueKey(item, cid)] ?? null;
      const merged = mergeSolutionCells(ordered, getValue);
      const map = new Map<string, { span: number } | "skip">();
      for (const mc of merged) {
        map.set(mc.criterionIds[0], { span: mc.span });
        for (const cid of mc.criterionIds.slice(1)) map.set(cid, "skip");
      }
      spanInfo.set(key, map);
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse w-max min-w-full">
        <thead>
          <tr>
            <th className={HEAD} colSpan={2} />
            {content.items.map((item) => {
              const key = `${item.kind}:${item.id}`;
              const cat = catalog.get(key);
              return (
                <th key={key} className={HEAD}>
                  <div className="flex items-center gap-2 justify-center">
                    {itemLink(cat, key)}
                    {mode === "edit" && (
                      <button
                        type="button"
                        onClick={() => onRemoveItem?.(item)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={t("remove")}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {attrs.map((a) => (
            <tr key={a}>
              <td className={`${HEAD}`} colSpan={2}>
                {tAttrs(a as Parameters<typeof tAttrs>[0])}
              </td>
              {content.items.map((item) => {
                const key = `${item.kind}:${item.id}`;
                return (
                  <td key={key} className={`${CELL} text-xs text-center`}>
                    <AttrCell attr={a} item={catalog.get(key)} />
                  </td>
                );
              })}
            </tr>
          ))}
          {groups.map((g, gi) =>
            g.criteria.map((c, ci) => (
              <tr key={c.id}>
                {ci === 0 && (
                  <td
                    className={`${HEAD} align-middle ${g.name ? "" : "text-muted-foreground/50"}`}
                    rowSpan={g.criteria.length}
                  >
                    {g.name ?? ""}
                  </td>
                )}
                <td className={HEAD}>
                  {c.name}
                  {mode === "edit" && (
                    <button
                      type="button"
                      onClick={() => onRemoveCriterion?.(c.id)}
                      className="ml-1 text-muted-foreground hover:text-destructive"
                      aria-label={t("remove")}
                    >
                      ×
                    </button>
                  )}
                </td>
                {content.items.map((item) => {
                  const key = `${item.kind}:${item.id}`;
                  const value = content.values[valueKey(item, c.id)] ?? null;
                  if (mode === "view") {
                    const info = spanInfo.get(key)?.get(c.id);
                    if (info === "skip") return null;
                    const span = info ? info.span : 1;
                    return (
                      <td key={key} className={`${CELL} text-center align-middle`} rowSpan={span}>
                        {value?.t === "solution" ? (
                          <SolutionBar value={value} solutionOptions={solutionOptions} />
                        ) : (
                          <ViewCell value={value} solutionOptions={solutionOptions} />
                        )}
                      </td>
                    );
                  }
                  return (
                    <td key={key} className={`${CELL} text-center`}>
                      <EditCell
                        criterion={c}
                        value={value}
                        onChange={(v) => onChange?.(item, c.id, v)}
                        solutionOptions={solutionOptions}
                        placeholder={t("solutionCellPlaceholder")}
                      />
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
