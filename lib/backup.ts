// =============================================================================
// Full-database JSON export / restore (spec F4).
//
// Export format (documented in ARCHITECTURE.md):
//   { "version": 1, "exportedAt": ISO, "tables": { ... } }
// The solution<->tag many-to-many is flattened into `solutionTags` pairs.
//
// Restore performs a STRICT Zod validation of the whole file, then wipes and
// re-inserts everything in dependency order inside a single transaction:
// either the whole restore succeeds, or nothing changes.
// =============================================================================
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const BACKUP_VERSION = 1;

// --- Export ---------------------------------------------------------------------

export async function exportDatabase() {
  const [
    users,
    tags,
    companies,
    companyTypes,
    solutions,
    events,
    revenues,
    aliases,
    comparators,
    auditLogs,
  ] = await Promise.all([
    prisma.user.findMany(),
    prisma.tag.findMany(),
    prisma.company.findMany(),
    prisma.companyTypeAssignment.findMany(),
    prisma.solution.findMany({ include: { tags: { select: { id: true } } } }),
    prisma.event.findMany(),
    prisma.revenue.findMany(),
    prisma.alias.findMany(),
    prisma.comparator.findMany(),
    prisma.auditLog.findMany(),
  ]);

  const solutionTags = solutions.flatMap((s) => s.tags.map((t) => ({ solutionId: s.id, tagId: t.id })));
  const plainSolutions = solutions.map(({ tags: _tags, ...s }) => s);

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables: {
      users,
      tags,
      companies,
      companyTypes,
      solutions: plainSolutions,
      solutionTags,
      events,
      revenues,
      aliases,
      comparators,
      auditLogs,
    },
  };
}

// --- Restore validation schema ------------------------------------------------------

const dateLike = z.coerce.date();
const id = z.string().min(1).max(100);

const userSchema = z.object({
  id,
  username: z.string().max(200),
  passwordHash: z.string().max(500),
  role: z.string().max(50),
  createdAt: dateLike,
});

const tagSchema = z.object({
  id,
  slug: z.string().max(100),
  family: z.string().max(50),
  labelFr: z.string().max(200),
  labelEn: z.string().max(200),
  descriptionFr: z.string().max(1000).nullable().optional(),
  descriptionEn: z.string().max(1000).nullable().optional(),
  category: z.string().max(50).nullable(),
});

const companySchema = z.object({
  id,
  initialName: z.string().max(300),
  foundedYear: z.number().int(),
  foundedMonth: z.number().int().nullable(),
  country: z.string().max(2),
  originCountry: z.string().max(2).nullable(),
  description: z.string().max(50_000).nullable(),
  website: z.string().max(500).nullable(),
  // Uploaded logos are stored as data URIs (base64), so this can be large:
  // the upload cap is 512 KB, which is ~700 K chars once base64-encoded.
  // A 500-char limit here would reject any export containing an uploaded logo.
  logoUrl: z.string().max(2_000_000).nullable(),
  createdAt: dateLike,
  updatedAt: dateLike,
});

const companyTypeSchema = z.object({ id, type: z.string().max(50), companyId: id });

const solutionSchema = z.object({
  id,
  initialName: z.string().max(300),
  initialCompanyId: id,
  description: z.string().max(50_000).nullable(),
  features: z.string().max(50_000).nullable(),
  launchYear: z.number().int().nullable(),
  launchMonth: z.number().int().nullable(),
  website: z.string().max(500).nullable(),
  createdAt: dateLike,
  updatedAt: dateLike,
});

const solutionTagSchema = z.object({ solutionId: id, tagId: id });

const eventSchema = z.object({
  id,
  type: z.string().max(50),
  year: z.number().int(),
  month: z.number().int().nullable(),
  importance: z.string().max(20).optional().default("MEDIUM"),
  description: z.string().max(50_000).nullable(),
  subjectCompanyId: id.nullable(),
  subjectSolutionId: id.nullable(),
  newName: z.string().max(300).nullable(),
  acquirerCompanyId: id.nullable(),
  acquirerNameRaw: z.string().max(300).nullable(),
  outcome: z.string().max(50).nullable(),
  withCompanyId: id.nullable(),
  newOwnerCompanyId: id.nullable(),
  intoSolutionId: id.nullable(),
  amount: z.number().nullable(),
  round: z.string().max(100).nullable(),
  note: z.string().max(1000).nullable(),
  createdAt: dateLike,
  updatedAt: dateLike,
});

const revenueSchema = z.object({
  id,
  companyId: id,
  year: z.number().int(),
  amount: z.number(),
  currency: z.string().max(3),
  source: z.string().max(500).nullable(),
});

const aliasSchema = z.object({
  id,
  name: z.string().max(300),
  companyId: id.nullable(),
  solutionId: id.nullable(),
});

const comparatorSchema = z.object({
  id,
  name: z.string().max(300),
  content: z.string().max(2_000_000),
  createdAt: dateLike,
  updatedAt: dateLike,
});

const auditLogSchema = z.object({
  id,
  timestamp: dateLike,
  userId: z.string().max(100).nullable(),
  action: z.string().max(50),
  entityType: z.string().max(100),
  entityId: z.string().max(100),
  summary: z.string().max(2000),
});

export const backupFileSchema = z.object({
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string(),
  tables: z.object({
    users: z.array(userSchema).max(1000),
    tags: z.array(tagSchema).max(10_000),
    companies: z.array(companySchema).max(100_000),
    companyTypes: z.array(companyTypeSchema).max(300_000),
    solutions: z.array(solutionSchema).max(100_000),
    solutionTags: z.array(solutionTagSchema).max(1_000_000),
    events: z.array(eventSchema).max(1_000_000),
    revenues: z.array(revenueSchema).max(1_000_000),
    aliases: z.array(aliasSchema).max(100_000),
    comparators: z.array(comparatorSchema).max(10_000),
    auditLogs: z.array(auditLogSchema).max(1_000_000),
  }),
});
export type BackupFile = z.infer<typeof backupFileSchema>;

// --- Restore --------------------------------------------------------------------------

/** Wipes everything and re-inserts the backup, atomically. */
export async function restoreDatabase(backup: BackupFile) {
  const t = backup.tables;
  await prisma.$transaction(async (tx) => {
    // Delete in reverse dependency order
    await tx.auditLog.deleteMany();
    await tx.event.deleteMany();
    await tx.alias.deleteMany();
    await tx.revenue.deleteMany();
    await tx.solution.deleteMany();
    await tx.companyTypeAssignment.deleteMany();
    await tx.company.deleteMany();
    await tx.tag.deleteMany();
    await tx.comparator.deleteMany();
    await tx.user.deleteMany();

    // Insert in dependency order
    if (t.users.length) await tx.user.createMany({ data: t.users });
    if (t.tags.length) await tx.tag.createMany({ data: t.tags });
    if (t.companies.length) await tx.company.createMany({ data: t.companies });
    if (t.companyTypes.length) await tx.companyTypeAssignment.createMany({ data: t.companyTypes });
    if (t.solutions.length) await tx.solution.createMany({ data: t.solutions });
    for (const st of t.solutionTags) {
      await tx.solution.update({
        where: { id: st.solutionId },
        data: { tags: { connect: { id: st.tagId } } },
      });
    }
    if (t.events.length) await tx.event.createMany({ data: t.events });
    if (t.revenues.length) await tx.revenue.createMany({ data: t.revenues });
    if (t.aliases.length) await tx.alias.createMany({ data: t.aliases });
    if (t.comparators.length) await tx.comparator.createMany({ data: t.comparators });
    if (t.auditLogs.length) await tx.auditLog.createMany({ data: t.auditLogs });
  });
}
