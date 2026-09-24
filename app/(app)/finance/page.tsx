import type { Metadata } from "next";
import Link from "next/link";
import { Table, TableWrapper, Td, Th } from "@/components/ui/table";
import {
  BreakdownTable,
  type BreakdownRow,
} from "@/features/finance/components/breakdown-table";
import { ChartPicker } from "@/features/finance/components/chart-picker";
import {
  IncomeChart,
  type Chart,
} from "@/features/finance/components/income-chart";
import { PeriodPicker } from "@/features/finance/components/period-picker";
import {
  StatCards,
  type Summary,
} from "@/features/finance/components/stat-cards";
import { chartFromParams, periodFromParams } from "@/features/finance/period";
import { requireStaff } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { gymToday } from "@/lib/gym-date";
import { me } from "@/lib/i18n/me";
import { rpcCode } from "@/lib/rpc";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `${me.finance.title} — ${me.app.name}`,
};

type Expiring = {
  membership_id: string;
  member_id: string;
  member_number: number;
  member_name: string;
  phone: string | null;
  plan_name: string;
  end_date: string;
};

type Unpaid = {
  member_id: string;
  member_number: number;
  member_name: string;
  phone: string | null;
  unpaid_count: number;
  oldest: string;
};

type Breakdown = {
  by_plan: BreakdownRow[];
  by_method: { name: string; total: string; count: number }[];
  by_category: BreakdownRow[];
};

const METHODS: Record<string, string> = {
  cash: me.finance.methodCash,
  card: me.finance.methodCard,
};

/** S-16 (F-17). The layout above has already refused every role but owner and admin. */
export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
    year?: string;
    month?: string;
  }>;
}) {
  const staff = await requireStaff();
  const params = await searchParams;
  const today = await gymToday(staff.gym_id);
  const period = periodFromParams(params, today);
  // D-68: the chart has its own year and month, and opens on the whole current year.
  const range = chartFromParams(params, today);

  const supabase = await createClient();
  const [summary, breakdown, chart, expiring, unpaid] = await Promise.all([
    supabase.rpc("fin_summary", { p_from: period.from, p_to: period.to }),
    supabase.rpc("fin_income_breakdown", {
      p_from: period.from,
      p_to: period.to,
    }),
    supabase.rpc("fin_chart", { p_year: range.year, p_month: range.month }),
    supabase.rpc("fin_expiring", { p_days: 7 }),
    supabase.rpc("fin_unpaid_members"),
  ]);

  const totals = summary.data as Summary | null;
  // SUSPECT-01: a rejected call answers with null data; say so instead of an empty chart.
  const chartFailure = chart.error ? getErrorMessage(rpcCode(chart.error)) : null;
  const chartData = chartFailure ? null : (chart.data as Chart | null);
  const split = (breakdown.data as Breakdown | null) ?? {
    by_plan: [],
    by_method: [],
    by_category: [],
  };
  const expiringRows = (expiring.data as Expiring[] | null) ?? [];
  const unpaidRows = (unpaid.data as Unpaid[] | null) ?? [];

  return (
    <div className="grid grid-cols-1 gap-8">
      <PeriodPicker period={period} />

      {totals ? <StatCards summary={totals} /> : null}

      {/* N-24: minmax(0, 1fr), so the chart scrolls inside its frame at 375 px. */}
      <section className="grid grid-cols-1 gap-4">
        <ChartPicker
          range={range}
          firstYear={chartData?.first_year ?? range.year}
          today={today}
        />
        {chartFailure ? (
          <p className="text-sm text-danger">{chartFailure}</p>
        ) : chartData ? (
          <IncomeChart chart={chartData} />
        ) : (
          <p className="text-sm text-muted-foreground">{me.finance.noData}</p>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <BreakdownTable
          title={me.finance.byPlan}
          rows={split.by_plan}
          countLabel={me.finance.count}
        />
        <BreakdownTable
          title={me.finance.byCategory}
          rows={split.by_category}
          countLabel={me.finance.count}
        />
      </div>

      <BreakdownTable
        title={me.finance.byMethod}
        rows={split.by_method.map((row) => ({
          ...row,
          name: METHODS[row.name] ?? row.name,
        }))}
        countLabel={me.finance.count}
      />

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          {me.finance.expiringTitle}
        </h2>
        {expiringRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {me.finance.expiringEmpty}
          </p>
        ) : (
          <TableWrapper>
            <Table>
              <thead>
                <tr>
                  <Th>{me.finance.member}</Th>
                  <Th>{me.finance.phone}</Th>
                  <Th>{me.finance.plan}</Th>
                  <Th>{me.finance.endDate}</Th>
                </tr>
              </thead>
              <tbody>
                {expiringRows.map((row) => (
                  <tr key={row.membership_id}>
                    <Td>
                      <Link
                        href={`/members/${row.member_id}`}
                        className="underline underline-offset-4"
                      >
                        #{row.member_number} {row.member_name}
                      </Link>
                    </Td>
                    <Td>{row.phone ?? "—"}</Td>
                    <Td>{row.plan_name}</Td>
                    <Td>{formatDate(row.end_date)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrapper>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{me.finance.unpaidTitle}</h2>
        {unpaidRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {me.finance.unpaidEmpty}
          </p>
        ) : (
          <TableWrapper>
            <Table>
              <thead>
                <tr>
                  <Th>{me.finance.member}</Th>
                  <Th>{me.finance.phone}</Th>
                  <Th className="text-right">{me.finance.unpaidCount}</Th>
                  <Th>{me.finance.oldest}</Th>
                </tr>
              </thead>
              <tbody>
                {unpaidRows.map((row) => (
                  <tr key={row.member_id}>
                    <Td>
                      <Link
                        href={`/members/${row.member_id}`}
                        className="underline underline-offset-4"
                      >
                        #{row.member_number} {row.member_name}
                      </Link>
                    </Td>
                    <Td>{row.phone ?? "—"}</Td>
                    <Td className="text-right tabular-nums">
                      {row.unpaid_count}
                    </Td>
                    <Td>{formatDate(row.oldest)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrapper>
        )}
      </section>
    </div>
  );
}
