// POST a proposed change (public, no admin session). Rate-limited to 10 per
// source IP / 24h. Nothing is applied to the base — the proposal is stored
// PENDING for admin review. The middleware exempts this path (see proxy.ts).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { proposalSubmitSchema } from "@/lib/validation";
import { validationError, serverError } from "@/lib/api-utils";
import {
  clientIp,
  countRecentProposalsFromIp,
  validateProposalPayload,
  PROPOSAL_MAX_PER_IP,
} from "@/lib/proposals";

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    const envelope = proposalSubmitSchema.safeParse(await req.json());
    if (!envelope.success) return validationError(envelope.error);
    const { kind, entityType, targetId, note } = envelope.data;

    if (kind === "UPDATE" && !targetId) {
      return NextResponse.json({ error: "targetId required", code: "noTarget" }, { status: 400 });
    }

    // Rate limit per source IP.
    if ((await countRecentProposalsFromIp(ip)) >= PROPOSAL_MAX_PER_IP) {
      return NextResponse.json({ error: "Too many proposals", code: "rateLimited" }, { status: 429 });
    }

    // Validate the payload against the entity's own schema.
    const payloadParsed = validateProposalPayload(entityType, envelope.data.payload);
    if (!payloadParsed.success) return validationError(payloadParsed.error);

    const created = await prisma.proposal.create({
      data: {
        kind,
        entityType,
        targetId: targetId ?? null,
        payload: JSON.stringify(payloadParsed.data),
        note: note ?? null,
        origin: "USER",
        status: "PENDING",
        sourceIp: ip,
      },
    });

    return NextResponse.json({ ok: true, id: created.id }, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
