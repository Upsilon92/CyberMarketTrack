import { getTranslations } from "next-intl/server";
import { BackupManager } from "@/components/admin/backup-manager";

export const dynamic = "force-dynamic";

export default async function AdminBackup() {
  const t = await getTranslations("admin");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("backup")}</h1>
      <BackupManager />
    </div>
  );
}
