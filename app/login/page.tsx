// Login page — Auth.js credentials sign-in through a server action.
// Rate limiting happens inside authorize() (lib/auth.ts).
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { SetupForm } from "@/components/setup-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl = "/admin", error } = await searchParams;
  const t = await getTranslations("login");
  const tSetup = await getTranslations("setup");

  // Already signed in? Straight to the admin.
  const session = await auth();
  if (session?.user) redirect(callbackUrl.startsWith("/") ? callbackUrl : "/admin");

  // First run: no admin exists yet -> show the account-creation form instead of
  // the login form (no default password is ever shipped).
  const needsSetup = (await prisma.user.count()) === 0;

  async function doLogin(formData: FormData) {
    "use server";
    const target = formData.get("callbackUrl")?.toString() ?? "/admin";
    try {
      await signIn("credentials", {
        username: formData.get("username"),
        password: formData.get("password"),
        redirectTo: target.startsWith("/") ? target : "/admin",
      });
    } catch (e) {
      // signIn throws NEXT_REDIRECT on success — let it through
      if (e instanceof AuthError) {
        redirect(`/login?error=1&callbackUrl=${encodeURIComponent(target)}`);
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
          {needsSetup && <SetupForm />}
          {!needsSetup && (
          <form action={doLogin} className="space-y-4">
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {t("error")}
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="username">{t("username")}</Label>
              <Input id="username" name="username" autoComplete="username" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t("password")}</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            <Button type="submit" className="w-full">
              {t("submit")}
            </Button>
          </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
