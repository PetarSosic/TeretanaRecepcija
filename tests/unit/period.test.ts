import { describe, expect, it } from "vitest";
import {
  chartFromParams,
  isDate,
  periodFromParams,
  periodInstants,
  resolvePeriod,
} from "@/features/finance/period";

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

describe("US-17.1 AC1: the presets (FIN-01)", () => {
  it.each([
    ["2026-09-21", "2026-09-21"], // Monday
    ["2026-09-23", "2026-09-21"], // Wednesday
    ["2026-09-27", "2026-09-21"], // Sunday
    ["2026-10-01", "2026-09-28"], // a week across two months
  ])("Ova sedmica runs Monday to Sunday (today %s)", (today, monday) => {
    const week = resolvePeriod("week", today);
    expect(week.from).toBe(monday);
    const sunday = new Date(`${monday}T12:00:00Z`);
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    expect(week.to).toBe(sunday.toISOString().slice(0, 10));
  });

  it("covers today, this and last month, and the year so far", () => {
    expect(resolvePeriod("today", TODAY)).toMatchObject({ from: TODAY, to: TODAY });
    expect(resolvePeriod("month", TODAY)).toEqual(MONTH);
    expect(resolvePeriod("last_month", TODAY)).toMatchObject({
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(resolvePeriod("last_month", "2026-03-10")).toMatchObject({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(resolvePeriod("year", TODAY)).toMatchObject({
      from: "2026-01-01",
      to: TODAY,
    });
  });
});

describe("N-18: a period's instants in Europe/Podgorica", () => {
  it.each([
    // Summer (CEST) and winter (CET) days.
    ["2026-09-23", "2026-09-23", "2026-09-23T00:00:00+02:00", "2026-09-24T00:00:00+02:00"],
    ["2026-01-15", "2026-01-15", "2026-01-15T00:00:00+01:00", "2026-01-16T00:00:00+01:00"],
    // Across the spring (29.03.2026) and autumn (25.10.2026) clock changes.
    ["2026-03-28", "2026-03-29", "2026-03-28T00:00:00+01:00", "2026-03-30T00:00:00+02:00"],
    ["2026-10-25", "2026-10-25", "2026-10-25T00:00:00+02:00", "2026-10-26T00:00:00+01:00"],
  ])("%s to %s", (from, to, start, end) => {
    expect(periodInstants({ from, to })).toEqual({ start, end });
  });

  it("puts 23:30 local on the last day inside and the evening before outside", () => {
    const { start, end } = periodInstants({ from: "2026-01-15", to: "2026-01-15" });
    const inside = (utc: string) =>
      Date.parse(utc) >= Date.parse(start) && Date.parse(utc) < Date.parse(end);
    expect(inside("2026-01-14T22:30:00Z")).toBe(false); // 14.01 23:30
    expect(inside("2026-01-14T23:30:00Z")).toBe(true); // 15.01 00:30
    expect(inside("2026-01-15T22:30:00Z")).toBe(true); // 15.01 23:30
  });
});

describe("D-68: the S-16 chart's year and month", () => {
  it("opens on the whole of the gym's current year", () => {
    expect(chartFromParams({}, TODAY)).toEqual({ year: 2026, month: null });
  });

  it("keeps an earlier year, whole or narrowed to one month", () => {
    expect(chartFromParams({ year: "2025" }, TODAY)).toEqual({ year: 2025, month: null });
    expect(chartFromParams({ year: "2025", month: "12" }, TODAY)).toEqual({
      year: 2025,
      month: 12,
    });
  });

  it("allows this month and every month before it this year", () => {
    expect(chartFromParams({ year: "2026", month: "9" }, TODAY)).toEqual({
      year: 2026,
      month: 9,
    });
    expect(chartFromParams({ year: "2026", month: "01" }, TODAY)).toEqual({
      year: 2026,
      month: 1,
    });
  });

  it("reads a month without a year as that month of this year", () => {
    expect(chartFromParams({ month: "3" }, TODAY)).toEqual({ year: 2026, month: 3 });
  });

  it("falls back to the whole year for a month that has not started", () => {
    expect(chartFromParams({ year: "2026", month: "10" }, TODAY)).toEqual({
      year: 2026,
      month: null,
    });
  });

  it.each([
    [{ year: "2027" }],
    [{ year: "1999" }],
    [{ year: "26" }],
    [{ year: "abcd", month: "3" }],
  ])("falls back to this year for %o", (params) => {
    expect(chartFromParams(params, TODAY)).toEqual({ year: 2026, month: null });
  });

  it.each([["0"], ["13"], ["x"], ["-1"]])("ignores the month %s", (month) => {
    expect(chartFromParams({ year: "2025", month }, TODAY)).toEqual({
      year: 2025,
      month: null,
    });
  });
});
