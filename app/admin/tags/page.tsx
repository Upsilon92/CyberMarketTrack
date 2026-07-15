import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { TagManager } from "@/components/admin/tag-manager";

export const dynamic = "force-dynamic";

export default async function AdminTags() {
  const t = await getTranslations("admin");
  const tags = await prisma.tag.findMany({ orderBy: { slug: "asc" } });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("tags")}</h1>
      <TagManager tags={tags} />
    </div>
  );
}
