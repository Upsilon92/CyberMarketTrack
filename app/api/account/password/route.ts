// PUT changes the signed-in admin's own password. The current password is
// re-verified server-side (never trust the client / the session alone), the new
// one is validated by Zod (min length) and stored as a fresh bcrypt hash.
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { passwordChangeSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { requireAdmin, unauthorized, validationError, serverError } from "@/lib/api-utils";

export async function PUT(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    const parsed = passwordChangeSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed.error);
    const { currentPassword, newPassword } = parsed.data;

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) return unauthorized();

    // Re-verify the current password before allowing the change.
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Wrong current password", fields: { currentPassword: "wrongPassword" } },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 12) },
    });

    await logAudit({
      userId: user.id,
      action: "UPDATE",
      entityType: "User",
      entityId: user.id,
      summary: `Changement du mot de passe de ${user.username}`,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
