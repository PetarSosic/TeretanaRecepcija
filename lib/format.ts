// BR-001–003: formatting never decides business dates; Postgres owns gym_today.
export const GYM_TIME_ZONE = "Europe/Podgorica";
const LOCALE = "sr-Latn-ME";

/** BR-003: decimal text to integer cents, rounded half-up without float arithmetic. */
function toCents(value: string): bigint {
  const match = /^(-?)(\d+)(?:[.,](\d+))?$/.exec(value.trim());
  if (!match) throw new RangeError("Invalid decimal amount");
  const [, sign, whole, fraction = ""] = match;
  const rounded =
    BigInt(whole) * 100n +
    BigInt(fraction.padEnd(2, "0").slice(0, 2)) +
    (Number(fraction[2] ?? "0") >= 5 ? 1n : 0n);
  return sign === "-" ? -rounded : rounded;
}

/** Decimal string suitable for a numeric(10,2) RPC argument. */
export function parseMoneyInput(value: string): string {
  const cents = toCents(value);
  const absolute = cents < 0n ? -cents : cents;
  if (absolute > 9999999999n)
    throw new RangeError("Amount exceeds numeric(10,2)");
  return `${cents < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

export function formatMoney(value: string): string {
  const cents = toCents(value);
  const absolute = cents < 0n ? -cents : cents;
  const whole = new Intl.NumberFormat(LOCALE).format(absolute / 100n);
  return `${cents < 0n ? "-" : ""}${whole},${String(absolute % 100n).padStart(2, "0")} €`;
}

function instant(value: Date | string): Date {
  if (typeof value === "string" && !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw new RangeError("Timestamp must include a timezone");
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError("Invalid timestamp");
  return date;
}

function parts(date: Date, options: Intl.DateTimeFormatOptions) {
  return Object.fromEntries(
    new Intl.DateTimeFormat(LOCALE, options)
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );
}

/** Accept a database date (YYYY-MM-DD) or an explicitly zoned timestamp. */
export function formatDate(value: Date | string): string {
  const isDateOnly =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = isDateOnly ? new Date(`${value}T12:00:00Z`) : instant(value);
  if (
    Number.isNaN(date.getTime()) ||
    (isDateOnly && date.toISOString().slice(0, 10) !== value)
  )
    throw new RangeError("Invalid date");
  const p = parts(date, {
    timeZone: isDateOnly ? "UTC" : GYM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return `${p.day}.${p.month}.${p.year}`;
}

export function formatTime(value: Date | string): string {
  const p = parts(instant(value), {
    timeZone: GYM_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return `${p.hour}:${p.minute}`;
}

export function formatDateTime(value: Date | string): string {
  return `${formatDate(instant(value))} ${formatTime(value)}`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0)
    throw new RangeError("Invalid duration");
  const minutes = Math.floor(seconds / 60);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
}
