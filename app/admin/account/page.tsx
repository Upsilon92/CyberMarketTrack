// Admin account settings: change your own password.
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "@/components/admin/change-password-form";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const t = await getTranslations("admin.accountPage");
  const session = await auth();

  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        {session?.user?.name && (
          <p className="text-sm text-muted-foreground">
            {t("signedInAs", { username: session.user.name })}
          </p>
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("changePassword")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
