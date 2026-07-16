"use client";

// =============================================================================
// Comparator editor — toolbar (items, criteria, categories, default
// attributes, transpose, save/duplicate) + grid (edit/view modes) + exports
// (PNG via html-to-image, print CSS, versioned JSON export/import).
// =============================================================================
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/components/admin/api";
import { ComparatorGrid } from "@/components/comparator/grid";
import {
  comparatorContentSchema,
  emptyContent,
  valueKey,
  itemKey,
  orderedCriteria,
  COMPANY_DEFAULT_ATTRIBUTES,
  SOLUTION_DEFAULT_ATTRIBUTES,
  CELL_TYPES,
  type CellValue,
  type ComparatorContent,
  type ComparatorItem,
} from "@/lib/comparator";
import { toCsv } from "@/lib/csv";
import type { ComparatorCatalog } from "@/lib/comparator-data";

let idCounter = 0;
const freshId = () => `c${Date.now().toString(36)}${(idCounter++).toString(36)}`;

export function ComparatorEditor({
  comparatorId,
  initialName,
  initialContent,
  catalog,
  canEdit,
}: {
  comparatorId?: string;
  initialName: string;
  initialContent: ComparatorContent | null;
  catalog: ComparatorCatalog;
  canEdit: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("comparators");
  const tAdmin = useTranslations("admin");
  const tCellTypes = useTranslations("comparators.cellTypes");
  const tAttrs = useTranslations("comparators.attributes");

  const [name, setName] = useState(initialName);
  const [content, setContent] = useState<ComparatorContent>(initialContent ?? emptyContent());
  const [mode, setMode] = useState<"edit" | "view">(canEdit ? "edit" : "view");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [newCriterion, setNewCriterion] = useState({ name: "", type: "boolean", categoryId: "" });
  const [newCategory, setNewCategory] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const catalogMap = useMemo(() => {
    const map = new Map(
      [...catalog.companies, ...catalog.solutions].map((item) => [item.key, item])
    );
    return map;
  }, [catalog]);

  const solutionOptions = useMemo(
    () => catalog.solutions.map((s) => ({ id: s.id, label: s.label })),
    [catalog]
  );

  const update = (fn: (c: ComparatorContent) => ComparatorContent) => setContent((c) => fn(c));

  // ---- Items -----------------------------------------------------------------
  function addItem(kind: "company" | "solution", id: string) {
    if (!id) return;
    update((c) => {
      if (c.items.some((i) => i.kind === kind && i.id === id)) return c;
      const items = [...c.items, { kind, id }];
      // On the FIRST item of a kind, auto-enable its default attributes so the
      // relevant columns (e.g. a solution's vendor) fill in automatically. Still
      // toggleable afterwards.
      const firstOfKind = !c.items.some((i) => i.kind === kind);
      let defaultAttributes = c.defaultAttributes;
      if (firstOfKind) {
        const toAdd =
          kind === "solution"
            ? [...SOLUTION_DEFAULT_ATTRIBUTES]
            : (["logo", "country", "foundedYear"] as string[]);
        defaultAttributes = [...new Set([...c.defaultAttributes, ...toAdd])];
      }
      return { ...c, items, defaultAttributes };
    });
  }
  function removeItem(item: ComparatorItem) {
    update((c) => ({
      ...c,
      items: c.items.filter((i) => !(i.kind === item.kind && i.id === item.id)),
    }));
  }

  // ---- Criteria / categories -----------------------------------------------------
  function addCriterion() {
    if (!newCriterion.name.trim()) return;
    update((c) => ({
      ...c,
      criteria: [
        ...c.criteria,
        {
          id: freshId(),
          name: newCriterion.name.trim(),
          type: newCriterion.type as (typeof CELL_TYPES)[number],
          categoryId: newCriterion.categoryId || null,
        },
      ],
    }));
    setNewCriterion((p) => ({ ...p, name: "" }));
  }
  function removeCriterion(id: string) {
    update((c) => ({
      ...c,
      criteria: c.criteria.filter((cr) => cr.id !== id),
      values: Object.fromEntries(Object.entries(c.values).filter(([k]) => !k.endsWith(`|${id}`))),
    }));
  }
  function addCategory() {
    if (!newCategory.trim()) return;
    update((c) => ({
      ...c,
      categories: [...c.categories, { id: freshId(), name: newCategory.trim() }],
    }));
    setNewCategory("");
  }

  // ---- Cells --------------------------------------------------------------------
  function onCellChange(item: ComparatorItem, criterionId: string, value: CellValue | null) {
    update((c) => {
      const values = { ...c.values };
      const key = valueKey(item, criterionId);
      if (value === null) delete values[key];
      else values[key] = value;
      return { ...c, values };
    });
  }

  // ---- Default attributes ----------------------------------------------------------
  const hasCompanies = content.items.some((i) => i.kind === "company");
  const hasSolutions = content.items.some((i) => i.kind === "solution");
  const availableAttrs = [
    ...(hasCompanies ? COMPANY_DEFAULT_ATTRIBUTES : []),
    ...(hasSolutions ? SOLUTION_DEFAULT_ATTRIBUTES.filter((a) => a !== "tags" || !hasCompanies) : []),
  ];

  // ---- Persistence -------------------------------------------------------------------
  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      if (comparatorId) {
        await api(`/api/comparators/${comparatorId}`, "PUT", { name, content });
        setMessage(tAdmin("saved"));
        router.refresh();
      } else {
        const res = await api<{ id: string }>("/api/comparators", "POST", { name, content });
        router.push(`/comparators/${res.id}`);
      }
    } catch {
      setMessage(tAdmin("genericError"));
    } finally {
      setBusy(false);
    }
  }

  async function duplicate() {
    setBusy(true);
    try {
      const res = await api<{ id: string }>("/api/comparators", "POST", {
        name: t("duplicateName", { name }),
        content,
      });
      router.push(`/comparators/${res.id}`);
    } catch {
      setMessage(tAdmin("genericError"));
    } finally {
      setBusy(false);
    }
  }

  // ---- Exports ---------------------------------------------------------------------------
  async function exportPng() {
    if (!gridRef.current) return;
    const dataUrl = await toPng(gridRef.current, {
      backgroundColor: window.getComputedStyle(document.body).backgroundColor,
      pixelRatio: 2,
    });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${name || "comparator"}.png`;
    a.click();
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ name, ...content }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name || "comparator"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // CSV export: a spreadsheet-friendly table (items as columns, one row per
  // default attribute then per criterion). Cell values are rendered to text.
  function exportCsv() {
    const cellText = (item: ComparatorItem, criterionId: string, type: string): string => {
      const v = content.values[valueKey(item, criterionId)];
      if (!v) return "";
      if (v.t === "boolean") return v.v === "yes" ? "Oui" : "Partiel";
      if (v.t === "rating") return String(v.v);
      if (v.t === "number") return String(v.v);
      if (v.t === "text") return v.v;
      if (v.t === "solution")
        return v.solutionId
          ? (solutionOptions.find((s) => s.id === v.solutionId)?.label ?? v.name ?? "")
          : (v.name ?? "");
      void type;
      return "";
    };
    const attrText = (item: ComparatorItem, attr: string): string => {
      const cat = catalogMap.get(itemKey(item));
      if (!cat) return "";
      if (attr === "logo") return ""; // image, not exportable to text
      if (attr === "country") return cat.country ?? "";
      if (attr === "originCountry") return cat.originCountry ?? "";
      return cat.attributes[attr] ?? "";
    };

    const ordered = orderedCriteria(content);
    const header = ["", ...content.items.map((it) => catalogMap.get(itemKey(it))?.label ?? "?")];
    const rows: string[][] = [];
    for (const attr of content.defaultAttributes) {
      rows.push([tAttrs(attr as Parameters<typeof tAttrs>[0]), ...content.items.map((it) => attrText(it, attr))]);
    }
    for (const crit of ordered) {
      const catName = crit.categoryId
        ? content.categories.find((cat) => cat.id === crit.categoryId)?.name
        : null;
      const label = catName ? `${catName} — ${crit.name}` : crit.name;
      rows.push([label, ...content.items.map((it) => cellText(it, crit.id, crit.type))]);
    }
    const csv = "﻿" + toCsv(header, rows); // BOM for Excel UTF-8
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name || "comparator"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMessage(null);
    try {
      const raw = JSON.parse(await file.text());
      const { name: importedName, ...rest } = raw;
      const parsed = comparatorContentSchema.safeParse(rest);
      if (!parsed.success) throw new Error("schema");
      setContent(parsed.data);
      if (typeof importedName === "string" && importedName) setName(importedName);
    } catch {
      setMessage(t("invalidJson"));
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Input
          className="max-w-64 font-medium"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("name")}
          disabled={!canEdit}
        />
        {canEdit && (
          <>
            <Button size="sm" onClick={save} disabled={busy || !name.trim()}>
              {busy ? tAdmin("saving") : tAdmin("save")}
            </Button>
            <Button size="sm" variant="outline" onClick={duplicate} disabled={busy || !name.trim()}>
              {t("duplicate")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMode(mode === "edit" ? "view" : "edit")}
            >
              {mode === "edit" ? "👁" : "✎"} {mode === "edit" ? t("viewMode") : t("editMode")}
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            update((c) => ({
              ...c,
              orientation: c.orientation === "itemsAsRows" ? "itemsAsColumns" : "itemsAsRows",
            }))
          }
        >
          ⇄ {t("transpose")}
        </Button>
        <span className="ml-auto flex gap-1.5">
          <Button size="sm" variant="outline" onClick={exportPng}>
            {t("exportPng")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            {t("print")}
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            {t("exportCsv")}
          </Button>
          <Button size="sm" variant="outline" onClick={exportJson}>
            {t("exportJson")}
          </Button>
          {canEdit && (
            <>
              <Button size="sm" variant="outline" onClick={() => importRef.current?.click()}>
                {t("importJson")}
              </Button>
              <input
                ref={importRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={importJson}
              />
            </>
          )}
        </span>
      </div>

      {message && <p className="text-sm text-muted-foreground print:hidden">{message}</p>}

      {/* Builders (edit mode only) */}
      {canEdit && mode === "edit" && (
        <div className="space-y-3 border rounded-md p-3 print:hidden">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted-foreground flex flex-col gap-1">
              {t("addCompany")}
              <select
                className="border rounded-md bg-background text-foreground px-2 py-1.5 text-sm min-w-44"
                value=""
                onChange={(e) => addItem("company", e.target.value)}
              >
                <option value="">…</option>
                {catalog.companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground flex flex-col gap-1">
              {t("addSolution")}
              <select
                className="border rounded-md bg-background text-foreground px-2 py-1.5 text-sm min-w-44"
                value=""
                onChange={(e) => addItem("solution", e.target.value)}
              >
                <option value="">…</option>
                {catalog.solutions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            {/* Default attributes toggles */}
            {availableAttrs.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{t("defaultAttributes")}</span>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {[...new Set(availableAttrs)].map((a) => (
                    <label key={a} className="flex items-center gap-1 text-xs">
                      <Checkbox
                        checked={content.defaultAttributes.includes(a)}
                        onCheckedChange={(checked) =>
                          update((c) => ({
                            ...c,
                            defaultAttributes: checked
                              ? [...c.defaultAttributes, a]
                              : c.defaultAttributes.filter((x) => x !== a),
                          }))
                        }
                      />
                      {tAttrs(a as Parameters<typeof tAttrs>[0])}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted-foreground flex flex-col gap-1">
              {t("criterionName")}
              <Input
                className="w-44"
                value={newCriterion.name}
                onChange={(e) => setNewCriterion((p) => ({ ...p, name: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCriterion())}
              />
            </label>
            <label className="text-xs text-muted-foreground flex flex-col gap-1">
              {t("criterionType")}
              <select
                className="border rounded-md bg-background text-foreground px-2 py-1.5 text-sm"
                value={newCriterion.type}
                onChange={(e) => setNewCriterion((p) => ({ ...p, type: e.target.value }))}
              >
                {CELL_TYPES.map((ct) => (
                  <option key={ct} value={ct}>
                    {tCellTypes(ct)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground flex flex-col gap-1">
              {t("category")}
              <select
                className="border rounded-md bg-background text-foreground px-2 py-1.5 text-sm"
                value={newCriterion.categoryId}
                onChange={(e) => setNewCriterion((p) => ({ ...p, categoryId: e.target.value }))}
              >
                <option value="">{t("noCategory")}</option>
                {content.categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </label>
            <Button size="sm" variant="outline" onClick={addCriterion} disabled={!newCriterion.name.trim()}>
              {t("addCriterion")}
            </Button>

            <span className="mx-2 text-muted-foreground">·</span>

            <label className="text-xs text-muted-foreground flex flex-col gap-1">
              {t("categoryName")}
              <Input
                className="w-40"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCategory())}
              />
            </label>
            <Button size="sm" variant="outline" onClick={addCategory} disabled={!newCategory.trim()}>
              {t("addCategory")}
            </Button>
            {content.categories.length > 0 && (
              <span className="flex flex-wrap gap-1">
                {content.categories.map((cat) => (
                  <Badge key={cat.id} variant="secondary" className="gap-1">
                    {cat.name}
                    <button
                      type="button"
                      className="hover:text-destructive"
                      onClick={() =>
                        update((c) => ({
                          ...c,
                          categories: c.categories.filter((x) => x.id !== cat.id),
                          criteria: c.criteria.map((cr) =>
                            cr.categoryId === cat.id ? { ...cr, categoryId: null } : cr
                          ),
                        }))
                      }
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Grid */}
      <div ref={gridRef} className="print-target bg-background p-1">
        <ComparatorGrid
          content={content}
          catalog={catalogMap}
          mode={canEdit ? mode : "view"}
          onChange={onCellChange}
          onRemoveItem={removeItem}
          onRemoveCriterion={removeCriterion}
          solutionOptions={solutionOptions}
        />
      </div>
    </div>
  );
}
