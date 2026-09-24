"use client";

import { useId, useState } from "react";
import { formatDate, formatMoney } from "@/lib/format";
import { me } from "@/lib/i18n/me";

export type ChartPoint = {
  /** `YYYY-MM-DD`: the first of the month in a year, or the day in a month. */
  date: string;
  /** Decimal text, as numeric arrives (BR-003); null for a slot after today. */
  income: string | null;
  expenses: string | null;
};

/** What `fin_chart` returns (D-68). */
export type Chart = {
  year: number;
  month: number | null;
  first_year: number;
  points: ChartPoint[];
  income: string;
  expenses: string;
  profit: string;
};

/** BR-003: decimal text to cents, without ever building a float. */
function cents(value: string): number {
  const [whole, fraction = ""] = value.replace(",", ".").split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
}

// Axis ticks are whole euros: the exact figures live in the hover line and the totals.
const wholeEuros = new Intl.NumberFormat("sr-Latn-ME", {
  maximumFractionDigits: 0,
});

function monthIndex(date: string): number {
  return Number(date.slice(5, 7)) - 1;
}

/** The chart's period in words, for the totals line: `2026` or `mart 2026`. */
export function chartPeriodName(chart: Pick<Chart, "year" | "month">): string {
  return chart.month === null
    ? String(chart.year)
    : `${me.finance.monthNames[chart.month - 1]} ${chart.year}`;
}

/**
 * US-17.1 AC3 and D-68: income against expenses over one calendar year by month, or over
 * one month by day.
 *
 * Two series over time, so the columns are grouped rather than stacked — the reader's
 * job is to compare the pair within each slot, not to add them up. Identity never rests
 * on colour alone: the legend names both series, the hovered slot is labelled with both
 * figures in words, and the totals line under the chart carries the period's sums.
 *
 * The axis always spans the whole year or the whole month, so one year reads against
 * another; a slot after the gym's today is left empty rather than drawn as zero.
 */
export function IncomeChart({ chart }: { chart: Chart }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const captionId = useId();
  const byDay = chart.month !== null;
  const data = chart.points;

  const values = data.flatMap((point) =>
    point.income === null || point.expenses === null
      ? []
      : [cents(point.income), cents(point.expenses)],
  );
  const peak = Math.max(...values, 1);
  // A round ceiling so the gridlines land on readable numbers.
  const step = Math.pow(10, Math.max(0, String(Math.round(peak / 4)).length - 1));
  const ceiling = Math.max(Math.ceil(peak / step) * step, step);

  const width = 720;
  const height = 240;
  const padding = { top: 12, right: 12, bottom: 28, left: 64 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const band = plotWidth / Math.max(data.length, 1);
  // Doc: a column is at most 24px thick, and the leftover of the band stays as air.
  const bar = Math.max(Math.min(18, (band - 6) / 2), 2);
  // Thirty-one day numbers do not fit side by side; every other one does.
  const every = Math.ceil(data.length / 16);
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  const y = (value: number) => padding.top + plotHeight * (1 - value / ceiling);

  const axisLabel = (point: ChartPoint) =>
    byDay
      ? String(Number(point.date.slice(8, 10)))
      : me.finance.monthShort[monthIndex(point.date)];
  const slotName = (point: ChartPoint) =>
    byDay
      ? formatDate(point.date)
      : `${me.finance.monthNames[monthIndex(point.date)]} ${chart.year}`;

  // A tap can leave a slot hovered while the filter swaps 31 days for 12 months.
  const active = hovered === null ? null : (data[hovered] ?? null);

  return (
    <figure className="m-0">
      <figcaption className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-medium">
          {byDay ? me.finance.dailyTitle : me.finance.monthlyTitle}
        </span>
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
            const label =
              index % every === 0 ? (
                <text
                  x={left + band / 2}
                  y={height - 8}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[11px]"
                  pointerEvents="none"
                >
                  {axisLabel(point)}
                </text>
              ) : null;
            // A slot after today has no bars and nothing to hover.
            if (point.income === null || point.expenses === null)
              return <g key={point.date}>{label}</g>;
            const income = cents(point.income);
            const expenses = cents(point.expenses);
            return (
              <g key={point.date}>
                {/* A full-height target, so the hover does not depend on hitting a bar. */}
                <rect
                  x={left}
                  y={padding.top}
                  width={band}
                  height={plotHeight}
                  fill={hovered === index ? "var(--muted)" : "transparent"}
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
                {label}
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
        {active === null ||
        active.income === null ||
        active.expenses === null ? (
          <span className="text-muted-foreground">
            {byDay ? me.finance.chartDayHint : me.finance.chartHint}
          </span>
        ) : (
          <>
            <span className="font-medium">{slotName(active)}</span>
            <span className="text-muted-foreground">
              {" — "}
              {me.finance.income}: {formatMoney(active.income)}
              {", "}
              {me.finance.expenses}: {formatMoney(active.expenses)}
            </span>
          </>
        )}
      </p>

      <p className="mt-1 text-sm">
        <span className="font-medium">
          {me.finance.chartTotal.replace("{period}", chartPeriodName(chart))}
        </span>{" "}
        <span className="tabular-nums">
          {me.finance.income} {formatMoney(chart.income)}
          {" · "}
          {me.finance.expenses} {formatMoney(chart.expenses)}
          {" · "}
          {me.finance.profit} {formatMoney(chart.profit)}
        </span>
      </p>
    </figure>
  );
}
