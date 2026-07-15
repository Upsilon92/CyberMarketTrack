import { getTranslations } from "next-intl/server";
import { CsvImport } from "@/components/admin/csv-import";

export const dynamic = "force-dynamic";

export default async function AdminImport() {
  const t = await getTranslations("admin.importPage");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("title")}</h1>
      <CsvImport />
    </div>
  );
}
