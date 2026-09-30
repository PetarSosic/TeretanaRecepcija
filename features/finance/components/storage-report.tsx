"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { FieldError, FormError } from "@/components/common/form-message";
import { useActionToast } from "@/components/common/use-action-toast";
import { useFormAction } from "@/components/common/use-form-action";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableWrapper, Td, Th } from "@/components/ui/table";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { me } from "@/lib/i18n/me";
import { cn } from "@/lib/utils";
import { voidSale } from "@/features/storage/actions";
import { RankedBars } from "./ranked-bars";

/** D-92: what came in, what was sold and what it cost, and the stock at the end. */
type StorageFigures = {
  in_quantity: number;
  /** Decimal text, as numeric arrives (BR-003). */
  in_amount: string;
  sold_quantity: number;
  revenue: string;
  cost: string;
  profit: string;
  /** Gross profit over revenue, one decimal; null when nothing was sold. */
  margin_pct: string | null;
  stock: number;
  stock_value: string;
};

export type StorageProductRow = StorageFigures & {
  product_id: string;
  name: string;
  purchase_price: string;
  sale_price: string;
};

export type StorageTotals = StorageFigures;

function margin(value: string | null): string {
  return value === null ? "—" : `${value.replace(".", ",")} %`;
}

export type DailyRow = {
  day: string;
  name: string;
  quantity: number;
  revenue: string;
};

export type StockInRow = {
  id: string;
  created_at: string;
  name: string;
  quantity: number;
  unit_cost: string;
  total: string;
  paid_from_till: boolean;
  created_by_name: string;
  voided_at: string | null;
  void_reason: string | null;
};

/**
 * S-20 (F-15 for the owner): per product what came in, what was sold, what the sold
 * goods cost and earned (BR-153), and the stock and its value at the end of the period
 * (BR-159), with a totals row; then the daily sales and the stock-ins.
 */
export function StorageReport({
  products,
  totals,
  stockDate,
  daily,
  stockIns,
}: {
  products: StorageProductRow[];
  totals: StorageTotals | null;
  /** yyyy-mm-dd: the day the stock and its value are given for. */
  stockDate: string | null;
  daily: DailyRow[];
  stockIns: StockInRow[];
}) {
  const [voiding, setVoiding] = useState<StockInRow | null>(null);

  return (
    <div className="grid grid-cols-1 gap-8">
      <RankedBars
        title={`${me.finance.grossMargin} — ${me.finance.product}`}
        rows={products.map((row) => ({ label: row.name, value: row.profit }))}
      />

      <section>
        <h2 className="mb-1 text-lg font-semibold">
          {me.finance.storageTitle}
        </h2>
        {stockDate ? (
          <p className="mb-3 text-sm text-muted-foreground">
            {me.finance.stockOn.replace("{date}", formatDate(stockDate))}
          </p>
        ) : null}
        <TableWrapper>
          <Table>
            <thead>
              <tr>
                <Th>{me.finance.product}</Th>
                <Th className="text-right">{me.finance.purchasePrice}</Th>
                <Th className="text-right">{me.finance.salePrice}</Th>
                <Th className="text-right">{me.finance.inQuantity}</Th>
                <Th className="text-right">{me.finance.inAmount}</Th>
                <Th className="text-right">{me.finance.soldQuantity}</Th>
                <Th className="text-right">{me.finance.revenue}</Th>
                <Th className="text-right">{me.finance.soldCost}</Th>
                <Th className="text-right">{me.finance.grossMargin}</Th>
                <Th className="text-right">{me.finance.marginPct}</Th>
                <Th className="text-right">{me.finance.stock}</Th>
                <Th className="text-right">{me.finance.stockValue}</Th>
              </tr>
            </thead>
            <tbody>
              {products.map((row) => (
                <tr key={row.product_id}>
                  <Td>{row.name}</Td>
                  <Td className="text-right tabular-nums">
                    {formatMoney(row.purchase_price)}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {formatMoney(row.sale_price)}
                  </Td>
                  <Figures row={row} />
                </tr>
              ))}
            </tbody>
            {totals ? (
              <tfoot>
                <tr className="font-semibold">
                  <Td colSpan={3}>{me.finance.total}</Td>
                  <Figures row={totals} />
                </tr>
              </tfoot>
            ) : null}
          </Table>
        </TableWrapper>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{me.finance.dailySales}</h2>
        {daily.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {me.finance.storageEmpty}
          </p>
        ) : (
          <TableWrapper>
            <Table>
              <thead>
                <tr>
                  <Th>{me.finance.date}</Th>
                  <Th>{me.finance.product}</Th>
                  <Th className="text-right">{me.finance.soldQuantity}</Th>
                  <Th className="text-right">{me.finance.revenue}</Th>
                </tr>
              </thead>
              <tbody>
                {daily.map((row) => (
                  <tr key={`${row.day}-${row.name}`}>
                    <Td className="whitespace-nowrap">{formatDate(row.day)}</Td>
                    <Td>{row.name}</Td>
                    <Td className="text-right tabular-nums">{row.quantity}</Td>
                    <Td className="text-right tabular-nums">
                      {formatMoney(row.revenue)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrapper>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{me.finance.stockIns}</h2>
        {stockIns.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {me.finance.storageEmpty}
          </p>
        ) : (
          <TableWrapper>
            <Table>
              <thead>
                <tr>
                  <Th>{me.finance.date}</Th>
                  <Th>{me.finance.product}</Th>
                  <Th className="text-right">{me.finance.count}</Th>
                  <Th className="text-right">{me.finance.purchasePrice}</Th>
                  <Th className="text-right">{me.finance.total}</Th>
                  <Th>{me.finance.fromTill}</Th>
                  <Th>{me.finance.enteredBy}</Th>
                  <Th>
                    <span className="sr-only">{me.users.actions}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {stockIns.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      // BR-095 (N-19): a voided stock-in stays listed, struck through.
                      row.voided_at && "text-muted-foreground line-through",
                    )}
                  >
                    <Td className="whitespace-nowrap">
                      {formatDateTime(row.created_at)}
                    </Td>
                    <Td>
                      {row.name}
                      {/* An inline-block is not struck by the row's line-through. */}
                      {row.voided_at ? (
                        <span className="inline-block w-full text-xs text-danger">
                          {me.report.voided}: {row.void_reason}
                        </span>
                      ) : null}
                    </Td>
                    <Td className="text-right tabular-nums">{row.quantity}</Td>
                    <Td className="text-right tabular-nums">
                      {formatMoney(row.unit_cost)}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {formatMoney(row.total)}
                    </Td>
                    <Td>{row.paid_from_till ? me.users.yes : me.users.no}</Td>
                    <Td>{row.created_by_name}</Td>
                    <Td className="text-right">
                      {row.voided_at ? null : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setVoiding(row)}
                        >
                          {me.finance.voidStockIn}
                        </Button>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrapper>
        )}
      </section>

      {/* N-12: mounted only while open, so each opening starts without old messages. */}
      {voiding ? (
        <VoidStockIn movement={voiding} onDone={() => setVoiding(null)} />
      ) : null}
    </div>
  );
}

/** The S-20 columns a product row and the totals row share. */
function Figures({ row }: { row: StorageFigures }) {
  return (
    <>
      <Td className="text-right tabular-nums">{row.in_quantity}</Td>
      <Td className="text-right tabular-nums">{formatMoney(row.in_amount)}</Td>
      <Td className="text-right tabular-nums">{row.sold_quantity}</Td>
      <Td className="text-right tabular-nums">{formatMoney(row.revenue)}</Td>
      <Td className="text-right tabular-nums">{formatMoney(row.cost)}</Td>
      <Td className="text-right font-medium tabular-nums">
        {formatMoney(row.profit)}
      </Td>
      <Td className="text-right tabular-nums">{margin(row.margin_pct)}</Td>
      <Td className="text-right tabular-nums">{row.stock}</Td>
      <Td className="text-right tabular-nums">
        {formatMoney(row.stock_value)}
      </Td>
    </>
  );
}

/** BR-135 and BR-143: voiding a stock-in voids its expense with it. */
function VoidStockIn({
  movement,
  onDone,
}: {
  movement: StockInRow | null;
  onDone: () => void;
}) {
  const [state, onSubmit, pending] = useFormAction(voidSale);
  useActionToast(state, onDone);

  return (
    <Dialog open={Boolean(movement)} onOpenChange={(open) => !open && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{me.finance.voidStockIn}</DialogTitle>
          <DialogDescription>
            {movement
              ? `${movement.name} · ${movement.quantity} × ${formatMoney(movement.unit_cost)}`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <input type="hidden" name="id" value={movement?.id ?? ""} />
          <FormError>{state.error}</FormError>
          <div className="grid gap-1.5">
            <Label htmlFor="stockin-reason">{me.payments.reason}</Label>
            <Input id="stockin-reason" name="reason" required />
            <FieldError id="stockin-reason-error">
              {state.fieldErrors?.reason}
            </FieldError>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {me.common.cancel}
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : null}
              {me.finance.voidStockIn}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
