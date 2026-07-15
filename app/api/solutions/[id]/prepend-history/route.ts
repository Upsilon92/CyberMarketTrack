// =============================================================================
// "Add an earlier past" assistant (spec: ingest history a posteriori).
//
// A solution's anchor fields (initialName, initialCompanyId, launch date) are
// the START of its derived chains. When the user later learns the solution
// existed EARLIER under another name and/or another vendor, this endpoint:
//   1. moves the anchor back to those older values, and
//   2. creates the SOLUTION_RENAME / SOLUTION_TRANSFER events at the change
//      date so the (previously initial) values become a derived period.
//
// The whole thing is one transaction: anchor + events move together or not at
// all. Coherence is checked with the same pure validators as manual entry.
// =============================================================================
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { validateSolutionEvents, type TimelineEventInput } from "@/lib/timeline";
import { yearSchema, monthSchema } from "@/lib/validation";
import {
  requireAdmin,
  unauthorized,
  notFound,
  validationError,
  coherenceError,
  serverError,
} from "@/lib/api-utils";

const prependSchema = z
  .object({
    previousName: z.string().trim().max(200).optional().or(z.literal("").transform(() => undefined)),
    previousVendorId: z.string().optional().or(z.literal("").transform(() => undefined)),
    changeYear: yearSchema,
    changeMonth: monthSchema,
    newLaunchYear: yearSchema.nullable().optional(),
    newLaunchMonth: monthSchema,
  })
  .refine((v) => v.previousName || v.previousVendorId, {
    message: "atLeastOne",
    path: ["previousName"],
  });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    const { id } = await ctx.params;
    const solution = await prisma.solution.findUnique({
      where: { id },
      include: { events: true },
    });
    if (!solution) return notFound();

    const parsed = prependSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);
    const { previousName, previousVendorId, changeYear, changeMonth, newLaunchYear, newLaunchMonth } =
      parsed.data;

    // Current anchor values become a derived period starting at the change date.
    const curName = solution.initialName;
    const curVendor = solution.initialCompanyId;

    // Verify the referenced previous vendor exists.
    if (previousVendorId) {
      const vendor = await prisma.company.findUnique({ where: { id: previousVendorId } });
      if (!vendor) return notFound();
    }

    // New anchor = the older values (fall back to current when not provided).
    const newInitialName = previousName ?? curName;
    const newInitialCompanyId = previousVendorId ?? curVendor;
    const newLaunch =
      newLaunchYear != null
        ? { launchYear: newLaunchYear, launchMonth: newLaunchMonth ?? null }
        : { launchYear: solution.launchYear, launchMonth: solution.launchMonth };

    // Events to inject at the change date.
    const toCreate: {
      type: "SOLUTION_RENAME" | "SOLUTION_TRANSFER";
      year: number;
      month: number | null;
      newName?: string;
      newOwnerCompanyId?: string;
      subjectSolutionId: string;
    }[] = [];
    if (previousName && previousName !== curName) {
      toCreate.push({
        type: "SOLUTION_RENAME",
        year: changeYear,
        month: changeMonth ?? null,
        newName: curName,
        subjectSolutionId: id,
      });
    }
    if (previousVendorId && previousVendorId !== curVendor) {
      toCreate.push({
        type: "SOLUTION_TRANSFER",
        year: changeYear,
        month: changeMonth ?? null,
        newOwnerCompanyId: curVendor,
        subjectSolutionId: id,
      });
    }
    if (toCreate.length === 0) {
      // Nothing to derive (e.g. previous values equal current): just move launch.
      return NextResponse.json({ ok: true, created: 0 });
    }

    // Coherence check against the FUTURE state (new anchor + existing + new events).
    const futureEvents: TimelineEventInput[] = [
      ...solution.events,
      ...toCreate.map((e, i) => ({ id: `__new${i}__`, ...e })),
    ];
    const issues = validateSolutionEvents(
      { id, initialName: newInitialName, initialCompanyId: newInitialCompanyId, ...newLaunch },
      futureEvents
    );
    const blocking = issues.filter((iss) => iss.level === "error");
    if (blocking.length > 0) return coherenceError(blocking.map((iss) => iss.code));

    // Atomic: move the anchor and create the events together.
    await prisma.$transaction([
      prisma.solution.update({
        where: { id },
        data: { initialName: newInitialName, initialCompanyId: newInitialCompanyId, ...newLaunch },
      }),
      ...toCreate.map((e) => prisma.event.create({ data: e })),
    ]);

    await logAudit({
      userId: session.user.id,
      action: "UPDATE",
      entityType: "Solution",
      entityId: id,
      summary: `Ajout d'un historique antérieur à ${curName} (ancre → ${newInitialName}, ${toCreate.length} événement(s))`,
    });

    return NextResponse.json({ ok: true, created: toCreate.length });
  } catch (e) {
    return serverError(e);
  }
}
