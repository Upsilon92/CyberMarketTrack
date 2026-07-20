// Create a new tag (reached from the "+ new tag" button on /tags).
import { getTranslations } from "next-intl/server";
import { TagForm } from "@/components/admin/tag-form";

export const dynamic = "force-dynamic";

export default async function NewTagPage() {
  const t = await getTranslations("admin");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("newTag")}</h1>
      <TagForm />
    </div>
  );
}
