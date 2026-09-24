"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { me } from "@/lib/i18n/me";
import { CHART_MIN_YEAR, type ChartRange } from "../period";

/**
 * D-68: the S-16 chart's own filter. It opens on the whole of the gym's current year;
 * the year reaches back to the first year that holds any money, and the month narrows
 * the chart to one month of that year, day by day. Like the period, the choice lives in
 * the URL, and it leaves the period of the cards and tables alone.
 */
export function ChartPicker({
  range,
  firstYear,
  today,
}: {
  range: ChartRange;
  /** The earliest year with data, from `fin_chart`. */
  firstYear: number;
  /** BR-001: the gym's today, `yyyy-mm-dd`. */
  today: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const thisYear = Number(today.slice(0, 4));
  const thisMonth = Number(today.slice(5, 7));

  const oldest = Math.max(CHART_MIN_YEAR, Math.min(firstYear, range.year));
  const years: number[] = [];
  for (let year = thisYear; year >= oldest; year--) years.push(year);
  // A month of this year that has not started yet is not offered.
  const lastMonth = range.year === thisYear ? thisMonth : 12;

  function go(year: number, month: number | null): void {
    const search = new URLSearchParams(params.toString());
    search.set("year", String(year));
    // Changing the year keeps the month, so March can be compared with last March.
    if (month === null || (year === thisYear && month > thisMonth))
      search.delete("month");
    else search.set("month", String(month));
    router.push(`${pathname}?${search.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="chart-year">{me.finance.chartYear}</Label>
        <Select
          id="chart-year"
          value={String(range.year)}
          className="w-32"
          onChange={(event) => go(Number(event.target.value), range.month)}
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="chart-month">{me.finance.month}</Label>
        <Select
          id="chart-month"
          value={range.month === null ? "" : String(range.month)}
          className="w-44"
          onChange={(event) =>
            go(
              range.year,
              event.target.value === "" ? null : Number(event.target.value),
            )
          }
        >
          <option value="">{me.finance.chartWholeYear}</option>
          {me.finance.monthNames.slice(0, lastMonth).map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
