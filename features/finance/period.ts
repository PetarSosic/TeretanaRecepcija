/**
 * US-17.1 AC1: the period presets every finance screen shares.
 *
 * BR-001: the anchor is always `gym_today(gym_id)` handed in by the server, never the
 * browser's or the server's own date. All arithmetic runs on the `yyyy-mm-dd` text at
 * UTC noon, so a daylight-saving change can never move a boundary by a day.
 */
import { GYM_TIME_ZONE } from "@/lib/format";

export const PERIOD_PRESETS = [
  "today",
  "week",
  "month",
  "last_month",
  "year",
  "custom",
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number];
export type Period = { preset: PeriodPreset; from: string; to: string };

export const DEFAULT_PRESET: PeriodPreset = "month";

function utc(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftDays(date: string, days: number): string {
  const moved = utc(date);
  moved.setUTCDate(moved.getUTCDate() + days);
  return iso(moved);
}

function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function endOfMonth(date: string): string {
  const start = utc(startOfMonth(date));
  start.setUTCMonth(start.getUTCMonth() + 1);
  start.setUTCDate(0);
  return iso(start);
}

export function isPreset(value: string): value is PeriodPreset {
  return (PERIOD_PRESETS as readonly string[]).includes(value);
}

export function isDate(value: string | undefined): value is string {
  // N-07: Date rolls 2026-02-31 over to 03.03 instead of refusing it, and Postgres then
  // rejects the date, so a real calendar day is one that survives the round trip.
  return (
    !!value &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !isNaN(utc(value).getTime()) &&
    iso(utc(value)) === value
  );
}

/** The range a preset covers, as of the gym's today. */
export function resolvePeriod(
  preset: PeriodPreset,
  today: string,
  from?: string,
  to?: string,
): Period {
  switch (preset) {
    case "today":
      return { preset, from: today, to: today };
    case "week": {
      // Monday to Sunday: getUTCDay() is 0 on Sunday, which is six days into the week.
      const weekday = (utc(today).getUTCDay() + 6) % 7;
      const monday = shiftDays(today, -weekday);
      return { preset, from: monday, to: shiftDays(monday, 6) };
    }
    case "last_month": {
      const previous = shiftDays(startOfMonth(today), -1);
      return { preset, from: startOfMonth(previous), to: endOfMonth(previous) };
    }
    case "year":
      return { preset, from: `${today.slice(0, 4)}-01-01`, to: today };
    case "custom": {
      if (!isDate(from) || !isDate(to) || from > to)
        return resolvePeriod(DEFAULT_PRESET, today);
      return { preset, from, to };
    }
    case "month":
    default:
      return { preset: "month", from: startOfMonth(today), to: endOfMonth(today) };
  }
}

/** A local date's midnight in the gym's zone, as an ISO instant with that day's offset. */
function midnight(date: string, timeZone: string): string {
  // EU clocks change at 01:00 UTC, after every local midnight, so the offset in force at
  // 00:00 UTC of a date is the one its local midnight had.
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(new Date(`${date}T00:00:00Z`))
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  return `${date}T00:00:00${name === "GMT" ? "+00:00" : name.slice(3)}`;
}

/**
 * N-18: the instants a period of local dates covers, for filtering a timestamp column:
 * from the first day's midnight up to, not including, the midnight after the last day.
 * Each end takes its own offset, so a winter (CET) day is not read as a summer one.
 */
export function periodInstants(
  period: Pick<Period, "from" | "to">,
  timeZone: string = GYM_TIME_ZONE,
): { start: string; end: string } {
  return {
    start: midnight(period.from, timeZone),
    end: midnight(shiftDays(period.to, 1), timeZone),
  };
}

/** The period a screen's search parameters ask for, falling back to Ovaj mjesec. */
export function periodFromParams(
  params: { period?: string; from?: string; to?: string },
  today: string,
): Period {
  const preset =
    params.period && isPreset(params.period) ? params.period : DEFAULT_PRESET;
  return resolvePeriod(preset, today, params.from, params.to);
}

/** D-68: what the S-16 chart shows — a whole year, or one month of it. */
export type ChartRange = { year: number; month: number | null };

/** The first year the chart's year selector may offer, whatever the data says. */
export const CHART_MIN_YEAR = 2000;

/**
 * D-68: the chart's year and month from the search parameters, defaulting to the whole
 * of the gym's current year (BR-001). A year after this one or a month that has not
 * started yet falls back rather than asking `fin_chart` for something it refuses.
 */
export function chartFromParams(
  params: { year?: string; month?: string },
  today: string,
): ChartRange {
  const thisYear = Number(today.slice(0, 4));
  const thisMonth = Number(today.slice(5, 7));
  // No year means this year; a year that is not one falls back to the default view.
  const year = params.year === undefined ? thisYear : Number(params.year);
  if (
    (params.year !== undefined && !/^\d{4}$/.test(params.year)) ||
    year < CHART_MIN_YEAR ||
    year > thisYear
  )
    return { year: thisYear, month: null };
  const month =
    params.month && /^\d{1,2}$/.test(params.month) ? Number(params.month) : null;
  if (month === null || month < 1 || month > 12) return { year, month: null };
  if (year === thisYear && month > thisMonth) return { year, month: null };
  return { year, month };
}

/** The month a monthly screen (S-18) is showing, as the first of that month. */
export function monthFromParam(month: string | undefined, today: string): string {
  return month && /^\d{4}-\d{2}$/.test(month)
    ? `${month}-01`
    : startOfMonth(today);
}
