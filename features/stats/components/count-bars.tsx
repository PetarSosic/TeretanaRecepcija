"use client";

import { useId, useState } from "react";
import { me } from "@/lib/i18n/me";

export type CountBar = {
  /** The value under the bar, already formatted for the axis. */
  label: string;
  /** What the hover line says, in words. */
  title: string;
  count: number;
};

/**
 * US-20.1: a count over an ordered scale — days of the period, or hours of the day.
 *
 * One series, so there is no legend: the caption says what is plotted. Every bar is a
 * hover target of its own, and the line under the chart names the bar in words with its
 * count, so the figures are readable without measuring anything against the axis.
 *
 * Labels thin out as the period grows: with 90 days on screen, one label per bar is
 * unreadable, so only every nth is drawn and the hover carries the rest.
 */
export function CountBars({
  title,
  bars,
  unit,
}: {
  title: string;
  bars: CountBar[];
  unit: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const captionId = useId();

  if (bars.length === 0)
    return <p className="text-sm text-muted-foreground">{me.stats.empty}</p>;

  const peak = Math.max(...bars.map((bar) => bar.count), 1);
  const width = 720;
  const height = 200;
  const padding = { top: 12, right: 12, bottom: 26, left: 40 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const band = plotWidth / bars.length;
  // Doc: a column is at most 24px thick, and the rest of the band stays as air.
  const bar = Math.min(24, Math.max(band - 4, 2));
  // Room for about 16 labels; past that only every nth is drawn.
  const every = Math.ceil(bars.length / 16);
  const ticks = [0, 0.5, 1];

  const y = (value: number) => padding.top + plotHeight * (1 - value / peak);

  return (
    <figure className="m-0">
      <figcaption className="mb-3 text-sm font-medium">{title}</figcaption>
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-50 w-full min-w-[560px]"
          role="img"
          aria-describedby={captionId}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y(peak * tick)}
                y2={y(peak * tick)}
                stroke="var(--chart-grid)"
                strokeWidth={1}
              />
              <text
                x={padding.left - 8}
                y={y(peak * tick) + 4}
                textAnchor="end"
                className="fill-muted-foreground text-[11px]"
              >
                {Math.round(peak * tick)}
              </text>
            </g>
          ))}

          {bars.map((entry, index) => {
            const left = padding.left + band * index;
            const active = hovered === index;
            return (
              <g key={entry.label + index}>
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
                  x={left + (band - bar) / 2}
                  y={y(entry.count)}
                  width={bar}
                  height={Math.max(padding.top + plotHeight - y(entry.count), 0)}
                  rx={3}
                  fill="var(--chart-1)"
                  pointerEvents="none"
                />
                {index % every === 0 ? (
                  <text
                    x={left + band / 2}
                    y={height - 8}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[11px]"
                    pointerEvents="none"
                  >
                    {entry.label}
                  </text>
                ) : null}
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
          <span className="text-muted-foreground">{me.stats.chartHint}</span>
        ) : (
          <>
            <span className="font-medium">{bars[hovered].title}</span>
            <span className="text-muted-foreground">
              {" — "}
              {bars[hovered].count} {unit}
            </span>
          </>
        )}
      </p>
    </figure>
  );
}
