/**
 * US-17.1 AC1: the period presets every finance screen shares.
 *
 * BR-001: the anchor is always `gym_today(gym_id)` handed in by the server, never the
 * browser's or the server's own date. All arithmetic runs on the `yyyy-mm-dd` text at
 * UTC noon, so a daylight-saving change can never move a boundary by a day.
 */
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
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(utc(value).getTime());
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

/** The period a screen's search parameters ask for, falling back to Ovaj mjesec. */
export function periodFromParams(
  params: { period?: string; from?: string; to?: string },
  today: string,
): Period {
  const preset =
    params.period && isPreset(params.period) ? params.period : DEFAULT_PRESET;
  return resolvePeriod(preset, today, params.from, params.to);
}

/** The month a monthly screen (S-18) is showing, as the first of that month. */
export function monthFromParam(month: string | undefined, today: string): string {
  return month && /^\d{4}-\d{2}$/.test(month)
    ? `${month}-01`
    : startOfMonth(today);
}
