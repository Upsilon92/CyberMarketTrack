// Company edit page: intrinsic fields + revenues + aliases. History has its
// own dedicated editor (no period editing anywhere — periods are derived).
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { CompanyForm } from "@/components/admin/company-form";
import { RevenueManager } from "@/components/admin/revenue-manager";
import { AliasManager } from "@/components/admin/alias-manager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function EditCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("admin");
  const company = await prisma.company.findUnique({
    where: { id },
    include: { types: true, revenues: { orderBy: { year: "asc" } }, aliases: true },
  });
  if (!company) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">
          {t("edit")} — {company.initialName}
        </h1>
        <Link href={`/admin/companies/${id}/history`}>
          <Button variant="outline">{t("history")}</Button>
        </Link>
      </div>

      <CompanyForm
        companyId={id}
        initial={{
          initialName: company.initialName,
          types: company.types.map((ct) => ct.type),
          foundedYear: String(company.foundedYear),
          foundedMonth: company.foundedMonth == null ? "" : String(company.foundedMonth),
          country: company.country,
          originCountry: company.originCountry ?? "",
          description: company.description ?? "",
          website: company.website ?? "",
          logoUrl: company.logoUrl ?? "",
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{(await getTranslations("admin.revenues"))("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <RevenueManager companyId={id} revenues={company.revenues} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{(await getTranslations("admin.aliases"))("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <AliasManager companyId={id} aliases={company.aliases} />
        </CardContent>
      </Card>
    </div>
  );
}
