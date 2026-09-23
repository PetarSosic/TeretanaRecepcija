import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableWrapper, Td, Th } from "@/components/ui/table";
import {
  AuditDiff,
  type AuditRow,
} from "@/features/finance/components/audit-diff";
import { PeriodPicker } from "@/features/finance/components/period-picker";
import { periodFromParams, periodInstants } from "@/features/finance/period";
import { requireStaff } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { gymToday } from "@/lib/gym-date";
import { me } from "@/lib/i18n/me";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `${me.finance.auditTitle} — ${me.app.name}`,
};

/** US-24.1: the tables an owner recognises, with the names the glossary uses (doc 02). */
const TABLES: Record<string, string> = {
  members: me.nav.members,
  memberships: me.finance.plan,
  payments: me.payments.title,
  visits: me.finance.visits,
  expenses: me.finance.expensesTitle,
  stock_movements: me.finance.storageTitle,
  shifts: me.finance.shiftsTitle,
  cards: me.nav.cards,
  plans: me.settings.plansTitle,
  products: me.settings.productsTitle,
  trainers: me.nav.trainers,
  staff: me.nav.users,
  gym_settings: me.settings.gymTitle,
};

const ACTIONS: Record<string, string> = {
  insert: me.finance.actionInsert,
  update: me.finance.actionUpdate,
  void: me.finance.actionVoid,
  anonymize: me.finance.actionAnonymize,
};

/** Doc 08 §9: one screenful of history at a time; the filters narrow it further. */
const LIMIT = 200;

/** S-21 (F-24). The layout has already refused every role but owner and admin. */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
    user?: string;
    table?: string;
  }>;
}) {
  const staff = await requireStaff();
  const params = await searchParams;
  const period = periodFromParams(params, await gymToday(staff.gym_id));

  // The period is a range of local dates and the column a timestamp: N-18 takes each
  // end's own offset, where a fixed +02:00 misread every winter (CET) day by an hour.
  const { start, end } = periodInstants(period);

  const supabase = await createClient();
  let query = supabase
    .from("audit_log")
    .select(
      "id, table_name, row_id, action, old_data, new_data, changed_by, changed_at",
    )
    .gte("changed_at", start)
    .lt("changed_at", end)
    .order("changed_at", { ascending: false })
    .limit(LIMIT);
  if (params.user) query = query.eq("changed_by", params.user);
  if (params.table) query = query.eq("table_name", params.table);

  const [rows, people] = await Promise.all([
    query.returns<AuditRow[]>(),
    supabase
      .from("staff")
      .select("id, full_name")
      .order("full_name")
      .returns<{ id: string; full_name: string }[]>(),
  ]);

  const names = new Map((people.data ?? []).map((row) => [row.id, row.full_name]));
  const list = rows.data ?? [];

  return (
    <div className="grid gap-6">
      <PeriodPicker period={period} />

      <form className="flex flex-wrap items-end gap-3" method="get">
        <input type="hidden" name="period" value={period.preset} />
        {period.preset === "custom" ? (
          <>
            <input type="hidden" name="from" value={period.from} />
            <input type="hidden" name="to" value={period.to} />
          </>
        ) : null}
        <div className="grid gap-1.5">
          <Label htmlFor="user">{me.finance.user}</Label>
          <Select
            id="user"
            name="user"
            defaultValue={params.user ?? ""}
            className="w-52"
          >
            <option value="">{me.finance.allUsers}</option>
            {(people.data ?? []).map((person) => (
              <option key={person.id} value={person.id}>
                {person.full_name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="table">{me.finance.record}</Label>
          <Select
            id="table"
            name="table"
            defaultValue={params.table ?? ""}
            className="w-52"
          >
            <option value="">{me.finance.allRecords}</option>
            {Object.entries(TABLES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="outline">
          {me.finance.apply}
        </Button>
      </form>

      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">{me.finance.auditEmpty}</p>
      ) : (
        <>
          <TableWrapper>
            <Table>
              <thead>
                <tr>
                  <Th>{me.finance.time}</Th>
                  <Th>{me.finance.user}</Th>
                  <Th>{me.finance.action}</Th>
                  <Th>{me.finance.record}</Th>
                  <Th>{me.finance.changes}</Th>
                </tr>
              </thead>
              <tbody>
                {list.map((row) => (
                  <tr key={row.id}>
                    <Td className="whitespace-nowrap align-top">
                      {formatDateTime(row.changed_at)}
                    </Td>
                    <Td className="align-top">
                      {/* A null actor is a scheduled job (doc 07 §3). */}
                      {row.changed_by
                        ? (names.get(row.changed_by) ?? me.finance.system)
                        : me.finance.system}
                    </Td>
                    <Td className="align-top">{ACTIONS[row.action]}</Td>
                    <Td className="align-top">
                      {TABLES[row.table_name] ?? row.table_name}
                    </Td>
                    <Td className="align-top">
                      <AuditDiff row={row} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrapper>
          {list.length === LIMIT ? (
            <p className="text-sm text-muted-foreground">
              {me.finance.auditMore.replace("{count}", String(LIMIT))}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
