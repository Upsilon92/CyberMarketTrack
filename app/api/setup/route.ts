// First-run admin setup: POST creates the SINGLE admin account, but ONLY while
// no user exists yet. This replaces the old "default password" bootstrap — the
// deployer sets the password themselves on first visit, so nothing secret is
// ever shipped in the repo. Once an admin exists, this endpoint is inert (409).
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { setupSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { validationError, serverError } from "@/lib/api-utils";

export async function POST(req: NextRequest) {
  try {
    // First-run only. Guards against anyone re-creating/resetting the admin.
    if ((await prisma.user.count()) > 0) {
      return NextResponse.json(
        { error: "Setup already completed", code: "alreadyDone" },
        { status: 409 }
      );
    }

    const parsed = setupSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);
    const { username, password } = parsed.data;

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: await bcrypt.hash(password, 12),
        role: "ADMIN",
      },
    });

    await logAudit({
      userId: user.id,
      action: "CREATE",
      entityType: "User",
      entityId: user.id,
      summary: `Compte administrateur initialisé (${username})`,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
