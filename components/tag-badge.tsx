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
}: {
  tag: { slug: string; family: string; labelFr: string; labelEn: string };
  locale: string;
}) {
  const label = locale === "fr" ? tag.labelFr : tag.labelEn;
  return (
    <Link href={`/tags#${tag.slug}`}>
      <Badge variant="outline" className={FAMILY_STYLES[tag.family as TagFamily] ?? ""}>
        {label}
      </Badge>
    </Link>
  );
}
