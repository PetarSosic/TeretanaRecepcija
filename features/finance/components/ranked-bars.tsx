import { formatMoney } from "@/lib/format";
import { me } from "@/lib/i18n/me";

export type RankedBar = {
  label: string;
  /** Decimal text, as numeric(10,2) arrives (BR-003). */
  value: string;
};

/** BR-003: decimal text to cents, without ever building a float. */
function cents(value: string): number {
  const [whole, fraction = ""] = value.replace(",", ".").split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
}

/**
 * Magnitude, ranked high to low: one hue, longer means more. A single series needs no
 * legend — the caption says what is plotted — and every bar is directly labelled with
 * its exact figure, so the chart never has to be measured against an axis.
 */
export function RankedBars({
  title,
  rows,
}: {
  title: string;
  rows: RankedBar[];
}) {
  const ranked = [...rows].sort((a, b) => cents(b.value) - cents(a.value));
  const peak = Math.max(...ranked.map((row) => cents(row.value)), 1);

  return (
    <figure className="m-0">
      <figcaption className="mb-3 text-sm font-medium">{title}</figcaption>
      {ranked.length === 0 || peak === 1 ? (
        <p className="text-sm text-muted-foreground">{me.finance.noData}</p>
      ) : (
        <ul className="grid gap-2">
          {ranked.map((row) => (
            <li key={row.label} className="grid gap-1">
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span>{row.label}</span>
                <span className="font-medium tabular-nums">
                  {formatMoney(row.value)}
                </span>
              </div>
              <span
                aria-hidden="true"
                className="block h-2 rounded-r-sm bg-chart-1"
                style={{
                  width: `${Math.max((cents(row.value) / peak) * 100, 1)}%`,
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
