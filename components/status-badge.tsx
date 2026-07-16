// Colored badge for a derived company status.
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import type { CompanyStatus } from "@/lib/constants";

const STATUS_STYLES: Record<CompanyStatus, string> = {
  INDEPENDENT: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  INVESTOR_OWNED: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  INVESTOR_UNKNOWN: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-300",
  SUBSIDIARY: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  ABSORBED: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  MERGED: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  DEFUNCT: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export async function StatusBadge({ status }: { status: CompanyStatus }) {
  const t = await getTranslations("statuses");
  return (
    <Badge variant="secondary" className={STATUS_STYLES[status]}>
      {t(status)}
    </Badge>
  );
}
