"use client";

// Change-password form for the signed-in admin. Validation is enforced
// server-side (PUT /api/account/password); this surfaces per-field errors it
// returns, translated via the admin.account namespace.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/components/admin/api";

type Field = "currentPassword" | "newPassword" | "confirmPassword";

export function ChangePasswordForm() {
  const t = useTranslations("admin.accountPage");
  const [values, setValues] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});

  const set = (k: Field, v: string) => {
    setValues((p) => ({ ...p, [k]: v }));
    setDone(false);
  };

  // Maps a server error code to a translated message (falls back to generic).
  const fieldMessage = (code?: string) =>
    code && t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    setDone(false);
    try {
      await api("/api/account/password", "PUT", values);
      setDone(true);
      setValues({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        const fe: Partial<Record<Field, string>> = {};
        for (const [k, code] of Object.entries(err.fields)) {
          fe[k as Field] = fieldMessage(code);
        }
        setFieldErrors(fe);
      } else {
        setError(t("errors.generic"));
      }
    } finally {
      setBusy(false);
    }
  }

  const rows: { key: Field; label: string; autoComplete: string }[] = [
    { key: "currentPassword", label: t("current"), autoComplete: "current-password" },
    { key: "newPassword", label: t("new"), autoComplete: "new-password" },
    { key: "confirmPassword", label: t("confirm"), autoComplete: "new-password" },
  ];

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-sm">
      {done && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400" role="status">
          {t("success")}
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {rows.map((r) => (
        <div key={r.key} className="space-y-1.5">
          <Label htmlFor={r.key}>{r.label}</Label>
          <Input
            id={r.key}
            type="password"
            autoComplete={r.autoComplete}
            value={values[r.key]}
            onChange={(e) => set(r.key, e.target.value)}
            className={fieldErrors[r.key] ? "border-destructive" : ""}
            required
          />
          {fieldErrors[r.key] && <p className="text-xs text-destructive">{fieldErrors[r.key]}</p>}
        </div>
      ))}
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
      <Button type="submit" disabled={busy}>
        {busy ? t("saving") : t("submit")}
      </Button>
    </form>
  );
}
