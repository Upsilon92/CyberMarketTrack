"use client";

// Tag create/edit form. On edit it also offers a Delete button. For SCOPE tags
// it exposes the scope category selector (managing scope categorisation).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DeleteButton } from "@/components/admin/delete-button";
import { api, ApiError } from "@/components/admin/api";
import { TAG_FAMILIES, SCOPE_CATEGORIES } from "@/lib/constants";

export interface TagFormValues {
  slug: string;
  family: string;
  labelFr: string;
  labelEn: string;
  descriptionFr: string;
  descriptionEn: string;
  category: string;
}

export function TagForm({ tagId, initial }: { tagId?: string; initial?: Partial<TagFormValues> }) {
  const router = useRouter();
  const t = useTranslations("admin");
  const tf = useTranslations("admin.fields");
  const tFamilies = useTranslations("tagFamilies");
  const tScopeCat = useTranslations("scopeCategories");

  const [values, setValues] = useState<TagFormValues>({
    slug: initial?.slug ?? "",
    family: initial?.family ?? "SOLUTION_TYPE",
    labelFr: initial?.labelFr ?? "",
    labelEn: initial?.labelEn ?? "",
    descriptionFr: initial?.descriptionFr ?? "",
    descriptionEn: initial?.descriptionEn ?? "",
    category: initial?.category ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof TagFormValues, v: string) => setValues((p) => ({ ...p, [k]: v }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        ...values,
        category: values.family === "SCOPE" ? values.category || null : null,
      };
      if (tagId) await api(`/api/tags/${tagId}`, "PUT", payload);
      else await api("/api/tags", "POST", payload);
      router.push("/tags");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? t("genericError") : t("genericError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-xl">
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="slug">{tf("slug")} *</Label>
          <Input
            id="slug"
            value={values.slug}
            onChange={(e) => set("slug", e.target.value.toLowerCase())}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="family">{tf("family")} *</Label>
          <select
            id="family"
            className="border rounded-md bg-background text-foreground px-2 py-2 text-sm w-full"
            value={values.family}
            onChange={(e) => set("family", e.target.value)}
          >
            {TAG_FAMILIES.map((f) => (
              <option key={f} value={f}>
                {tFamilies(f)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="labelFr">{tf("labelFr")} *</Label>
          <Input
            id="labelFr"
            value={values.labelFr}
            onChange={(e) => set("labelFr", e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="labelEn">{tf("labelEn")} *</Label>
          <Input
            id="labelEn"
            value={values.labelEn}
            onChange={(e) => set("labelEn", e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="descriptionFr">{tf("descriptionFr")}</Label>
          <Input
            id="descriptionFr"
            value={values.descriptionFr}
            onChange={(e) => set("descriptionFr", e.target.value)}
            placeholder="ITDR = Identity Threat Detection & Response"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="descriptionEn">{tf("descriptionEn")}</Label>
          <Input
            id="descriptionEn"
            value={values.descriptionEn}
            onChange={(e) => set("descriptionEn", e.target.value)}
          />
        </div>
        {values.family === "SCOPE" && (
          <div className="space-y-1.5">
            <Label htmlFor="category">{tf("category")}</Label>
            <select
              id="category"
              className="border rounded-md bg-background text-foreground px-2 py-2 text-sm w-full"
              value={values.category}
              onChange={(e) => set("category", e.target.value)}
            >
              <option value="">{tf("none")}</option>
              {SCOPE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {tScopeCat(c)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? t("saving") : t("save")}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {t("cancel")}
        </Button>
        {tagId && (
          <span className="ml-auto">
            <DeleteButton path={`/api/tags/${tagId}`} redirectTo="/tags" />
          </span>
        )}
      </div>
    </form>
  );
}
