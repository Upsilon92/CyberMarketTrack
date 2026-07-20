// Tag badge — each family has a distinct look (spec: "badges visuellement
// distincts" for the three families).
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { TagFamily } from "@/lib/constants";

const FAMILY_STYLES: Record<TagFamily, string> = {
  SOLUTION_TYPE: "bg-primary/10 text-primary border-primary/30",
  CAPABILITY: "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800",
  SCOPE: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800",
};

export function TagBadge({
  tag,
  locale,
  href,
}: {
  tag: {
    slug: string;
    family: string;
    labelFr: string;
    labelEn: string;
    descriptionFr?: string | null;
    descriptionEn?: string | null;
  };
  locale: string;
  /** Override the link target (e.g. the admin edit page). Defaults to /tags#slug. */
  href?: string;
}) {
  const label = locale === "fr" ? tag.labelFr : tag.labelEn;
  const description = locale === "fr" ? tag.descriptionFr : tag.descriptionEn;
  return (
    <Link href={href ?? `/tags#${tag.slug}`} title={description ?? undefined}>
      <Badge
        variant="outline"
        className={`${FAMILY_STYLES[tag.family as TagFamily] ?? ""} ${description ? "cursor-help" : ""}`}
      >
        {label}
        {description && <span className="ml-1 opacity-60">ⓘ</span>}
      </Badge>
    </Link>
  );
}
