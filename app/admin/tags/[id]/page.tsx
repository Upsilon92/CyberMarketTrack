// Edit a tag (reached by clicking a tag on /tags). Includes a Delete button.
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TagForm } from "@/components/admin/tag-form";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EditTagPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("admin");
  const tag = await prisma.tag.findUnique({ where: { id } });
  if (!tag) notFound();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">
        {t("edit")} — {tag.labelFr}
      </h1>
      <TagForm
        tagId={tag.id}
        initial={{
          slug: tag.slug,
          family: tag.family,
          labelFr: tag.labelFr,
          labelEn: tag.labelEn,
          descriptionFr: tag.descriptionFr ?? "",
          descriptionEn: tag.descriptionEn ?? "",
          category: tag.category ?? "",
        }}
      />
    </div>
  );
}
