import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { me } from "@/lib/i18n/me";
import { cn } from "@/lib/utils";

export type Summary = {
  /** Decimal text, as numeric(10,2) arrives (BR-003). */
  income: string;
  expenses: string;
  profit: string;
  bar_profit: string;
  active_members: number;
};

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "profit" | "loss";
}) {
  return (
    <Card className="gap-2 py-4">
      <CardContent className="px-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p
          className={cn(
            "mt-1 text-2xl font-semibold tabular-nums",
            tone === "loss" && "text-danger",
            tone === "profit" && "text-success",
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * S-16 cards: Prihod, Troškovi, Profit, Zarada na magacinu (BR-150 to BR-153), plus the
 * active-member count of US-17.1 AC3. Profit is the one figure that can go either way,
 * so it is the only one that carries a colour — and it states the sign in the number
 * as well, never in the colour alone.
 */
export function StatCards({ summary }: { summary: Summary }) {
  const negative = summary.profit.trim().startsWith("-");

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Tile label={me.finance.income} value={formatMoney(summary.income)} />
      <Tile label={me.finance.expenses} value={formatMoney(summary.expenses)} />
      <Tile
        label={me.finance.profit}
        value={formatMoney(summary.profit)}
        tone={negative ? "loss" : "profit"}
      />
      <Tile
        label={me.finance.barProfit}
        value={formatMoney(summary.bar_profit)}
      />
      <Tile
        label={me.finance.activeMembers}
        value={String(summary.active_members)}
      />
    </div>
  );
}
