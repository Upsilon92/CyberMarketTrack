"use client";

// Company create/edit form. Zod validation happens server-side (the API is
// the source of truth); the form surfaces per-field errors returned by it.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { api, ApiError } from "@/components/admin/api";
import { COMPANY_TYPES } from "@/lib/constants";

export interface CompanyFormValues {
  initialName: string;
  types: string[];
  foundedYear: string;
  foundedMonth: string;
  country: string;
  originCountry: string;
  description: string;
  website: string;
  logoUrl: string;
}

export function CompanyForm({
  companyId,
  initial,
}: {
  companyId?: string; // undefined = create
  initial?: Partial<CompanyFormValues>;
}) {
  const router = useRouter();
  const t = useTranslations("admin");
  const tf = useTranslations("admin.fields");
  const tTypes = useTranslations("companyTypes");

  const [values, setValues] = useState<CompanyFormValues>({
    initialName: initial?.initialName ?? "",
    types: initial?.types ?? [],
    foundedYear: initial?.foundedYear ?? "",
    foundedMonth: initial?.foundedMonth ?? "",
    country: initial?.country ?? "",
    originCountry: initial?.originCountry ?? "",
    description: initial?.description ?? "",
    website: initial?.website ?? "",
    logoUrl: initial?.logoUrl ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const set = (k: keyof CompanyFormValues, v: string | string[]) =>
    setValues((p) => ({ ...p, [k]: v }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const payload = {
        initialName: values.initialName,
        types: values.types,
        foundedYear: values.foundedYear,
        foundedMonth: values.foundedMonth === "" ? null : values.foundedMonth,
        country: values.country,
        originCountry: values.originCountry === "" ? null : values.originCountry,
        description: values.description,
        website: values.website,
        logoUrl: values.logoUrl,
      };
      if (companyId) await api(`/api/companies/${companyId}`, "PUT", payload);
      else await api("/api/companies", "POST", payload);
      router.push("/admin/companies");
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
        <p className="text-xs text-muted-foreground">{tf("initialNameHint")}</p>
      </div>

      <div className="space-y-1.5">
        <Label>{tf("types")} *</Label>
        <div className="flex flex-wrap gap-4">
          {COMPANY_TYPES.map((ct) => (
            <label key={ct} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={values.types.includes(ct)}
                onCheckedChange={(checked) =>
                  set(
                    "types",
                    checked ? [...values.types, ct] : values.types.filter((x) => x !== ct)
                  )
                }
              />
              {tTypes(ct)}
            </label>
          ))}
        </div>
        {fieldErrors["types"] && <p className="text-xs text-destructive">{t("genericError")}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="foundedYear">{tf("foundedYear")} *</Label>
          <Input
            id="foundedYear"
            type="number"
            value={values.foundedYear}
            onChange={(e) => set("foundedYear", e.target.value)}
            className={errCls("foundedYear")}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="foundedMonth">{tf("foundedMonth")}</Label>
          <Input
            id="foundedMonth"
            type="number"
            min={1}
            max={12}
            value={values.foundedMonth}
            onChange={(e) => set("foundedMonth", e.target.value)}
            className={errCls("foundedMonth")}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="country">{tf("country")} *</Label>
          <Input
            id="country"
            maxLength={2}
            placeholder="FR"
            value={values.country}
            onChange={(e) => set("country", e.target.value.toUpperCase())}
            className={errCls("country")}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="originCountry">{tf("originCountry")}</Label>
          <Input
            id="originCountry"
            maxLength={2}
            value={values.originCountry}
            onChange={(e) => set("originCountry", e.target.value.toUpperCase())}
            className={errCls("originCountry")}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">{tf("description")}</Label>
        <Textarea
          id="description"
          rows={5}
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
          className={errCls("description")}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
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
        <div className="space-y-1.5">
          <Label htmlFor="logoUrl">{tf("logoUrl")}</Label>
          <Input
            id="logoUrl"
            type="url"
            value={values.logoUrl}
            onChange={(e) => set("logoUrl", e.target.value)}
            className={errCls("logoUrl")}
          />
        </div>
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
