// Admin companies list: derived current name + actions.
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DeleteButton } from "@/components/admin/delete-button";
import { StatusBadge } from "@/components/status-badge";
import { CompanyLogo } from "@/components/company-logo";
import { loadMarket, isStale } from "@/lib/queries";
import type { CompanyStatus } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function AdminCompanies() {
  const t = await getTranslations("admin");
  const tCommon = await getTranslations("common");
  const market = await loadMarket();
  const list = [...market.companies].sort((a, b) =>
    a.timeline.currentName.localeCompare(b.timeline.currentName)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("companies")}</h1>
        <Link href="/admin/companies/new">
          <Button>{t("newCompany")}</Button>
        </Link>
      </div>

      <div className="divide-y border rounded-md">
        {list.map((c) => (
          <div key={c.id} className="p-3 flex flex-wrap items-center gap-2 text-sm">
            <CompanyLogo name={c.timeline.currentName} logoUrl={c.logoUrl} width={56} height={30} />
            <span className="font-medium">{c.timeline.currentName}</span>
            {c.timeline.currentName !== c.initialName && (
              <span className="text-xs text-muted-foreground">({c.initialName})</span>
            )}
            <StatusBadge status={c.timeline.currentStatus as CompanyStatus} />
            {isStale(c.updatedAt) && (
              <Badge variant="destructive" className="text-[10px]">
                {tCommon("toRecheck")}
              </Badge>
            )}
            <span className="ml-auto flex gap-1.5">
              <Link href={`/admin/companies/${c.id}`}>
                <Button size="sm" variant="outline">
                  {t("edit")}
                </Button>
              </Link>
              <Link href={`/admin/companies/${c.id}/history`}>
                <Button size="sm" variant="outline">
                  {t("history")}
                </Button>
              </Link>
              <DeleteButton path={`/api/companies/${c.id}`} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
