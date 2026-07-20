"use client";

// Solution create/edit form (original vendor + three tag families).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/components/admin/api";
import { TAG_FAMILIES } from "@/lib/constants";

export interface SolutionFormValues {
  initialName: string;
  initialCompanyId: string;
  description: string;
  features: string;
  launchYear: string;
  launchMonth: string;
  website: string;
  tagIds: string[];
}

export interface TagOption {
  id: string;
  family: string;
  labelFr: string;
  labelEn: string;
}

export function SolutionForm({
  solutionId,
  initial,
  companies,
  tags,
}: {
  solutionId?: string;
  initial?: Partial<SolutionFormValues>;
  companies: { id: string; label: string }[];
  tags: TagOption[];
}) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("admin");
  const tf = useTranslations("admin.fields");
  const tFamilies = useTranslations("tagFamilies");

  const [values, setValues] = useState<SolutionFormValues>({
    initialName: initial?.initialName ?? "",
    initialCompanyId: initial?.initialCompanyId ?? "",
    description: initial?.description ?? "",
    features: initial?.features ?? "",
    launchYear: initial?.launchYear ?? "",
    launchMonth: initial?.launchMonth ?? "",
    website: initial?.website ?? "",
    tagIds: initial?.tagIds ?? [],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const set = (k: keyof SolutionFormValues, v: string | string[]) =>
    setValues((p) => ({ ...p, [k]: v }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const payload = {
        initialName: values.initialName,
        initialCompanyId: values.initialCompanyId,
        description: values.description,
        features: values.features,
        launchYear: values.launchYear === "" ? null : values.launchYear,
        launchMonth: values.launchMonth === "" ? null : values.launchMonth,
        website: values.website,
        tagIds: values.tagIds,
      };
      if (solutionId) await api(`/api/solutions/${solutionId}`, "PUT", payload);
      else await api("/api/solutions", "POST", payload);
      router.push(solutionId ? `/solutions/${solutionId}` : "/solutions");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setFieldErrors(err.fields);
      setError(t("genericError"));
    } finally {
      setBusy(false);
    }
  }

  const errCls = (field: string) => (fieldErrors[field] ? "border-destructive" : "");

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-2xl">
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="initialName">{tf("initialName")} *</Label>
        <Input
          id="initialName"
          value={values.initialName}
          onChange={(e) => set("initialName", e.target.value)}
          className={errCls("initialName")}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="initialCompanyId">{tf("initialCompany")} *</Label>
        <select
          id="initialCompanyId"
          className={`border rounded-md bg-background text-foreground px-2 py-2 text-sm w-full ${errCls("initialCompanyId")}`}
          value={values.initialCompanyId}
          onChange={(e) => set("initialCompanyId", e.target.value)}
          required
        >
          <option value="">{tf("none")}</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{tf("initialCompanyHint")}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="launchYear">{tf("launchYear")}</Label>
          <Input
            id="launchYear"
            type="number"
            value={values.launchYear}
            onChange={(e) => set("launchYear", e.target.value)}
            className={errCls("launchYear")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="launchMonth">{tf("launchMonth")}</Label>
          <Input
            id="launchMonth"
            type="number"
            min={1}
            max={12}
            value={values.launchMonth}
            onChange={(e) => set("launchMonth", e.target.value)}
            className={errCls("launchMonth")}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">{tf("description")}</Label>
        <Textarea
          id="description"
          rows={4}
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="features">{tf("features")}</Label>
        <Textarea
          id="features"
          rows={4}
          value={values.features}
          onChange={(e) => set("features", e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="website">{tf("website")}</Label>
        <Input
          id="website"
          type="url"
          placeholder="https://…"
          value={values.website}
          onChange={(e) => set("website", e.target.value)}
          className={errCls("website")}
        />
      </div>

      {/* Tags grouped by family */}
      <div className="space-y-2">
        <Label>{tf("tags")}</Label>
        {TAG_FAMILIES.map((family) => {
          const familyTags = tags.filter((tag) => tag.family === family);
          if (familyTags.length === 0) return null;
          return (
            <div key={family} className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground w-28 shrink-0">
                {tFamilies(family)}
              </span>
              {familyTags.map((tag) => {
                const active = values.tagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() =>
                      set(
                        "tagIds",
                        active
                          ? values.tagIds.filter((x) => x !== tag.id)
                          : [...values.tagIds, tag.id]
                      )
                    }
                  >
                    <Badge variant={active ? "default" : "outline"} className="cursor-pointer">
                      {locale === "fr" ? tag.labelFr : tag.labelEn}
                    </Badge>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? t("saving") : t("save")}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
