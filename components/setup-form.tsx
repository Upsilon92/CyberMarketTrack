"use client";

// First-run admin account creation. Shown on /login when no admin exists yet.
// On success the page re-renders (a user now exists) and the normal login form
// appears, where the user signs in with the credentials they just chose.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SetupForm() {
  const t = useTranslations("setup");
  const router = useRouter();
  const [values, setValues] = useState({ username: "admin", password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof values, v: string) => setValues((p) => ({ ...p, [k]: v }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (values.password !== values.confirm) {
      setError(t("mismatch"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: values.username, password: values.password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = data.fields?.password ?? data.fields?.username ?? data.code;
        setError(
          code === "tooShort"
            ? t("tooShort")
            : code === "usernameTooShort"
              ? t("usernameTooShort")
              : code === "alreadyDone"
                ? t("alreadyDone")
                : t("error")
        );
        setBusy(false);
        return;
      }
      setDone(true);
      // A user now exists: re-render so the normal login form is shown.
      router.refresh();
    } catch {
      setError(t("error"));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400" role="status">
          {t("done")}
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="username">{t("username")}</Label>
        <Input
          id="username"
          value={values.username}
          onChange={(e) => set("username", e.target.value)}
          autoComplete="username"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">{t("password")}</Label>
        <Input
          id="password"
          type="password"
          value={values.password}
          onChange={(e) => set("password", e.target.value)}
          autoComplete="new-password"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">{t("confirm")}</Label>
        <Input
          id="confirm"
          type="password"
          value={values.confirm}
          onChange={(e) => set("confirm", e.target.value)}
          autoComplete="new-password"
          required
        />
      </div>
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
      <Button type="submit" className="w-full" disabled={busy || done}>
        {busy ? t("creating") : t("submit")}
      </Button>
    </form>
  );
}
