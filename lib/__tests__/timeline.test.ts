// =============================================================================
// Unit tests for the timeline derivation — they cover exactly the seed cases
// required by the spec, including out-of-order input, DIVESTMENT and data gaps.
// =============================================================================
import { describe, it, expect } from "vitest";
import {
  buildCompanyTimeline,
  buildSolutionTimeline,
  validateCompanyEvents,
  validateSolutionEvents,
  allNames,
  formerNamePeriods,
  type TimelineEventInput,
} from "../timeline";

let idSeq = 0;
/** Small helper to build an event with an auto id. */
function ev(partial: Omit<TimelineEventInput, "id">): TimelineEventInput {
  return { id: `e${++idSeq}`, ...partial };
}

// =============================================================================
// SEED CASE 4 — company "Y": history typed in a DELIBERATELY WRONG order.
// This is the test that proves input order does not matter.
// =============================================================================
describe("buildCompanyTimeline — case 'Y' (out-of-order input)", () => {
  const companyY = { id: "y", initialName: "Y", foundedYear: 2012 };
  // Same order as the seed file: 2019, 2020, 2015, 2023, 2016
  const events: TimelineEventInput[] = [
    ev({ type: "ACQUISITION", year: 2019, acquirerCompanyId: "fondsB", outcome: "INVESTOR_OWNED" }),
    ev({ type: "COMPANY_RENAME", year: 2020, newName: "X" }),
    ev({ type: "ACQUISITION", year: 2015, acquirerCompanyId: "fondsA", outcome: "INVESTOR_OWNED" }),
    ev({ type: "ACQUISITION", year: 2023, acquirerCompanyId: "fondsC", outcome: "INVESTOR_OWNED" }),
    ev({ type: "COMPANY_RENAME", year: 2016, newName: "Z" }),
  ];
  const tl = buildCompanyTimeline(companyY, events);

  it("derives the name periods Y (2012–2016), Z (2016–2020), X (since 2020)", () => {
    expect(tl.namePeriods).toEqual([
      { name: "Y", start: { year: 2012, month: null }, end: { year: 2016, month: null } },
      { name: "Z", start: { year: 2016, month: null }, end: { year: 2020, month: null } },
      { name: "X", start: { year: 2020, month: null }, end: null },
    ]);
    expect(tl.currentName).toBe("X");
  });

  it("derives the ownership periods A (2015–2019), B (2019–2023), C (since 2023)", () => {
    expect(tl.ownershipPeriods.map((p) => [p.ownerCompanyId, p.start?.year, p.end?.year ?? null])).toEqual([
      ["fondsA", 2015, 2019],
      ["fondsB", 2019, 2023],
      ["fondsC", 2023, null],
    ]);
    expect(tl.currentOwner?.ownerCompanyId).toBe("fondsC");
  });

  it("derives the statuses INDEPENDENT (2012–2015), INVESTOR_OWNED (since 2015)", () => {
    expect(tl.statusPeriods).toEqual([
      { status: "INDEPENDENT", start: { year: 2012, month: null }, end: { year: 2015, month: null } },
      { status: "INVESTOR_OWNED", start: { year: 2015, month: null }, end: null },
    ]);
    expect(tl.currentStatus).toBe("INVESTOR_OWNED");
  });

  it("produces the same result for any input order", () => {
    const shuffled = [...events].reverse();
    expect(buildCompanyTimeline(companyY, shuffled)).toEqual(tl);
  });
});

// =============================================================================
// SEED CASE 1 — Alsid / Tenable: absorption + chained solution renames
// =============================================================================
describe("buildCompanyTimeline — Alsid (ABSORBED)", () => {
  const alsid = { id: "alsid", initialName: "Alsid", foundedYear: 2017 };
  const events = [
    ev({ type: "ACQUISITION", year: 2021, month: 2, acquirerCompanyId: "tenable", outcome: "ABSORBED" }),
    ev({ type: "FUNDING", year: 2019, month: 6, amount: 13, round: "Series A" }),
  ];
  const tl = buildCompanyTimeline(alsid, events);

  it("status INDEPENDENT (2017–2021) then ABSORBED (since 02/2021)", () => {
    expect(tl.statusPeriods).toEqual([
      { status: "INDEPENDENT", start: { year: 2017, month: null }, end: { year: 2021, month: 2 } },
      { status: "ABSORBED", start: { year: 2021, month: 2 }, end: null },
    ]);
  });

  it("FUNDING is informational: no effect on state, but listed", () => {
    expect(tl.informationalEvents).toHaveLength(1);
    expect(tl.informationalEvents[0].type).toBe("FUNDING");
    expect(tl.currentStatus).toBe("ABSORBED");
    expect(tl.namePeriods).toHaveLength(1); // never renamed
  });
});

describe("buildSolutionTimeline — Alsid for AD → Tenable.AD → Tenable Identity Exposure", () => {
  const solution = { id: "s1", initialName: "Alsid for AD", initialCompanyId: "alsid", launchYear: 2017 };
  const events = [
    // Deliberately out of order, mixing month precision
    ev({ type: "SOLUTION_RENAME", year: 2024, newName: "Tenable Identity Exposure" }),
    ev({ type: "SOLUTION_TRANSFER", year: 2021, month: 2, newOwnerCompanyId: "tenable" }),
    ev({ type: "SOLUTION_RENAME", year: 2021, newName: "Tenable.AD" }),
  ];
  const tl = buildSolutionTimeline(solution, events);

  it("derives the three name periods of the spec", () => {
    expect(tl.namePeriods).toEqual([
      { name: "Alsid for AD", start: { year: 2017, month: null }, end: { year: 2021, month: null } },
      { name: "Tenable.AD", start: { year: 2021, month: null }, end: { year: 2024, month: null } },
      { name: "Tenable Identity Exposure", start: { year: 2024, month: null }, end: null },
    ]);
    expect(tl.currentName).toBe("Tenable Identity Exposure");
  });

  it("derives the vendors: Alsid (2017–2021), Tenable (since 2021)", () => {
    expect(tl.ownershipPeriods).toEqual([
      { ownerCompanyId: "alsid", start: { year: 2017, month: null }, end: { year: 2021, month: 2 } },
      { ownerCompanyId: "tenable", start: { year: 2021, month: 2 }, end: null },
    ]);
    expect(tl.currentOwnerCompanyId).toBe("tenable");
  });

  it("exposes former names for search ('anciennement …')", () => {
    expect(allNames(tl)).toEqual(["Alsid for AD", "Tenable.AD", "Tenable Identity Exposure"]);
    expect(formerNamePeriods(tl).map((p) => p.name)).toEqual(["Alsid for AD", "Tenable.AD"]);
  });
});

// =============================================================================
// SEED CASE 2 & 3 — ownership label types
// =============================================================================
describe("buildCompanyTimeline — Proofpoint (INVESTOR_OWNED) and Symantec (SUBSIDIARY)", () => {
  it("a fund acquisition gives INVESTOR_OWNED", () => {
    const tl = buildCompanyTimeline({ id: "pp", initialName: "Proofpoint", foundedYear: 2002 }, [
      ev({ type: "ACQUISITION", year: 2021, acquirerCompanyId: "thomabravo", outcome: "INVESTOR_OWNED" }),
    ]);
    expect(tl.currentStatus).toBe("INVESTOR_OWNED");
    expect(tl.currentOwner?.ownerCompanyId).toBe("thomabravo");
    expect(tl.currentOwner?.ownershipType).toBe("INVESTOR_OWNED");
  });

  it("an AUTONOMOUS industrial acquisition gives SUBSIDIARY", () => {
    const tl = buildCompanyTimeline({ id: "sym", initialName: "Symantec", foundedYear: 1982 }, [
      ev({ type: "ACQUISITION", year: 2019, month: 11, acquirerCompanyId: "broadcom", outcome: "AUTONOMOUS" }),
    ]);
    expect(tl.currentStatus).toBe("SUBSIDIARY");
  });
});

// =============================================================================
// SEED CASE 5 — DIVESTMENT: back to INDEPENDENT, bounded ownership period
// =============================================================================
describe("buildCompanyTimeline — SailPoint (DIVESTMENT)", () => {
  const sailpoint = { id: "sail", initialName: "SailPoint", foundedYear: 2005 };
  const tl = buildCompanyTimeline(sailpoint, [
    ev({ type: "DIVESTMENT", year: 2025, month: 2, note: "IPO Nasdaq" }),
    ev({ type: "ACQUISITION", year: 2022, month: 8, acquirerCompanyId: "thomabravo", outcome: "INVESTOR_OWNED" }),
  ]);

  it("closes the ownership period without opening a new one", () => {
    expect(tl.ownershipPeriods).toEqual([
      {
        ownerCompanyId: "thomabravo",
        ownerNameRaw: null,
        ownershipType: "INVESTOR_OWNED",
        start: { year: 2022, month: 8 },
        end: { year: 2025, month: 2 },
      },
    ]);
    expect(tl.currentOwner).toBeNull();
  });

  it("status goes back to INDEPENDENT after the divestment", () => {
    expect(tl.statusPeriods.map((p) => p.status)).toEqual([
      "INDEPENDENT",
      "INVESTOR_OWNED",
      "INDEPENDENT",
    ]);
    expect(tl.currentStatus).toBe("INDEPENDENT");
  });
});

// =============================================================================
// Data gaps — unknown launch date
// =============================================================================
describe("buildSolutionTimeline — unknown launch date (allowed gap)", () => {
  it("renders an unknown-start period instead of blocking", () => {
    const tl = buildSolutionTimeline(
      { id: "s2", initialName: "Mystery Tool", initialCompanyId: "acme" },
      [ev({ type: "SOLUTION_RENAME", year: 2020, newName: "Known Tool" })]
    );
    expect(tl.namePeriods[0]).toEqual({
      name: "Mystery Tool",
      start: null, // unknown start = data gap, displayed as "unknown period"
      end: { year: 2020, month: null },
    });
    expect(tl.currentName).toBe("Known Tool");
  });

  it("a SOLUTION_LAUNCH event provides the missing start date", () => {
    const tl = buildSolutionTimeline(
      { id: "s3", initialName: "Tool", initialCompanyId: "acme" },
      [ev({ type: "SOLUTION_LAUNCH", year: 2018 })]
    );
    expect(tl.statusPeriods).toEqual([
      { status: "ACTIVE", start: { year: 2018, month: null }, end: null },
    ]);
  });

  it("SOLUTION_DISCONTINUED closes the active period", () => {
    const tl = buildSolutionTimeline(
      { id: "s4", initialName: "Tool", initialCompanyId: "acme", launchYear: 2010 },
      [ev({ type: "SOLUTION_DISCONTINUED", year: 2022 })]
    );
    expect(tl.currentStatus).toBe("DISCONTINUED");
    expect(tl.statusPeriods).toEqual([
      { status: "ACTIVE", start: { year: 2010, month: null }, end: { year: 2022, month: null } },
      { status: "DISCONTINUED", start: { year: 2022, month: null }, end: null },
    ]);
  });
});

// =============================================================================
// SOLUTION_INTEGRATED — Illusive/SIPM case: a solution absorbed into another
// =============================================================================
describe("buildSolutionTimeline — SOLUTION_INTEGRATED (Illusive/SIPM)", () => {
  // "Spotlight" (Illusive) -> renamed "ITDR Spotlight" (2022) -> integrated
  // into "SIPM" (2024)
  const spotlight = { id: "spot", initialName: "Spotlight", initialCompanyId: "illusive", launchYear: 2018 };
  const tl = buildSolutionTimeline(spotlight, [
    ev({ type: "SOLUTION_INTEGRATED", year: 2024, intoSolutionId: "sipm" }),
    ev({ type: "SOLUTION_TRANSFER", year: 2022, month: 12, newOwnerCompanyId: "proofpoint" }),
    ev({ type: "SOLUTION_RENAME", year: 2022, newName: "ITDR Spotlight" }),
  ]);

  it("derives status INTEGRATED with a link to the host solution", () => {
    expect(tl.currentStatus).toBe("INTEGRATED");
    expect(tl.integratedIntoSolutionId).toBe("sipm");
    expect(tl.statusPeriods).toEqual([
      { status: "ACTIVE", start: { year: 2018, month: null }, end: { year: 2024, month: null } },
      { status: "INTEGRATED", start: { year: 2024, month: null }, end: null },
    ]);
  });

  it("still derives the name and vendor history alongside the integration", () => {
    expect(tl.currentName).toBe("ITDR Spotlight");
    expect(tl.currentOwnerCompanyId).toBe("proofpoint");
  });

  it("a later SOLUTION_LAUNCH re-extracts the solution (back to ACTIVE)", () => {
    const relaunched = buildSolutionTimeline(spotlight, [
      ev({ type: "SOLUTION_INTEGRATED", year: 2024, intoSolutionId: "sipm" }),
      ev({ type: "SOLUTION_LAUNCH", year: 2026 }),
    ]);
    expect(relaunched.currentStatus).toBe("ACTIVE");
    expect(relaunched.integratedIntoSolutionId).toBeNull();
  });

  it("ignores a malformed SOLUTION_INTEGRATED without a host (read-time tolerance)", () => {
    const tl2 = buildSolutionTimeline(spotlight, [ev({ type: "SOLUTION_INTEGRATED", year: 2024 })]);
    expect(tl2.currentStatus).toBe("ACTIVE");
    expect(tl2.integratedIntoSolutionId).toBeNull();
  });
});

// =============================================================================
// Sequence validation (admin input checks)
// =============================================================================
describe("validateCompanyEvents", () => {
  const company = { id: "c", initialName: "C", foundedYear: 2010 };

  it("accepts a coherent sequence", () => {
    expect(
      validateCompanyEvents(company, [
        ev({ type: "ACQUISITION", year: 2015, outcome: "INVESTOR_OWNED", acquirerCompanyId: "f" }),
        ev({ type: "DIVESTMENT", year: 2019 }),
      ])
    ).toEqual([]);
  });

  it("rejects an event dated before the creation", () => {
    const issues = validateCompanyEvents(company, [ev({ type: "COMPANY_RENAME", year: 2005, newName: "N" })]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ level: "error", code: "eventBeforeCreation" });
  });

  it("rejects two same-dimension events at the exact same date", () => {
    const issues = validateCompanyEvents(company, [
      ev({ type: "COMPANY_RENAME", year: 2015, newName: "A" }),
      ev({ type: "COMPANY_RENAME", year: 2015, newName: "B" }),
    ]);
    expect(issues.some((i) => i.code === "duplicateDimensionDate" && i.level === "error")).toBe(true);
  });

  it("allows same date with different precision (2015 vs March 2015)", () => {
    const issues = validateCompanyEvents(company, [
      ev({ type: "COMPANY_RENAME", year: 2015, newName: "A" }),
      ev({ type: "COMPANY_RENAME", year: 2015, month: 3, newName: "B" }),
    ]);
    expect(issues).toEqual([]);
  });

  it("rejects a DIVESTMENT without ongoing ownership", () => {
    const issues = validateCompanyEvents(company, [ev({ type: "DIVESTMENT", year: 2019 })]);
    expect(issues.some((i) => i.code === "divestmentWithoutOwnership" && i.level === "error")).toBe(true);
  });

  it("warns (non-blocking) about an event after a SHUTDOWN", () => {
    const issues = validateCompanyEvents(company, [
      ev({ type: "SHUTDOWN", year: 2015 }),
      ev({ type: "COMPANY_RENAME", year: 2018, newName: "Zombie" }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ level: "warning", code: "eventAfterShutdown" });
  });

  it("validation is input-order independent too", () => {
    const shuffled = validateCompanyEvents(company, [
      ev({ type: "DIVESTMENT", year: 2019 }),
      ev({ type: "ACQUISITION", year: 2015, outcome: "INVESTOR_OWNED", acquirerCompanyId: "f" }),
    ]);
    expect(shuffled).toEqual([]);
  });
});

describe("validateSolutionEvents", () => {
  it("rejects an event before the launch when the launch date is known", () => {
    const issues = validateSolutionEvents(
      { id: "s", initialName: "S", initialCompanyId: "c", launchYear: 2017 },
      [ev({ type: "SOLUTION_RENAME", year: 2015, newName: "Old" })]
    );
    expect(issues.some((i) => i.code === "eventBeforeCreation")).toBe(true);
  });

  it("does not check dates when the launch date is unknown (allowed gap)", () => {
    const issues = validateSolutionEvents({ id: "s", initialName: "S", initialCompanyId: "c" }, [
      ev({ type: "SOLUTION_RENAME", year: 1999, newName: "Old" }),
    ]);
    expect(issues).toEqual([]);
  });
});
