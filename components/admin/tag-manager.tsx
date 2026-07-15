"use client";

// Tags CRUD in one screen (three families, scope category).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/components/admin/api";
import { TAG_FAMILIES, SCOPE_CATEGORIES } from "@/lib/constants";

export interface TagRow {
  id: string;
  slug: string;
  family: string;
  labelFr: string;
  labelEn: string;
  category: string | null;
}

interface TagForm {
  slug: string;
  family: string;
  labelFr: string;
  labelEn: string;
  category: string;
}

const EMPTY: TagForm = { slug: "", family: "SOLUTION_TYPE", labelFr: "", labelEn: "", category: "" };

export function TagManager({ tags }: { tags: TagRow[] }) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("admin");
  const tFamilies = useTranslations("tagFamilies");
  const tScopeCat = useTranslations("scopeCategories");

  const [editing, setEditing] = useState<string | null>(null); // tag id or "new"
  const [form, setForm] = useState<TagForm>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof TagForm, v: string) => setForm((p) => ({ ...p, [k]: v }));

  function startEdit(tag?: TagRow) {
    setError(null);
    if (!tag) {
      setEditing("new");
      setForm(EMPTY);
      return;
    }
    setEditing(tag.id);
    setForm({
      slug: tag.slug,
      family: tag.family,
      labelFr: tag.labelFr,
      labelEn: tag.labelEn,
      category: tag.category ?? "",
    });
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = { ...form, category: form.family === "SCOPE" ? form.category || null : null };
      if (editing === "new") await api("/api/tags", "POST", payload);
      else await api(`/api/tags/${editing}`, "PUT", payload);
      setEditing(null);
      setForm(EMPTY);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? t("genericError") : t("genericError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {TAG_FAMILIES.map((family) => (
        <div key={family} className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground uppercase">
            {tFamilies(family)}
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {tags
              .filter((tag) => tag.family === family)
              .map((tag) => (
                <Badge key={tag.id} variant="outline" className="gap-1.5 py-1">
                  <button type="button" className="hover:underline" onClick={() => startEdit(tag)}>
                    {locale === "fr" ? tag.labelFr : tag.labelEn}
                  </button>
                  {tag.category && (
                    <span className="text-[10px] text-muted-foreground">
                      {tScopeCat(tag.category as Parameters<typeof tScopeCat>[0])}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label={t("delete")}
                    className="hover:text-destructive"
                    onClick={async () => {
                      if (!window.confirm(t("deleteConfirm"))) return;
                      await api(`/api/tags/${tag.id}`, "DELETE");
                      router.refresh();
                    }}
                  >
                    ×
                  </button>
                </Badge>
              ))}
          </div>
        </div>
      ))}

      {editing === null ? (
        <Button onClick={() => startEdit()}>{t("newTag")}</Button>
      ) : (
        <form onSubmit={onSave} className="border rounded-md p-4 space-y-3 max-w-xl">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs text-muted-foreground flex flex-col gap-1">
              {t("fields.slug")} *
              <Input value={form.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} required />
            </label>
            <label className="text-xs text-muted-foreground flex flex-col gap-1">
              {t("fields.family")} *
              <select
                className="border rounded-md bg-background text-foreground px-2 py-2 text-sm"
                value={form.family}
                onChange={(e) => set("family", e.target.value)}
              >
                {TAG_FAMILIES.map((f) => (
                  <option key={f} value={f}>
                    {tFamilies(f)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground flex flex-col gap-1">
              {t("fields.labelFr")} *
              <Input value={form.labelFr} onChange={(e) => set("labelFr", e.target.value)} required />
            </label>
            <label className="text-xs text-muted-foreground flex flex-col gap-1">
              {t("fields.labelEn")} *
              <Input value={form.labelEn} onChange={(e) => set("labelEn", e.target.value)} required />
            </label>
            {form.family === "SCOPE" && (
              <label className="text-xs text-muted-foreground flex flex-col gap-1">
                {t("fields.category")}
                <select
                  className="border rounded-md bg-background text-foreground px-2 py-2 text-sm"
                  value={form.category}
                  onChange={(e) => set("category", e.target.value)}
                >
                  <option value="">{t("fields.none")}</option>
                  {SCOPE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {tScopeCat(c)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? t("saving") : t("save")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(null)}>
              {t("cancel")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
