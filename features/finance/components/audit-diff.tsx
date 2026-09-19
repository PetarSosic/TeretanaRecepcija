import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { me } from "@/lib/i18n/me";

export type AuditRow = {
  id: number;
  table_name: string;
  row_id: string;
  action: "insert" | "update" | "void" | "anonymize";
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_by: string | null;
  changed_at: string;
};

/** Columns that say nothing a reader wants: they change on every write by definition. */
const NOISE = new Set(["updated_at", "search_text", "created_at"]);

/** Money columns, so a diff shows "79,00 €" rather than "79.00". */
const MONEY = new Set([
  "amount",
  "price",
  "unit_cost",
  "unit_price",
  "counted_cash",
  "card_replacement_price",
  "personal_min_price",
  "gym_fixed_amount",
  "personal_gym_fee",
]);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T/;

function show(column: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? me.users.yes : me.users.no;
  const text = String(value);
  try {
    if (MONEY.has(column)) return formatMoney(text);
    if (DATE.test(text)) return formatDate(text);
    if (TIMESTAMP.test(text)) return formatDateTime(text);
  } catch {
    // A value that is not the shape it looks like is shown as it was stored.
  }
  return text;
}

/**
 * US-24.1: a readable `polje: staro → novo`. An insert lists what was set, an update only
 * what actually moved, and a void or an anonymization is a change like any other — both
 * are recorded as their own action, so the row already says which it was.
 */
export function AuditDiff({ row }: { row: AuditRow }) {
  const before = row.old_data ?? {};
  const after = row.new_data ?? {};
  const columns = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((column) => !NOISE.has(column))
    .filter((column) => JSON.stringify(before[column]) !== JSON.stringify(after[column]));

  if (columns.length === 0)
    return <span className="text-muted-foreground">—</span>;

  return (
    <ul className="grid gap-0.5">
      {columns.map((column) => (
        <li key={column} className="text-xs">
          <span className="text-muted-foreground">{column}: </span>
          {row.action === "insert" ? (
            <span>{show(column, after[column])}</span>
          ) : (
            <>
              <span className="text-muted-foreground line-through">
                {show(column, before[column])}
              </span>
              <span aria-hidden="true"> → </span>
              <span>{show(column, after[column])}</span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
