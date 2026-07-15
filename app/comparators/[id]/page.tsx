// Saved comparator: view for everyone, edit for the admin.
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { buildCatalog } from "@/lib/comparator-data";
import { comparatorContentSchema } from "@/lib/comparator";
import { ComparatorEditor } from "@/components/comparator/editor";

export const dynamic = "force-dynamic";

export default async function ComparatorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const comparator = await prisma.comparator.findUnique({ where: { id } });
  if (!comparator) notFound();

  const parsed = comparatorContentSchema.safeParse(JSON.parse(comparator.content));
  if (!parsed.success) notFound(); // corrupted content: never render it

  const session = await auth();
  const canEdit = session?.user?.role === "ADMIN";
  const catalog = await buildCatalog();

  return (
    <ComparatorEditor
      comparatorId={id}
      initialName={comparator.name}
      initialContent={parsed.data}
      catalog={catalog}
      canEdit={canEdit}
    />
  );
}
