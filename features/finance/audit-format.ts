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

/** The names an audit entry points at, by id, fetched once for the whole page. */
export type AuditLookups = {
  staff: Map<string, string>;
  members: Map<string, string>;
  plans: Map<string, string>;
  trainers: Map<string, string>;
  categories: Map<string, string>;
  products: Map<string, string>;
};

export type AuditChange = {
  column: string;
  label: string;
  before: string;
  after: string;
};

type AuditedTable = keyof typeof me.audit.tables;

/** BR-096 and doc 07 §3: the tables with an audit trigger, in the filter's order. */
export const AUDITED_TABLES = Object.keys(me.audit.tables) as AuditedTable[];

/**
 * N-21: columns a reader has no use for. Keys and bookkeeping (`id`, `gym_id`,
 * `shift_id`…), and who and when, which the row's own "Korisnik" and "Vrijeme" already
 * say. `void_reason` stays: it is the part of a void that a person wrote.
 */
const HIDDEN = new Set([
  "id",
  "gym_id",
  "user_id",
  "search_text",
  "created_at",
  "updated_at",
  "created_by",
  "voided_at",
  "voided_by",
  "anonymized_at",
  "shift_id",
  "membership_id",
  "stock_movement_id",
]);

/** Money columns, so a change reads "79,00 €" rather than "79.00". */
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
  "current_purchase_price",
  "sale_price",
]);

const PERCENT = new Set(["trainer_share_pct", "group_share_pct"]);

const REFERENCES: Record<string, keyof AuditLookups> = {
  member_id: "members",
  plan_id: "plans",
  trainer_id: "trainers",
  category_id: "categories",
  product_id: "products",
};

const PAYMENT_KINDS: Record<string, string> = {
  membership: me.audit.values.membership,
  day_pass: me.audit.values.dayPass,
  card_replacement: me.audit.values.cardReplacement,
};

const PLAN_KINDS: Record<string, string> = {
  gym: me.audit.values.planGym,
  group: me.audit.values.planGroup,
  combo: me.audit.values.planCombo,
  personal: me.audit.values.planPersonal,
  day_pass: me.audit.values.dayPass,
};

const ENUMS: Record<string, Record<string, string>> = {
  method: { cash: me.audit.values.cash, card: me.audit.values.card },
  type: { in: me.audit.values.stockIn, out: me.audit.values.stockOut },
  duration_unit: { day: me.audit.values.days, month: me.audit.values.months },
  role: me.roles,
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T/;
const percent = new Intl.NumberFormat("sr-Latn-ME", {
  maximumFractionDigits: 2,
});

function label(column: string): string {
  return (me.audit.fields as Record<string, string>)[column] ?? column;
}

/** One stored value as the screen shows it. */
export function auditValue(
  table: string,
  column: string,
  value: unknown,
  lookups: AuditLookups,
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? me.users.yes : me.users.no;
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  const text = String(value);
  const reference = REFERENCES[column];
  if (reference) return lookups[reference].get(text) ?? me.audit.values.unknown;
  if (column === "kind")
    return (table === "plans" ? PLAN_KINDS : PAYMENT_KINDS)[text] ?? text;
  if (ENUMS[column]) return ENUMS[column][text] ?? text;
  if (column === "logo_path") return me.audit.values.logoSet;
  if (column === "auto_close_time") return text.slice(0, 5);
  try {
    if (MONEY.has(column)) return formatMoney(text);
    if (PERCENT.has(column)) return `${percent.format(Number(text))} %`;
    if (DATE.test(text)) return formatDate(text);
    if (TIMESTAMP.test(text)) return formatDateTime(text);
  } catch {
    // A value that is not the shape it looks like is shown as it was stored.
  }
  return text;
}

/**
 * US-24.1: `polje: staro → novo` with the screen's own words. An insert lists what was
 * set (empty fields left out), an update or a void only what actually moved.
 */
export function auditChanges(
  row: AuditRow,
  lookups: AuditLookups,
): AuditChange[] {
  const before = row.old_data ?? {};
  const after = row.new_data ?? {};
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((column) => !HIDDEN.has(column))
    .filter(
      (column) =>
        JSON.stringify(before[column]) !== JSON.stringify(after[column]),
    )
    .filter(
      (column) =>
        row.action !== "insert" ||
        (after[column] !== null && after[column] !== ""),
    )
    .map((column) => ({
      column,
      label: label(column),
      before: auditValue(row.table_name, column, before[column], lookups),
      after: auditValue(row.table_name, column, after[column], lookups),
    }));
}

/** Which record an entry is about, e.g. "#12 Ana Anić" or "Kirija: septembar". */
export function auditSubject(
  row: AuditRow,
  lookups: AuditLookups,
): string | null {
  const data = { ...(row.old_data ?? {}), ...(row.new_data ?? {}) };
  const text = (column: string) =>
    data[column] === null || data[column] === undefined
      ? ""
      : String(data[column]);
  const ref = (column: string) =>
    auditValue(row.table_name, column, data[column], lookups);
  const member = () => (data.member_id ? ref("member_id") : null);
  const joined = (...parts: (string | null)[]) =>
    parts.filter(Boolean).join(" – ") || null;

  switch (row.table_name as AuditedTable) {
    case "members":
      return `#${text("member_number")} ${text("first_name")} ${text("last_name")}`.trim();
    case "memberships":
      return joined(ref("plan_id"), member());
    case "payments":
      if (data.kind === "day_pass")
        return `${me.audit.values.dayPass} × ${text("quantity")}`;
      if (data.kind === "card_replacement")
        return joined(me.audit.values.cardReplacement, member());
      return joined(ref("plan_id"), member());
    case "expenses":
      return `${ref("category_id")}: ${text("description")}`;
    case "stock_movements":
      return `${auditValue(row.table_name, "type", data.type, lookups)}: ${ref("product_id")} × ${text("quantity")}`;
    case "plan_finance":
      return ref("plan_id");
    case "trainer_finance":
      return ref("trainer_id");
    case "plans":
    case "products":
    case "expense_categories":
      return text("name") || null;
    case "staff":
      return text("full_name") || null;
    default:
      return null;
  }
}

/** Every id the page's entries point at, so each name is fetched once. */
export function auditReferences(rows: AuditRow[]) {
  const ids = {
    members: new Set<string>(),
    plans: new Set<string>(),
    trainers: new Set<string>(),
    categories: new Set<string>(),
    products: new Set<string>(),
  };
  for (const row of rows)
    for (const data of [row.old_data, row.new_data])
      for (const [column, kind] of Object.entries(REFERENCES)) {
        const id = data?.[column];
        if (typeof id === "string" && id) ids[kind as keyof typeof ids].add(id);
      }
  return ids;
}
