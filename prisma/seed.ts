// =============================================================================
// Seed — validates the event-sourced temporal model.
//
// IMPORTANT: this seed only inserts *dated facts* (events). No period, no
// current name, no current owner is ever written: they are all derived at read
// time by /lib/timeline.ts. Test case 4 ("Y" company) deliberately inserts its
// events OUT OF ORDER to prove that input order is irrelevant.
//
// Run with: npx prisma db seed   (configured in package.json)
// =============================================================================

import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../lib/generated/prisma/client";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./data/cybermarkettrack.db",
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  // Clean slate (idempotent seed: safe to re-run)
  await prisma.auditLog.deleteMany();
  await prisma.event.deleteMany();
  await prisma.alias.deleteMany();
  await prisma.revenue.deleteMany();
  await prisma.solution.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.companyTypeAssignment.deleteMany();
  await prisma.company.deleteMany();
  await prisma.comparator.deleteMany();
  await prisma.user.deleteMany();

  // No admin user is seeded: the account is created on first login via the
  // setup flow (/api/setup), so no default password exists anywhere.

  // ---------------------------------------------------------------------------
  // Tags (three families; SCOPE tags carry a grouping category)
  // ---------------------------------------------------------------------------
  const tagData: {
    slug: string;
    family: string;
    labelFr: string;
    labelEn: string;
    category?: string;
  }[] = [
    // Solution types
    { slug: "itdr", family: "SOLUTION_TYPE", labelFr: "ITDR", labelEn: "ITDR" },
    { slug: "ispm", family: "SOLUTION_TYPE", labelFr: "ISPM", labelEn: "ISPM" },
    { slug: "edr", family: "SOLUTION_TYPE", labelFr: "EDR", labelEn: "EDR" },
    { slug: "xdr", family: "SOLUTION_TYPE", labelFr: "XDR", labelEn: "XDR" },
    // Capabilities
    {
      slug: "config-vuln-assessment",
      family: "CAPABILITY",
      labelFr: "Évaluation de configuration & vulnérabilités",
      labelEn: "Configuration & vulnerability assessment",
    },
    { slug: "remediation-guide", family: "CAPABILITY", labelFr: "Guide de remédiation", labelEn: "Remediation guide" },
    { slug: "attack-path", family: "CAPABILITY", labelFr: "Chemins d'attaque", labelEn: "Attack path" },
    { slug: "attack-detection", family: "CAPABILITY", labelFr: "Détection d'attaques", labelEn: "Attack detection" },
    { slug: "investigation", family: "CAPABILITY", labelFr: "Investigation", labelEn: "Investigation" },
    // Scopes (grouped by category)
    { slug: "active-directory", family: "SCOPE", labelFr: "Active Directory", labelEn: "Active Directory", category: "DIRECTORY" },
    { slug: "entra-id", family: "SCOPE", labelFr: "Entra ID", labelEn: "Entra ID", category: "IDENTITY_PROVIDER" },
  ];
  const tags: Record<string, { id: string }> = {};
  for (const t of tagData) {
    tags[t.slug] = await prisma.tag.create({ data: t });
  }

  // ---------------------------------------------------------------------------
  // Helper to create a company with its types
  // ---------------------------------------------------------------------------
  async function company(data: {
    initialName: string;
    types: string[];
    foundedYear: number;
    foundedMonth?: number;
    country: string;
    originCountry?: string;
    description?: string;
    website?: string;
  }) {
    const { types, ...rest } = data;
    return prisma.company.create({
      data: {
        ...rest,
        types: { create: types.map((type) => ({ type })) },
      },
    });
  }

  // ===========================================================================
  // CASE 1 — Alsid / Tenable: chained renames + absorption
  // ===========================================================================
  const alsid = await company({
    initialName: "Alsid",
    types: ["VENDOR"],
    foundedYear: 2017,
    country: "FR",
    description:
      "Éditeur français spécialisé dans la sécurité d'Active Directory, fondé par deux anciens de l'ANSSI.",
    website: "https://www.alsid.com",
  });
  const tenable = await company({
    initialName: "Tenable",
    types: ["VENDOR"],
    foundedYear: 2002,
    country: "US",
    description: "Éditeur américain, leader de la gestion des vulnérabilités (Nessus, Tenable One).",
    website: "https://www.tenable.com",
  });

  const alsidForAd = await prisma.solution.create({
    data: {
      initialName: "Alsid for AD",
      initialCompanyId: alsid.id,
      launchYear: 2017,
      description:
        "Solution de sécurisation d'Active Directory : détection des mauvaises configurations et des attaques en temps réel, sans agent.",
      features:
        "- Audit continu des configurations AD\n- Détection d'attaques (DCSync, DCShadow, Golden Ticket...)\n- Chemins d'attaque\n- Guides de remédiation pas à pas",
      tags: {
        connect: [
          tags["itdr"],
          tags["ispm"],
          tags["config-vuln-assessment"],
          tags["remediation-guide"],
          tags["attack-path"],
          tags["attack-detection"],
          tags["investigation"],
          tags["active-directory"],
          tags["entra-id"],
        ].map((t) => ({ id: t.id })),
      },
      aliases: { create: [{ name: "Tenable.IE" }, { name: "TIE" }] },
    },
  });

  await prisma.event.createMany({
    data: [
      {
        type: "ACQUISITION",
        year: 2021,
        month: 2,
        subjectCompanyId: alsid.id,
        acquirerCompanyId: tenable.id,
        outcome: "ABSORBED",
        description: "Tenable rachète Alsid pour 98 M$ ; la marque Alsid disparaît, équipes et technologie intégrées.",
      },
      {
        type: "SOLUTION_TRANSFER",
        year: 2021,
        month: 2,
        subjectSolutionId: alsidForAd.id,
        newOwnerCompanyId: tenable.id,
        description: "La solution passe dans le portefeuille Tenable suite à l'absorption d'Alsid.",
      },
      {
        type: "SOLUTION_RENAME",
        year: 2021,
        subjectSolutionId: alsidForAd.id,
        newName: "Tenable.AD",
        description: "Renommage dans la gamme Tenable.",
      },
      {
        type: "SOLUTION_RENAME",
        year: 2024,
        subjectSolutionId: alsidForAd.id,
        newName: "Tenable Identity Exposure",
        description: "Renommage lors de l'harmonisation de la gamme (fin des noms « Tenable.X »).",
      },
      // Informational event (no state effect) — shows up in the news feed
      {
        type: "FUNDING",
        year: 2019,
        month: 6,
        subjectCompanyId: alsid.id,
        amount: 13,
        round: "Series A",
        description: "Levée de fonds de 13 M€ menée par Idinvest Partners.",
      },
    ],
  });

  // ===========================================================================
  // CASE 2 — Proofpoint / Thoma Bravo: fund ownership (org independence)
  // ===========================================================================
  const proofpoint = await company({
    initialName: "Proofpoint",
    types: ["VENDOR"],
    foundedYear: 2002,
    country: "US",
    description: "Éditeur américain spécialisé dans la sécurité de la messagerie et la protection des personnes.",
    website: "https://www.proofpoint.com",
  });
  const thomaBravo = await company({
    initialName: "Thoma Bravo",
    types: ["INVESTMENT_FUND"],
    foundedYear: 2008,
    country: "US",
    description: "Fonds d'investissement américain spécialisé dans les logiciels, très actif en cybersécurité.",
    website: "https://www.thomabravo.com",
  });

  await prisma.event.create({
    data: {
      type: "ACQUISITION",
      year: 2021,
      subjectCompanyId: proofpoint.id,
      acquirerCompanyId: thomaBravo.id,
      outcome: "INVESTOR_OWNED",
      description:
        "Thoma Bravo acquiert Proofpoint pour 12,3 Md$ (sortie de bourse). L'organisation reste totalement indépendante, seul l'actionnariat change.",
    },
  });

  await prisma.revenue.createMany({
    data: [
      { companyId: proofpoint.id, year: 2019, amount: 888, currency: "USD", source: "Rapport annuel" },
      { companyId: proofpoint.id, year: 2020, amount: 1050, currency: "USD", source: "Rapport annuel" },
    ],
  });

  // ===========================================================================
  // CASE 3 — Symantec / Broadcom: industrial subsidiary, brand kept
  // ===========================================================================
  const symantec = await company({
    initialName: "Symantec",
    types: ["VENDOR"],
    foundedYear: 1982,
    country: "US",
    description: "Éditeur historique de la cybersécurité (division entreprise rachetée par Broadcom en 2019).",
  });
  const broadcom = await company({
    initialName: "Broadcom",
    types: ["VENDOR"],
    foundedYear: 1991,
    country: "US",
    description: "Groupe américain de semi-conducteurs et de logiciels d'infrastructure.",
    website: "https://www.broadcom.com",
  });

  await prisma.event.create({
    data: {
      type: "ACQUISITION",
      year: 2019,
      month: 11,
      subjectCompanyId: symantec.id,
      acquirerCompanyId: broadcom.id,
      outcome: "AUTONOMOUS",
      description: "Broadcom rachète l'activité entreprise de Symantec pour 10,7 Md$ ; la marque est conservée.",
    },
  });

  // ===========================================================================
  // CASE 4 — "Y": history reconstructed after the fact, events INSERTED OUT OF
  // ORDER on purpose. Expected derived periods (verified by unit tests):
  //   Names:     Y (2012–2016), Z (2016–2020), X (since 2020)   -> current: X
  //   Ownership: fonds A (2015–2019), fonds B (2019–2023), fonds C (since 2023)
  //   Status:    INDEPENDENT (2012–2015), INVESTOR_OWNED (since 2015)
  // ===========================================================================
  const companyY = await company({
    initialName: "Y",
    types: ["VENDOR"],
    foundedYear: 2012,
    country: "FR",
    description: "Société fictive de test : valide la reconstruction d'un historique saisi dans le désordre.",
  });
  const fondsA = await company({
    initialName: "Fonds A",
    types: ["INVESTMENT_FUND"],
    foundedYear: 2000,
    country: "FR",
    description: "Fonds fictif de test.",
  });
  const fondsB = await company({
    initialName: "Fonds B",
    types: ["INVESTMENT_FUND"],
    foundedYear: 2005,
    country: "GB",
    description: "Fonds fictif de test.",
  });
  const fondsC = await company({
    initialName: "Fonds C",
    types: ["INVESTMENT_FUND"],
    foundedYear: 2010,
    country: "US",
    description: "Fonds fictif de test.",
  });

  // Deliberately out of chronological order:
  await prisma.event.createMany({
    data: [
      { type: "ACQUISITION", year: 2019, subjectCompanyId: companyY.id, acquirerCompanyId: fondsB.id, outcome: "INVESTOR_OWNED" },
      { type: "COMPANY_RENAME", year: 2020, subjectCompanyId: companyY.id, newName: "X" },
      { type: "ACQUISITION", year: 2015, subjectCompanyId: companyY.id, acquirerCompanyId: fondsA.id, outcome: "INVESTOR_OWNED" },
      { type: "ACQUISITION", year: 2023, subjectCompanyId: companyY.id, acquirerCompanyId: fondsC.id, outcome: "INVESTOR_OWNED" },
      { type: "COMPANY_RENAME", year: 2016, subjectCompanyId: companyY.id, newName: "Z" },
    ],
  });

  // ===========================================================================
  // CASE 5 — DIVESTMENT: SailPoint bought by Thoma Bravo (2022), back to
  // independence via IPO (2025). Expected: ownership period 2022–2025 closed,
  // status back to INDEPENDENT since 2025.
  // ===========================================================================
  const sailpoint = await company({
    initialName: "SailPoint",
    types: ["VENDOR"],
    foundedYear: 2005,
    country: "US",
    description: "Éditeur américain de gouvernance des identités (IGA).",
    website: "https://www.sailpoint.com",
  });

  await prisma.event.createMany({
    data: [
      {
        type: "ACQUISITION",
        year: 2022,
        month: 8,
        subjectCompanyId: sailpoint.id,
        acquirerCompanyId: thomaBravo.id,
        outcome: "INVESTOR_OWNED",
        description: "Thoma Bravo acquiert SailPoint pour 6,9 Md$ (sortie de bourse).",
      },
      {
        type: "DIVESTMENT",
        year: 2025,
        month: 2,
        subjectCompanyId: sailpoint.id,
        note: "IPO Nasdaq",
        description: "SailPoint retourne en bourse (Nasdaq : SAIL) ; fin de la détention par Thoma Bravo.",
      },
    ],
  });

  // ===========================================================================
  // Additional entries: CrowdStrike, SentinelOne, I-Tracing, Nomios
  // ===========================================================================
  const crowdstrike = await company({
    initialName: "CrowdStrike",
    types: ["VENDOR"],
    foundedYear: 2011,
    country: "US",
    description: "Éditeur américain, leader de la protection des endpoints (plateforme Falcon).",
    website: "https://www.crowdstrike.com",
  });
  const sentinelone = await company({
    initialName: "SentinelOne",
    types: ["VENDOR"],
    foundedYear: 2013,
    country: "US",
    originCountry: "IL",
    description: "Éditeur de la plateforme Singularity (EDR/XDR autonome).",
    website: "https://www.sentinelone.com",
  });
  await company({
    initialName: "I-Tracing",
    types: ["SERVICE_PROVIDER"],
    foundedYear: 2005,
    country: "FR",
    description: "Pure player français des services de cybersécurité (SOC, CERT, audit).",
    website: "https://www.i-tracing.com",
  });
  await company({
    initialName: "Nomios",
    types: ["SERVICE_PROVIDER"],
    foundedYear: 2004,
    country: "NL",
    description: "Intégrateur et fournisseur de services de cybersécurité européen.",
    website: "https://www.nomios.com",
  });

  await prisma.solution.create({
    data: {
      initialName: "Falcon",
      initialCompanyId: crowdstrike.id,
      launchYear: 2013,
      description: "Plateforme cloud-native de protection des endpoints.",
      tags: { connect: [{ id: tags["edr"].id }, { id: tags["xdr"].id }] },
    },
  });
  await prisma.solution.create({
    data: {
      initialName: "Singularity Platform",
      initialCompanyId: sentinelone.id,
      launchYear: 2013,
      description: "Plateforme EDR/XDR autonome.",
      tags: { connect: [{ id: tags["edr"].id }, { id: tags["xdr"].id }] },
    },
  });

  await prisma.revenue.createMany({
    data: [
      { companyId: crowdstrike.id, year: 2023, amount: 3056, currency: "USD", source: "FY2024 (rapport annuel)" },
      { companyId: tenable.id, year: 2023, amount: 798, currency: "USD", source: "Rapport annuel" },
      { companyId: tenable.id, year: 2024, amount: 900, currency: "USD", source: "Rapport annuel" },
    ],
  });

  // Summary
  const counts = {
    companies: await prisma.company.count(),
    solutions: await prisma.solution.count(),
    events: await prisma.event.count(),
    tags: await prisma.tag.count(),
    aliases: await prisma.alias.count(),
    revenues: await prisma.revenue.count(),
    users: await prisma.user.count(),
  };
  console.log("Seed done:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
