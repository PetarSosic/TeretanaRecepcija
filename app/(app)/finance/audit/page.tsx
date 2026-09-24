import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableWrapper, Td, Th } from "@/components/ui/table";
import {
  AUDITED_TABLES,
  auditReferences,
  auditSubject,
  type AuditLookups,
  type AuditRow,
} from "@/features/finance/audit-format";
import { AuditDiff } from "@/features/finance/components/audit-diff";
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

/**
 * US-24.1 and N-21: the audited tables (BR-096), by the names the screens use. Only
 * these are offered in the filter; a table with no trigger would always list nothing.
 */
const TABLES: Record<string, string> = me.audit.tables;

const ACTIONS: Record<string, string> = {
  insert: me.finance.actionInsert,
  update: me.finance.actionUpdate,
  void: me.finance.actionVoid,
  anonymize: me.finance.actionAnonymize,
};

type Named = { id: string; name: string };
type Person = { id: string; full_name: string };

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

  const names = new Map(
    (people.data ?? []).map((row) => [row.id, row.full_name]),
  );
  const list = rows.data ?? [];

  // N-21: every id an entry points at becomes a name. The member list is fetched by the
  // ids on the page; the catalogues are small enough to read whole.
  const ids = auditReferences(list);
  const [members, plans, trainers, categories, products] = await Promise.all([
    ids.members.size
      ? supabase
          .from("members")
          .select("id, member_number, first_name, last_name")
          .in("id", [...ids.members])
          .returns<
            {
              id: string;
              member_number: number;
              first_name: string;
              last_name: string;
            }[]
          >()
      : Promise.resolve({ data: [] }),
    supabase.from("plans").select("id, name").returns<Named[]>(),
    supabase.from("trainers").select("id, full_name").returns<Person[]>(),
    supabase.from("expense_categories").select("id, name").returns<Named[]>(),
    supabase.from("products").select("id, name").returns<Named[]>(),
  ]);
  const lookups: AuditLookups = {
    staff: names,
    members: new Map(
      (members.data ?? []).map((m) => [
        m.id,
        `#${m.member_number} ${m.first_name} ${m.last_name}`,
      ]),
    ),
    plans: new Map((plans.data ?? []).map((row) => [row.id, row.name])),
    trainers: new Map(
      (trainers.data ?? []).map((row) => [row.id, row.full_name]),
    ),
    categories: new Map(
      (categories.data ?? []).map((row) => [row.id, row.name]),
    ),
    products: new Map((products.data ?? []).map((row) => [row.id, row.name])),
  };

  return (
    <div className="grid grid-cols-1 gap-6">
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
            {AUDITED_TABLES.map((value) => (
              <option key={value} value={value}>
                {TABLES[value]}
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
                      <span className="block">
                        {TABLES[row.table_name] ?? row.table_name}
                      </span>
                      {auditSubject(row, lookups) ? (
                        <span className="block text-xs text-muted-foreground">
                          {auditSubject(row, lookups)}
                        </span>
                      ) : null}
                    </Td>
                    <Td className="align-top">
                      <AuditDiff row={row} lookups={lookups} />
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
