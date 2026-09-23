import { describe, expect, it } from "vitest";
import { isDate, periodFromParams } from "@/features/finance/period";

const TODAY = "2026-09-23";
const MONTH = { preset: "month", from: "2026-09-01", to: "2026-09-30" };

describe("US-17.1 AC1: period parameters (FIN-02)", () => {
  it("keeps a valid custom range", () => {
    expect(
      periodFromParams(
        { period: "custom", from: "2026-09-01", to: "2026-09-15" },
        TODAY,
      ),
    ).toEqual({ preset: "custom", from: "2026-09-01", to: "2026-09-15" });
  });

  it.each([
    [{ period: "custom", from: "2026-09-30", to: "2026-09-01" }],
    [{ period: "custom", from: "abc", to: "xyz" }],
    [{ period: "izmisljeno" }],
    // N-07: a day the calendar does not have.
    [{ period: "custom", from: "2026-02-31", to: "2026-03-01" }],
    [{ period: "custom", from: "2026-09-01", to: "2026-09-31" }],
  ])("falls back to Ovaj mjesec for %j", (params) => {
    expect(periodFromParams(params, TODAY)).toEqual(MONTH);
  });

  it("accepts 29.02 only in a leap year", () => {
    expect(isDate("2028-02-29")).toBe(true);
    expect(isDate("2026-02-29")).toBe(false);
  });
});
