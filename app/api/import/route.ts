// =============================================================================
// CSV bulk import (companies, solutions, tags, events).
//
// - dryRun=true -> preview: full validation + dedup, nothing written
// - per-row Zod validation, entity references resolved by name (current name,
//   any historical name derived from renames, or alias)
// - report: created / skipped (duplicates) / errors with line + reason
// - 1 MB size limit (spec security requirement #10)
// =============================================================================
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseCsv } from "@/lib/csv";
import { logAudit } from "@/lib/audit";
import { loadMarket, type Market } from "@/lib/queries";
import { allNames } from "@/lib/timeline";
import {
  companySchema,
  solutionSchema,
  tagSchema,
  eventSchema,
  revenueSchema,
} from "@/lib/validation";
import { requireAdmin, unauthorized, serverError } from "@/lib/api-utils";

const MAX_SIZE = 1024 * 1024; // 1 MB

const importRequestSchema = z.object({
  type: z.enum(["companies", "solutions", "tags", "events", "revenues"]),
  csv: z.string().min(1).max(MAX_SIZE),
  dryRun: z.boolean().optional().default(false),
});

interface RowResult {
  line: number; // 1-based data line number (excluding header)
  status: "created" | "skipped" | "error";
  label: string;
  reason?: string;
}

/** name (lowercased) -> company id, covering current/historical names + aliases */
function companyNameIndex(market: Market): Map<string, string> {
  const index = new Map<string, string>();
  for (const c of market.companies) {
    for (const n of allNames(c.timeline)) index.set(n.toLowerCase(), c.id);
    for (const a of c.aliases) index.set(a.name.toLowerCase(), c.id);
  }
  return index;
}

function solutionNameIndex(market: Market): Map<string, string> {
  const index = new Map<string, string>();
  for (const s of market.solutions) {
    for (const n of allNames(s.timeline)) index.set(n.toLowerCase(), s.id);
    for (const a of s.aliases) index.set(a.name.toLowerCase(), s.id);
  }
  return index;
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return unauthorized();

  try {
    const raw = await req.text();
    if (raw.length > MAX_SIZE * 1.4) {
      return NextResponse.json({ error: "File too large", code: "tooBig" }, { status: 413 });
    }
    const parsedReq = importRequestSchema.safeParse(JSON.parse(raw));
    if (!parsedReq.success) {
      return NextResponse.json({ error: "Invalid request", code: "invalidCsv" }, { status: 400 });
    }
    const { type, csv, dryRun } = parsedReq.data;

    let table;
    try {
      table = parseCsv(csv);
    } catch {
      return NextResponse.json({ error: "Unreadable CSV", code: "invalidCsv" }, { status: 400 });
    }

    const market = await loadMarket();
    const companyIndex = companyNameIndex(market);
    const solutionIndex = solutionNameIndex(market);
    const results: RowResult[] = [];
    let created = 0;

    const pipe = (v: string) => v.split("|").map((x) => x.trim()).filter(Boolean);
    const orNull = (v: string | undefined) => (v === undefined || v === "" ? null : v);

    for (let i = 0; i < table.rows.length; i++) {
      const row = table.rows[i];
      const line = i + 1;
      try {
        if (type === "companies") {
          const label = row.initialName ?? "?";
          if (companyIndex.has(label.toLowerCase())) {
            results.push({ line, status: "skipped", label, reason: "duplicate" });
            continue;
          }
          const parsed = companySchema.safeParse({
            initialName: row.initialName,
            types: pipe(row.types ?? ""),
            foundedYear: row.foundedYear,
            foundedMonth: orNull(row.foundedMonth),
            country: row.country,
            originCountry: orNull(row.originCountry),
            description: orNull(row.description),
            website: orNull(row.website),
          });
          if (!parsed.success) {
            results.push({
              line,
              status: "error",
              label,
              reason: parsed.error.issues[0]?.path.join(".") ?? "invalid",
            });
            continue;
          }
          if (!dryRun) {
            const { types, ...data } = parsed.data;
            const company = await prisma.company.create({
              data: { ...data, types: { create: types.map((t) => ({ type: t })) } },
            });
            companyIndex.set(company.initialName.toLowerCase(), company.id);
          } else {
            companyIndex.set(label.toLowerCase(), "__pending__");
          }
          created++;
          results.push({ line, status: "created", label });
        } else if (type === "tags") {
          const label = row.slug ?? "?";
          const exists = await prisma.tag.findUnique({ where: { slug: (row.slug ?? "").toLowerCase() } });
          if (exists) {
            results.push({ line, status: "skipped", label, reason: "duplicate" });
            continue;
          }
          const parsed = tagSchema.safeParse({
            slug: row.slug,
            family: row.family,
            labelFr: row.labelFr,
            labelEn: row.labelEn,
            category: orNull(row.category),
          });
          if (!parsed.success) {
            results.push({ line, status: "error", label, reason: parsed.error.issues[0]?.path.join(".") ?? "invalid" });
            continue;
          }
          if (!dryRun) await prisma.tag.create({ data: parsed.data });
          created++;
          results.push({ line, status: "created", label });
        } else if (type === "solutions") {
          const label = row.initialName ?? "?";
          if (solutionIndex.has(label.toLowerCase())) {
            results.push({ line, status: "skipped", label, reason: "duplicate" });
            continue;
          }
          const companyId = companyIndex.get((row.initialCompany ?? "").toLowerCase());
          if (!companyId || companyId === "__pending__") {
            results.push({ line, status: "error", label, reason: `initialCompany introuvable : ${row.initialCompany}` });
            continue;
          }
          const tagSlugs = pipe(row.tags ?? "");
          const tags = await prisma.tag.findMany({ where: { slug: { in: tagSlugs } } });
          const missing = tagSlugs.filter((s) => !tags.some((t) => t.slug === s));
          if (missing.length > 0) {
            results.push({ line, status: "error", label, reason: `tags introuvables : ${missing.join(", ")}` });
            continue;
          }
          const parsed = solutionSchema.safeParse({
            initialName: row.initialName,
            initialCompanyId: companyId,
            launchYear: orNull(row.launchYear),
            launchMonth: orNull(row.launchMonth),
            description: orNull(row.description),
            website: orNull(row.website),
            tagIds: tags.map((t) => t.id),
          });
          if (!parsed.success) {
            results.push({ line, status: "error", label, reason: parsed.error.issues[0]?.path.join(".") ?? "invalid" });
            continue;
          }
          if (!dryRun) {
            const { tagIds = [], ...data } = parsed.data;
            const sol = await prisma.solution.create({
              data: { ...data, tags: { connect: tagIds.map((id) => ({ id })) } },
            });
            solutionIndex.set(sol.initialName.toLowerCase(), sol.id);
          } else {
            solutionIndex.set(label.toLowerCase(), "__pending__");
          }
          created++;
          results.push({ line, status: "created", label });
        } else if (type === "revenues") {
          const label = `${row.company ?? "?"} ${row.year ?? ""}`.trim();
          const companyId = companyIndex.get((row.company ?? "").toLowerCase());
          if (!companyId || companyId === "__pending__") {
            results.push({ line, status: "error", label, reason: `company introuvable : ${row.company}` });
            continue;
          }
          const parsed = revenueSchema.safeParse({
            companyId,
            year: row.year,
            amount: row.amount,
            currency: row.currency || "USD",
            source: orNull(row.source),
          });
          if (!parsed.success) {
            results.push({ line, status: "error", label, reason: parsed.error.issues[0]?.path.join(".") ?? "invalid" });
            continue;
          }
          if (!dryRun) {
            // Same-year figures are updated, not duplicated
            await prisma.revenue.upsert({
              where: { companyId_year: { companyId, year: parsed.data.year } },
              create: parsed.data,
              update: parsed.data,
            });
          }
          created++;
          results.push({ line, status: "created", label });
        } else {
          // events — rows can be in ANY order: sorting happens at read time
          const label = `${row.type ?? "?"} ${row.year ?? ""} ${row.subjectCompany || row.subjectSolution || ""}`.trim();
          const subjectCompanyId = row.subjectCompany
            ? companyIndex.get(row.subjectCompany.toLowerCase())
            : null;
          const subjectSolutionId = row.subjectSolution
            ? solutionIndex.get(row.subjectSolution.toLowerCase())
            : null;
          if (row.subjectCompany && (!subjectCompanyId || subjectCompanyId === "__pending__")) {
            results.push({ line, status: "error", label, reason: `sujet introuvable : ${row.subjectCompany}` });
            continue;
          }
          if (row.subjectSolution && (!subjectSolutionId || subjectSolutionId === "__pending__")) {
            results.push({ line, status: "error", label, reason: `sujet introuvable : ${row.subjectSolution}` });
            continue;
          }
          // Acquirer: referenced company if the name resolves, raw text otherwise
          const acquirerId = row.acquirer ? companyIndex.get(row.acquirer.toLowerCase()) : null;
          const newOwnerId = row.newOwner ? companyIndex.get(row.newOwner.toLowerCase()) : null;
          if (row.newOwner && (!newOwnerId || newOwnerId === "__pending__")) {
            results.push({ line, status: "error", label, reason: `newOwner introuvable : ${row.newOwner}` });
            continue;
          }
          const withId = row.withCompany ? companyIndex.get(row.withCompany.toLowerCase()) : null;
          // Host solution for SOLUTION_INTEGRATED (referenced by name)
          const intoSolutionId = row.intoSolution
            ? solutionIndex.get(row.intoSolution.toLowerCase())
            : null;
          if (row.intoSolution && (!intoSolutionId || intoSolutionId === "__pending__")) {
            results.push({ line, status: "error", label, reason: `intoSolution introuvable : ${row.intoSolution}` });
            continue;
          }

          const parsed = eventSchema.safeParse({
            type: row.type,
            year: row.year,
            month: orNull(row.month),
            description: orNull(row.description),
            subjectCompanyId: subjectCompanyId ?? null,
            subjectSolutionId: subjectSolutionId ?? null,
            newName: orNull(row.newName),
            acquirerCompanyId: acquirerId && acquirerId !== "__pending__" ? acquirerId : null,
            acquirerNameRaw: acquirerId && acquirerId !== "__pending__" ? null : orNull(row.acquirer),
            outcome: orNull(row.outcome),
            withCompanyId: withId && withId !== "__pending__" ? withId : null,
            newOwnerCompanyId: newOwnerId && newOwnerId !== "__pending__" ? newOwnerId : null,
            intoSolutionId: intoSolutionId ?? null,
            amount: orNull(row.amount),
            round: orNull(row.round),
            note: orNull(row.note),
          });
          if (!parsed.success) {
            results.push({ line, status: "error", label, reason: parsed.error.issues[0]?.path.join(".") ?? "invalid" });
            continue;
          }
          if (!dryRun) await prisma.event.create({ data: parsed.data });
          created++;
          results.push({ line, status: "created", label });
        }
      } catch (e) {
        console.error("[import] line", line, e);
        results.push({ line, status: "error", label: "?", reason: "server" });
      }
    }

    if (!dryRun && created > 0) {
      await logAudit({
        userId: session.user.id,
        action: "IMPORT",
        entityType: type,
        entityId: "-",
        summary: `Import CSV ${type} : ${created} lignes créées, ${results.filter((r) => r.status === "skipped").length} ignorées, ${results.filter((r) => r.status === "error").length} en erreur`,
      });
    }

    return NextResponse.json({
      dryRun,
      created,
      skipped: results.filter((r) => r.status === "skipped").length,
      errors: results.filter((r) => r.status === "error").length,
      results,
    });
  } catch (e) {
    return serverError(e);
  }
}
