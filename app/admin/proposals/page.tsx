// Admin review queue for pending proposals (user submissions + future auto ones).
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { loadMarket } from "@/lib/queries";
import { ProposalsReview, type ReviewProposal } from "@/components/admin/proposals-review";
import { RssAnalyze } from "@/components/admin/rss-analyze";
import { buildProposalDiff } from "@/lib/proposal-diff";

export const dynamic = "force-dynamic";

export default async function AdminProposals() {
  const t = await getTranslations("proposals");
  const market = await loadMarket();

  const [pending, tags] = await Promise.all([
    prisma.proposal.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } }),
    prisma.tag.findMany({ orderBy: { slug: "asc" } }),
  ]);

  const companies = [...market.companies]
    .map((c) => ({ id: c.id, label: c.timeline.currentName }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const solutions = [...market.solutions]
    .map((s) => ({ id: s.id, label: s.timeline.currentName }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const proposals: ReviewProposal[] = await Promise.all(
    pending.map(async (p) => {
      const payload = safeParse(p.payload);
      const diff = await buildProposalDiff({ entityType: p.entityType, kind: p.kind, targetId: p.targetId, payload }).catch(() => null);
      return {
        id: p.id,
        kind: p.kind,
        entityType: p.entityType,
        targetId: p.targetId,
        payload,
        note: p.note,
        origin: p.origin,
        sourceIp: p.sourceIp,
        createdAt: p.createdAt.toISOString(),
        diff,
      };
    })
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold">{t("reviewTitle")}</h1>
        <span className="text-sm text-muted-foreground">({proposals.length})</span>
      </div>
      <RssAnalyze />
      <ProposalsReview
        proposals={proposals}
        companies={companies}
        solutions={solutions}
        tags={tags}
        emptyLabel={t("reviewEmpty")}
      />
    </div>
  );
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
