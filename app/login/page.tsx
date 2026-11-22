// Login page — Auth.js credentials sign-in through a server action.
// Rate limiting and the typed failure reasons live in authorize() (lib/auth.ts).
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthError } from "next-auth";
import { auth, signIn, LoginError, LOGIN_MAX_PER_USER, LOGIN_WINDOW_MS } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { SetupForm } from "@/components/setup-form";
import { LoginForm, type LoginErrorKind } from "@/components/login-form";

export const dynamic = "force-dynamic";

const KINDS = new Set<LoginErrorKind>(["unknownUser", "badPassword", "rateLimited", "generic"]);
/** Only same-site relative paths (no "//host" or "/\host" open redirects). */
const safeTarget = (v: string | undefined | null) =>
  v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/admin";
const intIn = (v: string | undefined, min: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string; retry?: string; left?: string; t?: string }>;
}) {
  const sp = await searchParams;
  const callbackUrl = safeTarget(sp.callbackUrl);
  const t = await getTranslations("login");
  const tSetup = await getTranslations("setup");

  // Already signed in? Straight to the admin.
  const session = await auth();
  if (session?.user) redirect(callbackUrl);

  // First run: no admin exists yet -> show the account-creation form instead of
  // the login form (no default password is ever shipped).
  const needsSetup = (await prisma.user.count()) === 0;

  // Every query parameter is validated: the page never echoes raw input.
  const error: LoginErrorKind | null = sp.error
    ? KINDS.has(sp.error as LoginErrorKind)
      ? (sp.error as LoginErrorKind)
      : "generic"
    : null;
  const retryAfter = intIn(sp.retry, 0, Math.ceil(LOGIN_WINDOW_MS / 1000)) ?? 0;
  const remaining = intIn(sp.left, 0, LOGIN_MAX_PER_USER);

  async function doLogin(formData: FormData) {
    "use server";
    const target = safeTarget(formData.get("callbackUrl")?.toString());
    try {
      await signIn("credentials", {
        username: formData.get("username"),
        password: formData.get("password"),
        redirectTo: target,
      });
    } catch (e) {
      // signIn throws NEXT_REDIRECT on success — let it through
      if (e instanceof AuthError) {
        // "t" = attempt nonce: remounts the form so each failure resets its state
        const qs = new URLSearchParams({ callbackUrl: target, t: Date.now().toString(36) });
        if (e instanceof LoginError) {
          qs.set("error", e.code);
          if (e.code === "rateLimited") qs.set("retry", String(e.retryAfter));
          else qs.set("left", String(e.remaining));
        } else qs.set("error", "generic");
        redirect(`/login?${qs}`);
      }
      throw e;
    }
  }

  return (
    <div className="flex justify-center pt-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{needsSetup ? tSetup("title") : t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {needsSetup ? (
            <SetupForm />
          ) : (
            <LoginForm key={sp.t && /^[a-z0-9]{1,12}$/.test(sp.t) ? sp.t : "0"} action={doLogin} callbackUrl={callbackUrl} error={error} retryAfter={retryAfter} remaining={remaining} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
