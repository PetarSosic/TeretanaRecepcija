"use client";

import { useId, useState } from "react";
import { formatMoney } from "@/lib/format";
import { me } from "@/lib/i18n/me";

export type MonthlyPoint = {
  /** `YYYY-MM`. */
  month: string;
  /** Decimal text, as numeric(10,2) arrives (BR-003). */
  income: string;
  expenses: string;
};

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "maj",
  "jun",
  "jul",
  "avg",
  "sep",
  "okt",
  "nov",
  "dec",
];

/** BR-003: decimal text to cents, without ever building a float. */
function cents(value: string): number {
  const [whole, fraction = ""] = value.replace(",", ".").split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
}

// Axis ticks are whole euros: the exact figures live in the hover line and the table.
const wholeEuros = new Intl.NumberFormat("sr-Latn-ME", {
  maximumFractionDigits: 0,
});

function monthLabel(month: string): string {
  const [year, index] = month.split("-");
  return `${MONTHS[Number(index) - 1]} ${year.slice(2)}`;
}

/**
 * US-17.1 AC3: income against expenses for the last twelve months.
 *
 * Two series over time, so the columns are grouped rather than stacked — the reader's
 * job is to compare the pair within each month, not to add them up. Identity never rests
 * on colour alone: the legend names both series, the hovered month is labelled with both
 * figures in words, and the table underneath carries every value.
 */
export function MonthlyChart({ data }: { data: MonthlyPoint[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const captionId = useId();

  if (!data.length)
    return <p className="text-sm text-muted-foreground">{me.finance.noData}</p>;

  const values = data.flatMap((point) => [
    cents(point.income),
    cents(point.expenses),
  ]);
  const peak = Math.max(...values, 1);
  // A round ceiling so the gridlines land on readable numbers.
  const step = Math.pow(10, Math.max(0, String(Math.round(peak / 4)).length - 1));
  const ceiling = Math.max(Math.ceil(peak / step) * step, step);

  const width = 720;
  const height = 240;
  const padding = { top: 12, right: 12, bottom: 28, left: 64 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const band = plotWidth / data.length;
  // Doc: a column is at most 24px thick, and the leftover of the band stays as air.
  const bar = Math.min(18, (band - 6) / 2);
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  const y = (value: number) => padding.top + plotHeight * (1 - value / ceiling);

  return (
    <figure className="m-0">
      <figcaption className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-medium">{me.finance.monthlyTitle}</span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span
            aria-hidden="true"
            className="inline-block size-2.5 rounded-full bg-chart-1"
          />
          {me.finance.income}
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span
            aria-hidden="true"
            className="inline-block size-2.5 rounded-full bg-chart-2"
          />
          {me.finance.expenses}
        </span>
      </figcaption>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-60 w-full min-w-[640px]"
          role="img"
          aria-describedby={captionId}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y(ceiling * tick)}
                y2={y(ceiling * tick)}
                stroke="var(--chart-grid)"
                strokeWidth={1}
              />
              <text
                x={padding.left - 8}
                y={y(ceiling * tick) + 4}
                textAnchor="end"
                className="fill-muted-foreground text-[11px]"
              >
                {wholeEuros.format(Math.round((ceiling * tick) / 100))}
              </text>
            </g>
          ))}

          {data.map((point, index) => {
            const left = padding.left + band * index;
            const income = cents(point.income);
            const expenses = cents(point.expenses);
            const active = hovered === index;
            return (
              <g key={point.month}>
                {/* A full-height target, so the hover does not depend on hitting a bar. */}
                <rect
                  x={left}
                  y={padding.top}
                  width={band}
                  height={plotHeight}
                  fill={active ? "var(--muted)" : "transparent"}
                  onMouseEnter={() => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                />
                <rect
                  x={left + band / 2 - bar - 1}
                  y={y(income)}
                  width={bar}
                  height={Math.max(padding.top + plotHeight - y(income), 0)}
                  rx={3}
                  fill="var(--chart-1)"
                  pointerEvents="none"
                />
                <rect
                  x={left + band / 2 + 1}
                  y={y(expenses)}
                  width={bar}
                  height={Math.max(padding.top + plotHeight - y(expenses), 0)}
                  rx={3}
                  fill="var(--chart-2)"
                  pointerEvents="none"
                />
                <text
                  x={left + band / 2}
                  y={height - 8}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[11px]"
                  pointerEvents="none"
                >
                  {monthLabel(point.month)}
                </text>
              </g>
            );
          })}

          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={padding.top + plotHeight}
            y2={padding.top + plotHeight}
            stroke="var(--chart-grid)"
            strokeWidth={1}
          />
        </svg>
      </div>

      <p id={captionId} aria-live="polite" className="mt-2 text-sm">
        {hovered === null ? (
          <span className="text-muted-foreground">{me.finance.chartHint}</span>
        ) : (
          <>
            <span className="font-medium">
              {monthLabel(data[hovered].month)}
            </span>
            <span className="text-muted-foreground">
              {" — "}
              {me.finance.income}: {formatMoney(data[hovered].income)}
              {", "}
              {me.finance.expenses}: {formatMoney(data[hovered].expenses)}
            </span>
          </>
        )}
      </p>
    </figure>
  );
}
