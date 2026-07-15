import { describe, it, expect } from "vitest";
import { compareDates, sameDate, isBefore, formatDate, formatRange } from "../date";

describe("compareDates", () => {
  it("orders by year first", () => {
    expect(compareDates({ year: 2015 }, { year: 2019 })).toBeLessThan(0);
    expect(compareDates({ year: 2023 }, { year: 2019 })).toBeGreaterThan(0);
  });

  it("treats a missing month as the start of the year", () => {
    // (2021) sorts before (2021, February)
    expect(compareDates({ year: 2021 }, { year: 2021, month: 2 })).toBeLessThan(0);
    expect(compareDates({ year: 2021, month: 2 }, { year: 2021 })).toBeGreaterThan(0);
  });

  it("compares months within the same year", () => {
    expect(compareDates({ year: 2021, month: 2 }, { year: 2021, month: 11 })).toBeLessThan(0);
    expect(compareDates({ year: 2021, month: 3 }, { year: 2021, month: 3 })).toBe(0);
  });
});

describe("sameDate", () => {
  it("requires the same precision", () => {
    expect(sameDate({ year: 2021 }, { year: 2021 })).toBe(true);
    expect(sameDate({ year: 2021, month: null }, { year: 2021 })).toBe(true);
    expect(sameDate({ year: 2021, month: 3 }, { year: 2021 })).toBe(false);
    expect(sameDate({ year: 2021, month: 3 }, { year: 2021, month: 3 })).toBe(true);
  });
});

describe("isBefore", () => {
  it("is strict", () => {
    expect(isBefore({ year: 2015 }, { year: 2016 })).toBe(true);
    expect(isBefore({ year: 2016 }, { year: 2016 })).toBe(false);
  });
});

describe("formatDate", () => {
  it("formats a year-only date", () => {
    expect(formatDate({ year: 2021 }, "fr")).toBe("2021");
    expect(formatDate({ year: 2021 }, "en")).toBe("2021");
  });

  it("formats month+year in both locales", () => {
    expect(formatDate({ year: 2021, month: 3 }, "fr")).toBe("mars 2021");
    expect(formatDate({ year: 2021, month: 3 }, "en")).toBe("March 2021");
  });
});

describe("formatRange", () => {
  it("formats a closed period", () => {
    expect(formatRange({ year: 2015 }, { year: 2019 }, "fr")).toBe("2015 – 2019");
  });

  it("formats an open period", () => {
    expect(formatRange({ year: 2023 }, null, "fr")).toBe("depuis 2023");
    expect(formatRange({ year: 2023 }, null, "en")).toBe("since 2023");
  });

  it("formats an unknown-start period (data gap)", () => {
    expect(formatRange(null, { year: 2021 }, "fr")).toBe("jusqu'en 2021");
    expect(formatRange(null, { year: 2021 }, "en")).toBe("until 2021");
  });

  it("formats a fully unknown period", () => {
    expect(formatRange(null, null, "fr")).toBe("période inconnue");
    expect(formatRange(null, null, "en")).toBe("unknown period");
  });
});
