import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableWrapper, Td, Th } from "@/components/ui/table";
import { MonthPicker } from "@/features/finance/components/month-picker";
import { RankedBars } from "@/features/finance/components/ranked-bars";
import { monthFromParam } from "@/features/finance/period";
import { requireStaff } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/format";
import { gymToday } from "@/lib/gym-date";
import { me } from "@/lib/i18n/me";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `${me.finance.trainersTitle} — ${me.app.name}`,
};

type TrainerRow = {
  trainer_id: string;
  trainer_name: string;
  is_active: boolean;
  clients: number;
  group_sessions: number;
  personal_sessions: number;
  /** Decimal text, as numeric(10,2) arrives (BR-003). */
  revenue: string;
  trainer_total: string;
  gym_total: string;
  undefined_count: number;
  paid_out: string;
  difference: string;
};

type PaymentRow = {
  payment_id: string;
  paid_on: string;
  amount: string;
  method: "cash" | "card";
  member_number: number;
  member_name: string;
  plan_name: string;
  is_backdated: boolean;
  trainer_share: string | null;
  gym_share: string | null;
  is_defined: boolean;
  warning: string | null;
};

/** BR-156: a share that was never agreed is shown as "nije definisano", never as €0.00. */
function share(value: string | null, defined: boolean): string {
  return defined && value !== null
    ? formatMoney(value)
    : me.finance.undefinedShare;
}

/** S-18 (F-19). The finance layout has already refused every role but owner and admin. */
export default async function TrainersPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; trainer?: string }>;
}) {
  const staff = await requireStaff();
  const params = await searchParams;
  const today = await gymToday(staff.gym_id);
  const month = monthFromParam(params.month, today);

  const supabase = await createClient();
  const stats = await supabase.rpc("fin_trainer_stats", { p_month: month });
  const rows = (stats.data as TrainerRow[] | null) ?? [];

  const selected = rows.find((row) => row.trainer_id === params.trainer);
  const detail = selected
    ? await supabase.rpc("fin_trainer_payments", {
        p_trainer: selected.trainer_id,
        p_month: month,
      })
    : null;
  const payments = (detail?.data as PaymentRow[] | null) ?? [];

  return (
    <div className="grid grid-cols-1 gap-8">
      <MonthPicker month={month.slice(0, 7)} />

      <RankedBars
        title={`${me.finance.revenue} — ${me.finance.trainersTitle}`}
        rows={rows.map((row) => ({
          label: row.trainer_name,
          value: row.revenue,
        }))}
      />

      <TableWrapper>
        <Table>
          <thead>
            <tr>
              <Th>{me.finance.trainer}</Th>
              <Th className="text-right">{me.finance.clients}</Th>
              <Th className="text-right">{me.finance.groupSessions}</Th>
              <Th className="text-right">{me.finance.personalSessions}</Th>
              <Th className="text-right">{me.finance.revenue}</Th>
              <Th className="text-right">{me.finance.forTrainer}</Th>
              <Th className="text-right">{me.finance.forGym}</Th>
              <Th className="text-right">{me.finance.paidOut}</Th>
              <Th className="text-right">{me.finance.difference}</Th>
              <Th>
                <span className="sr-only">{me.users.actions}</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.trainer_id}>
                <Td>
                  <Link
                    href={`/finance/trainers?month=${month.slice(0, 7)}&trainer=${row.trainer_id}`}
                    className="underline underline-offset-4"
                  >
                    {row.trainer_name}
                  </Link>
                  {/* E12 and OQ-1: the payments whose split was never agreed. */}
                  {row.undefined_count > 0 ? (
                    <span className="block text-xs text-muted-foreground">
                      {me.finance.undefinedShare}: {row.undefined_count}
                    </span>
                  ) : null}
                </Td>
                <Td className="text-right tabular-nums">{row.clients}</Td>
                <Td className="text-right tabular-nums">
                  {row.group_sessions}
                </Td>
                <Td className="text-right tabular-nums">
                  {row.personal_sessions}
                </Td>
                <Td className="text-right tabular-nums">
                  {formatMoney(row.revenue)}
                </Td>
                <Td className="text-right font-medium tabular-nums">
                  {formatMoney(row.trainer_total)}
                </Td>
                <Td className="text-right tabular-nums">
                  {formatMoney(row.gym_total)}
                </Td>
                <Td className="text-right tabular-nums">
                  {formatMoney(row.paid_out)}
                </Td>
                <Td className="text-right tabular-nums">
                  {formatMoney(row.difference)}
                </Td>
                <Td className="text-right">
                  {/* US-19.1 AC2: the S-17 form, prefilled with Plate and the difference. */}
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={`/finance/expenses?payoutTrainer=${row.trainer_id}&payoutAmount=${row.difference}`}
                    >
                      {me.finance.recordPayout}
                    </Link>
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrapper>

      {selected ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold">
            {me.finance.trainerDetail} — {selected.trainer_name}
          </h2>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {me.finance.trainerEmpty}
            </p>
          ) : (
            <TableWrapper>
              <Table>
                <thead>
                  <tr>
                    <Th>{me.finance.date}</Th>
                    <Th>{me.finance.member}</Th>
                    <Th>{me.finance.plan}</Th>
                    <Th className="text-right">{me.finance.amount}</Th>
                    <Th className="text-right">{me.finance.forTrainer}</Th>
                    <Th className="text-right">{me.finance.forGym}</Th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((row) => (
                    <tr key={row.payment_id}>
                      <Td className="whitespace-nowrap">
                        {formatDate(row.paid_on)}
                        {row.is_backdated ? (
                          <span className="ml-2 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {me.finance.backdatedBadge}
                          </span>
                        ) : null}
                      </Td>
                      <Td>
                        #{row.member_number} {row.member_name}
                      </Td>
                      <Td>{row.plan_name}</Td>
                      <Td className="text-right tabular-nums">
                        {formatMoney(row.amount)}
                      </Td>
                      <Td className="text-right tabular-nums">
                        {share(row.trainer_share, row.is_defined)}
                        {row.warning ? (
                          <span className="block text-xs text-danger">
                            {row.warning}
                          </span>
                        ) : null}
                      </Td>
                      <Td className="text-right tabular-nums">
                        {share(row.gym_share, row.is_defined)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrapper>
          )}
        </section>
      ) : null}
    </div>
  );
}
