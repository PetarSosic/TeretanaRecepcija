import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableWrapper, Td, Th } from "@/components/ui/table";
import { PeriodPicker } from "@/features/finance/components/period-picker";
import { periodFromParams } from "@/features/finance/period";
import { CountBars } from "@/features/stats/components/count-bars";
import { requireStaff } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { formatDate, formatDuration } from "@/lib/format";
import { gymToday } from "@/lib/gym-date";
import { me } from "@/lib/i18n/me";
import { rpcCode } from "@/lib/rpc";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `${me.stats.title} — ${me.app.name}`,
};

type Stats = {
  total: number;
  days: { day: string; count: number }[];
  hours: { hour: number; count: number }[];
  types: { type: "gym" | "group" | "personal"; count: number }[];
  average_seconds: number | null;
  measured_visits: number;
  top_members: {
    member_id: string;
    member_number: number;
    member_name: string;
    count: number;
  }[];
};

const TYPES: Record<string, string> = {
  gym: me.stats.typeGym,
  group: me.stats.typeGroup,
  personal: me.stats.typePersonal,
};

/** S-15 (F-20). Doc 06 §2: the owner, the admin and the manager; never a receptionist. */
export default async function VisitStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const staff = await requireStaff();
  if (staff.role === "receptionist") notFound();

  const period = periodFromParams(
    await searchParams,
    await gymToday(staff.gym_id),
  );

  const supabase = await createClient();
  // SUSPECT-01: a rejected call answers with null data, so an unread error would read
  // as an empty period — a period over 400 days (doc 08 §9) is the case that happens.
  const { data, error } = await supabase.rpc("visit_stats", {
    p_from: period.from,
    p_to: period.to,
  });
  const failure = error ? getErrorMessage(rpcCode(error)) : null;
  const stats = failure ? null : (data as Stats | null);

  return (
    <div className="grid gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">{me.stats.title}</h1>
      <PeriodPicker period={period} />

      {failure ? (
        <p className="text-sm text-danger">{failure}</p>
      ) : !stats || stats.total === 0 ? (
        <p className="text-sm text-muted-foreground">{me.stats.empty}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="gap-2 py-4">
              <CardContent className="px-4">
                <p className="text-sm text-muted-foreground">
                  {me.stats.total}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {stats.total}
                </p>
              </CardContent>
            </Card>
            <Card className="gap-2 py-4">
              <CardContent className="px-4">
                <p className="text-sm text-muted-foreground">
                  {me.stats.averageDuration}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {stats.average_seconds === null
                    ? me.stats.noAverage
                    : formatDuration(stats.average_seconds)}
                </p>
                {/* BR-082: a visit the nightly job closed measures nothing. */}
                <p className="mt-1 text-xs text-muted-foreground">
                  {me.stats.averageHint.replace(
                    "{count}",
                    String(stats.measured_visits),
                  )}
                </p>
              </CardContent>
            </Card>
          </div>

          <CountBars
            title={me.stats.perDay}
            unit={me.stats.visits}
            bars={stats.days.map((day) => ({
              label: formatDate(day.day).slice(0, 5),
              title: formatDate(day.day),
              count: day.count,
            }))}
          />

          <CountBars
            title={me.stats.perHour}
            unit={me.stats.visits}
            bars={stats.hours.map((hour) => ({
              label: String(hour.hour).padStart(2, "0"),
              title: `${String(hour.hour).padStart(2, "0")}:00`,
              count: hour.count,
            }))}
          />

          <section>
            <h2 className="mb-3 text-lg font-semibold">{me.stats.byType}</h2>
            <TableWrapper>
              <Table>
                <thead>
                  <tr>
                    <Th>{me.finance.name}</Th>
                    <Th className="text-right">{me.stats.visitsColumn}</Th>
                  </tr>
                </thead>
                <tbody>
                  {stats.types.map((row) => (
                    <tr key={row.type}>
                      <Td>
                        <span className="block">
                          {TYPES[row.type] ?? row.type}
                        </span>
                        <span
                          aria-hidden="true"
                          className="mt-1 block h-1.5 rounded-full bg-chart-1"
                          style={{
                            width: `${Math.max((row.count / stats.total) * 100, 2)}%`,
                          }}
                        />
                      </Td>
                      <Td className="text-right font-medium tabular-nums">
                        {row.count}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrapper>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">
              {me.stats.topMembers}
            </h2>
            <TableWrapper>
              <Table>
                <thead>
                  <tr>
                    <Th>{me.stats.member}</Th>
                    <Th className="text-right">{me.stats.visitsColumn}</Th>
                  </tr>
                </thead>
                <tbody>
                  {stats.top_members.map((row) => (
                    <tr key={row.member_id}>
                      <Td>
                        <Link
                          href={`/members/${row.member_id}`}
                          className="underline underline-offset-4"
                        >
                          #{row.member_number} {row.member_name}
                        </Link>
                      </Td>
                      <Td className="text-right font-medium tabular-nums">
                        {row.count}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrapper>
          </section>
        </>
      )}
    </div>
  );
}
