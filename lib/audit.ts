// Single audit helper called by every mutation route (spec: AuditLog).
// No triggers, no magic: one explicit call per mutation.
import { prisma } from "@/lib/prisma";
import type { AuditAction } from "@/lib/constants";

export async function logAudit(params: {
  userId: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  summary: string;
}) {
  await prisma.auditLog.create({ data: params });
}
