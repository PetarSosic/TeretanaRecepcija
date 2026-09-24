import { MagnitudeBar } from "@/components/common/magnitude-bar";
import { Table, TableWrapper, Td, Th } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { me } from "@/lib/i18n/me";

export type BreakdownRow = {
  name: string;
  /** Decimal text, as numeric(10,2) arrives (BR-003). */
  total: string;
  count: number;
};

/** BR-003: decimal text to cents, without ever building a float. */
function cents(value: string): number {
  const [whole, fraction = ""] = value.replace(",", ".").split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
}

/**
 * US-17.1 AC2: a breakdown of one total. A dozen plans is more classes than a chart can
 * carry, so the form is a table — with a magnitude bar behind each row, which is what
 * makes the shape of the split readable at a glance without a second figure. One hue,
 * more-is-wider; the exact number is always beside it.
 */
export function BreakdownTable({
  title,
  rows,
  countLabel,
}: {
  title: string;
  rows: BreakdownRow[];
  countLabel: string;
}) {
  const peak = Math.max(...rows.map((row) => cents(row.total)), 1);

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{me.finance.noData}</p>
      ) : (
        <TableWrapper>
          <Table>
            <thead>
              <tr>
                <Th className="w-1/2">{me.finance.name}</Th>
                <Th className="text-right">{countLabel}</Th>
                <Th className="text-right">{me.finance.amount}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name}>
                  <Td>
                    <span className="block">{row.name}</span>
                    <MagnitudeBar
                      className="mt-1 h-1.5"
                      percent={Math.max((cents(row.total) / peak) * 100, 2)}
                    />
                  </Td>
                  <Td className="text-right tabular-nums">{row.count}</Td>
                  <Td className="text-right font-medium tabular-nums">
                    {formatMoney(row.total)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrapper>
      )}
    </section>
  );
}
