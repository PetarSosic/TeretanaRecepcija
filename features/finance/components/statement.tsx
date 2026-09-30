import { Table, TableWrapper, Td, Th } from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/format";
import { me } from "@/lib/i18n/me";
import { cn } from "@/lib/utils";

/** `fin_statement` (D-92). Money is decimal text, as numeric arrives (BR-003). */
export type Statement = {
  income: {
    memberships: string;
    training: string;
    storage: string;
    other: string;
    total: string;
  };
  cogs: string;
  gross_profit: string;
  operating: { name: string; total: string }[];
  operating_total: string;
  profit: string;
  cash_flow: {
    received: string;
    goods_paid: string;
    other_paid: string;
    net_change: string;
  };
  stock_value: string;
  stock_value_date: string;
};

const negative = (value: string) => value.trim().startsWith("-");

/** A result that can go either way states its sign in the number, not in colour alone. */
function signed(value: string): string {
  return negative(value) || Number(value) === 0
    ? formatMoney(value)
    : `+${formatMoney(value)}`;
}

function Line({
  label,
  value,
  strong = false,
  indent = false,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  indent?: boolean;
  tone?: "result";
}) {
  const loss = tone === "result" && negative(value);
  return (
    <tr className={cn(strong && "font-semibold")}>
      <Td className={cn(indent && "pl-6")}>{label}</Td>
      <Td
        className={cn(
          "text-right tabular-nums",
          tone === "result" && (loss ? "text-danger" : "text-success"),
        )}
      >
        {tone === "result" ? signed(value) : formatMoney(value)}
      </Td>
    </tr>
  );
}

function Heading({ children }: { children: string }) {
  return (
    <tr>
      <Th colSpan={2} scope="colgroup" className="pt-4">
        {children}
      </Th>
    </tr>
  );
}

/**
 * S-16 (D-92): what the period earned and what it spent, side by side. On the left the
 * income statement — income, the cost of the goods sold, operating expenses by category,
 * profit (BR-150 to BR-153). On the right the cash flow, where the goods bought count
 * whether or not they were sold (BR-158), and the value of the goods left (BR-159).
 */
export function StatementSection({ statement }: { statement: Statement }) {
  const { income, cash_flow: cash } = statement;

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section>
        <h2 className="mb-3 text-lg font-semibold">
          {me.finance.statementTitle}
        </h2>
        <TableWrapper>
          <Table>
            <tbody>
              <Heading>{me.finance.statementIncome}</Heading>
              <Line
                label={me.finance.incomeMemberships}
                value={income.memberships}
                indent
              />
              <Line
                label={me.finance.incomeTraining}
                value={income.training}
                indent
              />
              <Line
                label={me.finance.incomeStorage}
                value={income.storage}
                indent
              />
              <Line
                label={me.finance.incomeOther}
                value={income.other}
                indent
              />
              <Line
                label={me.finance.incomeTotal}
                value={income.total}
                strong
              />
              <Line label={me.finance.cogs} value={statement.cogs} strong />
              <Line
                label={me.finance.grossProfit}
                value={statement.gross_profit}
                strong
              />
              <Heading>{me.finance.operatingExpenses}</Heading>
              {statement.operating.length === 0 ? (
                <tr>
                  <Td colSpan={2} className="pl-6 text-muted-foreground">
                    {me.finance.operatingEmpty}
                  </Td>
                </tr>
              ) : (
                statement.operating.map((row) => (
                  <Line
                    key={row.name}
                    label={row.name}
                    value={row.total}
                    indent
                  />
                ))
              )}
              <Line
                label={me.finance.operatingTotal}
                value={statement.operating_total}
                strong
              />
              <Line
                label={me.finance.profit}
                value={statement.profit}
                strong
                tone="result"
              />
            </tbody>
          </Table>
        </TableWrapper>
      </section>

      <section className="grid content-start gap-6">
        <div>
          <h2 className="mb-3 text-lg font-semibold">
            {me.finance.cashFlowTitle}
          </h2>
          <TableWrapper>
            <Table>
              <tbody>
                <Line label={me.finance.cashReceived} value={cash.received} />
                <Line
                  label={me.finance.cashGoodsPaid}
                  value={cash.goods_paid}
                />
                <Line
                  label={me.finance.cashOtherPaid}
                  value={cash.other_paid}
                />
                <Line
                  label={me.finance.cashNetChange}
                  value={cash.net_change}
                  strong
                  tone="result"
                />
              </tbody>
            </Table>
          </TableWrapper>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">
            {me.finance.stockValueOn.replace(
              "{date}",
              formatDate(statement.stock_value_date),
            )}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatMoney(statement.stock_value)}
          </p>
        </div>
      </section>
    </div>
  );
}
