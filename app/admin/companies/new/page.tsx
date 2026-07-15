import { getTranslations } from "next-intl/server";
import { CompanyForm } from "@/components/admin/company-form";

export const dynamic = "force-dynamic";

export default async function NewCompanyPage() {
  const t = await getTranslations("admin");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("newCompany")}</h1>
      <CompanyForm />
    </div>
  );
}
