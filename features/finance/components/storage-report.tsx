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
import { voidSale } from "@/features/storage/actions";
import { RankedBars } from "./ranked-bars";

export type StorageProductRow = {
  product_id: string;
  name: string;
  stock: number;
  /** Decimal text, as numeric(10,2) arrives (BR-003). */
  stock_value: string;
  sold_quantity: number;
  revenue: string;
  cost: string;
  profit: string;
};

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

/** S-20 (F-15 for the owner): stock value, what the bar earned, and the stock-ins. */
export function StorageReport({
  products,
  daily,
  stockIns,
}: {
  products: StorageProductRow[];
  daily: DailyRow[];
  stockIns: StockInRow[];
}) {
  const [voiding, setVoiding] = useState<StockInRow | null>(null);

  return (
    <div className="grid gap-8">
      <RankedBars
        title={`${me.finance.profit} — ${me.finance.product}`}
        rows={products.map((row) => ({ label: row.name, value: row.profit }))}
      />

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          {me.finance.storageTitle}
        </h2>
        <TableWrapper>
          <Table>
            <thead>
              <tr>
                <Th>{me.finance.product}</Th>
                <Th className="text-right">{me.finance.stock}</Th>
                <Th className="text-right">{me.finance.stockValue}</Th>
                <Th className="text-right">{me.finance.soldQuantity}</Th>
                <Th className="text-right">{me.finance.revenue}</Th>
                <Th className="text-right">{me.finance.soldCost}</Th>
                <Th className="text-right">{me.finance.profit}</Th>
              </tr>
            </thead>
            <tbody>
              {products.map((row) => (
                <tr key={row.product_id}>
                  <Td>{row.name}</Td>
                  <Td className="text-right tabular-nums">{row.stock}</Td>
                  <Td className="text-right tabular-nums">
                    {formatMoney(row.stock_value)}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {row.sold_quantity}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {formatMoney(row.revenue)}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {formatMoney(row.cost)}
                  </Td>
                  <Td className="text-right font-medium tabular-nums">
                    {formatMoney(row.profit)}
                  </Td>
                </tr>
              ))}
            </tbody>
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
                    className={row.voided_at ? "opacity-60" : ""}
                  >
                    <Td className="whitespace-nowrap">
                      {formatDateTime(row.created_at)}
                    </Td>
                    <Td>
                      {row.name}
                      {row.voided_at ? (
                        <span className="block text-xs text-danger">
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
