"use client";

// Login form with a precise error message: unknown username, wrong password
// (with the attempts left), or too many attempts (live countdown; the submit
// button stays disabled until a new attempt is allowed).
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type LoginErrorKind = "unknownUser" | "badPassword" | "rateLimited" | "generic";

export function LoginForm({
  action,
  callbackUrl,
  error,
  retryAfter,
  remaining,
}: {
  action: (formData: FormData) => Promise<void>;
  callbackUrl: string;
  error: LoginErrorKind | null;
  retryAfter: number;
  remaining: number | null;
}) {
  const t = useTranslations("login");
  const [left, setLeft] = useState(error === "rateLimited" ? retryAfter : 0);

  useEffect(() => {
    if (error !== "rateLimited" || retryAfter <= 0) return;
    const deadline = Date.now() + retryAfter * 1000;
    setLeft(retryAfter);
    const id = setInterval(() => {
      const s = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [error, retryAfter]);

  const blocked = error === "rateLimited" && left > 0;

  let message: React.ReactNode = null;
  if (error === "unknownUser" || error === "badPassword") {
    message = (
      <>
        {t(error === "unknownUser" ? "errorUnknownUser" : "errorBadPassword")}
        {remaining !== null && (
          <span className="block text-xs mt-0.5 opacity-90">
            {remaining > 0 ? t("attemptsLeft", { n: remaining }) : t("nextAttemptBlocked")}
          </span>
        )}
      </>
    );
  } else if (error === "rateLimited") {
    message = blocked ? t("errorRateLimited", { seconds: left }) : t("retryNow");
  } else if (error === "generic") {
    message = t("error");
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      {message && (
        <div
          role="alert"
          aria-live="polite"
          className={`rounded-md border px-3 py-2 text-sm ${
            error === "rateLimited" && !blocked
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          {message}
          {blocked && (
            <span className="mt-2 block h-1 rounded-full bg-destructive/15 overflow-hidden">
              <span
                className="block h-full bg-destructive/60 transition-[width] duration-300"
                style={{ width: `${retryAfter > 0 ? (left / retryAfter) * 100 : 0}%` }}
              />
            </span>
          )}
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="username">{t("username")}</Label>
        <Input id="username" name="username" autoComplete="username" required maxLength={100} aria-invalid={error === "unknownUser"} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">{t("password")}</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required maxLength={200} aria-invalid={error === "badPassword"} />
      </div>
      <SubmitButton blocked={blocked} label={blocked ? t("waitSeconds", { seconds: left }) : t("submit")} />
    </form>
  );
}

/** Disabled while the sign-in request is in flight (form status) or blocked. */
function SubmitButton({ blocked, label }: { blocked: boolean; label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={blocked || pending} aria-disabled={blocked || pending}>
      {label}
    </Button>
  );
}
