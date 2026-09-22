import { resolve } from "node:path";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { money, type ShiftReport } from "@/features/shifts/types";
import { formatDateTime, formatMoney, formatTime } from "@/lib/format";
import { me } from "@/lib/i18n/me";

/**
 * BR-117: the shift report. A4 portrait with page numbers `Strana X od Y` (doc 08 §7),
 * in Noto Sans so č ć š ž đ render (the same embedded font as the card sheet).
 */
Font.register({
  family: "NotoSans",
  src: resolve(process.cwd(), "lib/pdf/fonts/NotoSans-Regular.ttf"),
});

const MM = 2.834645669;

const styles = StyleSheet.create({
  page: {
    fontFamily: "NotoSans",
    fontSize: 9,
    paddingTop: 15 * MM,
    paddingBottom: 18 * MM,
    paddingHorizontal: 15 * MM,
    color: "#1a1a1a",
  },
  title: { fontSize: 16, marginBottom: 4 * MM },
  header: { marginBottom: 5 * MM },
  headerRow: { flexDirection: "row", marginBottom: 1 * MM },
  headerLabel: { width: 42 * MM, color: "#555555" },
  note: {
    marginTop: 2 * MM,
    padding: 2 * MM,
    borderWidth: 0.5,
    borderColor: "#999999",
  },
  section: { marginTop: 5 * MM },
  sectionTitle: { fontSize: 11, marginBottom: 1.5 * MM },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.4,
    borderBottomColor: "#d0d0d0",
    paddingVertical: 1 * MM,
  },
  headRow: {
    flexDirection: "row",
    borderBottomWidth: 0.8,
    borderBottomColor: "#888888",
    paddingVertical: 1 * MM,
    color: "#555555",
  },
  cell: { flex: 1, paddingRight: 1.5 * MM },
  right: { textAlign: "right" },
  empty: { color: "#777777" },
  totals: { marginTop: 5 * MM, width: 95 * MM },
  footer: {
    position: "absolute",
    bottom: 8 * MM,
    left: 15 * MM,
    right: 15 * MM,
    textAlign: "center",
    color: "#777777",
  },
});

type Column = { label: string; width?: number; right?: boolean };

function Table({ columns, rows }: { columns: Column[]; rows: string[][] }) {
  if (rows.length === 0)
    return <Text style={styles.empty}>{me.report.none}</Text>;
  const cell = (column: Column) => [
    styles.cell,
    column.width ? { flex: column.width } : {},
    column.right ? styles.right : {},
  ];
  return (
    <View>
      <View style={styles.headRow} fixed>
        {/* The position, not the label: the totals table has two unlabelled columns. */}
        {columns.map((column, index) => (
          <Text key={index} style={cell(column)}>
            {column.label}
          </Text>
        ))}
      </View>
      {rows.map((row, index) => (
        <View key={index} style={styles.row} wrap={false}>
          {row.map((value, column) => (
            <Text key={column} style={cell(columns[column])}>
              {value}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const KIND: Record<ShiftReport["payments"][number]["kind"], string> = {
  membership: me.members.kindMembership,
  day_pass: me.members.kindDayPass,
  card_replacement: me.members.kindCardReplacement,
};
const RECORD: Record<ShiftReport["voided"][number]["record"], string> = {
  payment: me.report.recordPayment,
  sale: me.report.recordSale,
  expense: me.report.recordExpense,
};
const method = (value: "cash" | "card") =>
  value === "cash" ? me.memberships.cash : me.memberships.card;

/** BR-117 header: "Zaključio/la recepcioner", "Preuzeo/la <ime>" or "Automatski". */
export function closeTypeLabel(shift: ShiftReport["shift"]): string {
  switch (shift.close_type) {
    case "manual":
      return me.report.closedManual;
    case "takeover":
      return me.report.closedTakeover.replace(
        "{name}",
        shift.closed_by_name ?? "—",
      );
    case "auto":
      return me.report.closedAuto;
    default:
      return me.report.stillOpen;
  }
}

function ShiftReportDocument({
  report,
  generatedAt,
}: {
  report: ShiftReport;
  generatedAt: Date;
}) {
  const { shift, totals } = report;
  const difference =
    totals.difference === null
      ? "—"
      : `${formatMoney(money(totals.difference))} (${
          totals.difference < 0 ? me.closeShift.shortage : me.closeShift.surplus
        })`;
  const header: [string, string][] = [
    [me.report.gym, shift.gym_name],
    [me.report.receptionist, shift.staff_name],
    [me.report.start, formatDateTime(shift.started_at)],
    [me.report.end, shift.closed_at ? formatDateTime(shift.closed_at) : "—"],
    [me.report.closeType, closeTypeLabel(shift)],
    [me.report.generatedAt, formatDateTime(generatedAt)],
  ];

  return (
    <Document
      title={`${me.report.title} – ${shift.staff_name}`}
      language="sr-Latn-ME"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{me.report.title}</Text>
          {header.map(([label, value]) => (
            <View key={label} style={styles.headerRow}>
              <Text style={styles.headerLabel}>{label}</Text>
              <Text>{value}</Text>
            </View>
          ))}
          {/* BR-116: an automatic close says so, because nobody counted the cash. */}
          {shift.close_type === "auto" && shift.closed_at ? (
            <Text style={styles.note}>
              {me.report.autoNote.replace(
                "{time}",
                formatTime(shift.closed_at),
              )}
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{me.report.payments}</Text>
          <Table
            columns={[
              { label: me.report.time, width: 0.7 },
              { label: me.report.member, width: 1.8 },
              { label: me.report.kind, width: 1.7 },
              { label: me.report.plan, width: 1.4 },
              { label: me.report.method, width: 1.1 },
              { label: me.report.amount, width: 1, right: true },
              { label: me.report.enteredBy, width: 1.4 },
            ]}
            rows={report.payments.map((payment) => [
              formatTime(payment.created_at),
              payment.member ?? "—",
              payment.kind === "day_pass"
                ? `${KIND[payment.kind]} × ${payment.quantity}`
                : KIND[payment.kind],
              payment.plan ?? "—",
              method(payment.method),
              formatMoney(money(payment.amount)),
              payment.entered_by,
            ])}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{me.report.dayPasses}</Text>
          <Table
            columns={[
              { label: me.report.method },
              { label: me.report.quantity, right: true },
              { label: me.report.total, right: true },
            ]}
            rows={report.day_passes.map((row) => [
              method(row.method),
              String(row.quantity),
              formatMoney(money(row.total)),
            ])}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{me.report.cardReplacements}</Text>
          <Table
            columns={[
              { label: me.report.count, right: true },
              { label: me.report.total, right: true },
            ]}
            rows={[
              [
                String(report.card_replacements.count),
                formatMoney(money(report.card_replacements.total)),
              ],
            ]}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{me.report.sales}</Text>
          <Table
            columns={[
              { label: me.report.time, width: 0.7 },
              { label: me.report.product, width: 2 },
              { label: me.report.quantity, right: true },
              { label: me.report.method },
              { label: me.report.amount, right: true },
            ]}
            rows={report.sales.map((sale) => [
              formatTime(sale.created_at),
              sale.product,
              String(sale.quantity),
              method(sale.method),
              formatMoney(money(sale.amount)),
            ])}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{me.report.tillExpenses}</Text>
          <Table
            columns={[
              { label: me.report.time, width: 0.7 },
              { label: me.report.category, width: 1.4 },
              { label: me.report.description, width: 2.4 },
              { label: me.report.amount, right: true },
              { label: me.report.enteredBy, width: 1.4 },
            ]}
            rows={report.till_expenses.map((expense) => [
              formatTime(expense.created_at),
              expense.category,
              expense.description,
              formatMoney(money(expense.amount)),
              expense.entered_by,
            ])}
          />
        </View>

        <View style={styles.totals} wrap={false}>
          <Text style={styles.sectionTitle}>{me.report.totals}</Text>
          <Table
            columns={[
              { label: "", width: 2 },
              { label: "", right: true },
            ]}
            rows={[
              [
                me.closeShift.cashIncome,
                formatMoney(money(totals.cash_income)),
              ],
              [
                me.closeShift.cardIncome,
                formatMoney(money(totals.card_income)),
              ],
              [
                me.closeShift.tillExpenses,
                formatMoney(money(totals.till_expenses)),
              ],
              [
                me.closeShift.expectedCash,
                formatMoney(money(totals.expected_cash)),
              ],
              [
                me.report.countedCash,
                totals.counted_cash === null
                  ? me.report.notCounted
                  : formatMoney(money(totals.counted_cash)),
              ],
              [me.report.difference, difference],
            ]}
          />
        </View>

        {/* BR-117: the members still inside when the shift ended. */}
        <Text style={styles.section}>
          {me.report.openVisits.replace("{count}", String(report.open_visits))}
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{me.report.voided}</Text>
          <Table
            columns={[
              { label: me.report.time, width: 0.7 },
              { label: me.report.record },
              { label: me.report.description, width: 2 },
              { label: me.report.amount, right: true },
              { label: me.report.reason, width: 2 },
            ]}
            rows={report.voided.map((row) => [
              formatTime(row.created_at),
              RECORD[row.record],
              row.description || "—",
              formatMoney(money(row.amount)),
              row.reason,
            ])}
          />
        </View>

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            me.report.page
              .replace("{page}", String(pageNumber))
              .replace("{pages}", String(totalPages))
          }
        />
      </Page>
    </Document>
  );
}

export function renderShiftReport(
  report: ShiftReport,
  generatedAt: Date = new Date(),
): Promise<Buffer> {
  return renderToBuffer(
    <ShiftReportDocument report={report} generatedAt={generatedAt} />,
  );
}
