"use client";

import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAppState } from "@/components/common/app-state";
import { FieldError, FormError } from "@/components/common/form-message";
import {
  MethodButtons,
  type PaymentMethod,
} from "@/components/common/method-buttons";
import { MoneyButton } from "@/components/common/money-button";
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
import { formatMoney, parseMoneyInput } from "@/lib/format";
import { me } from "@/lib/i18n/me";
import { cn } from "@/lib/utils";
import { receiveStock, sellProduct } from "../actions";

export type StorageProduct = {
  id: string;
  name: string;
  stock: number;
  /** Decimal text, as numeric(10,2) arrives. */
  current_purchase_price: string;
  sale_price: string;
};

/** BR-003: quantity × price without floating point. */
function times(price: string, quantity: number): string | null {
  if (!Number.isInteger(quantity) || quantity < 1) return null;
  try {
    const cents =
      BigInt(parseMoneyInput(price).replace(".", "")) * BigInt(quantity);
    const text = cents.toString().padStart(3, "0");
    return `${text.slice(0, -2)}.${text.slice(-2)}`;
  } catch {
    return null;
  }
}

type Dialogs = { kind: "sale" | "stockIn"; product: StorageProduct } | null;

/**
 * S-13 (F-15). BR-144: every role sees the product, its stock level and both prices;
 * nothing here reveals stock value or profit, which are the owner's (S-20).
 */
export function StorageScreen({ products }: { products: StorageProduct[] }) {
  const [dialog, setDialog] = useState<Dialogs>(null);
  const close = useCallback(() => setDialog(null), []);

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        {me.storage.title}
      </h1>
      <TableWrapper className="rounded-2xl border bg-card">
        <Table>
          <thead>
            <tr>
              <Th>{me.storage.columnProduct}</Th>
              <Th className="text-right">{me.storage.columnStock}</Th>
              <Th className="text-right">{me.storage.columnPurchasePrice}</Th>
              <Th className="text-right">{me.storage.columnSalePrice}</Th>
              <Th>
                <span className="sr-only">{me.users.actions}</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <Td colSpan={5} className="text-muted-foreground">
                  {me.storage.empty}
                </Td>
              </tr>
            ) : (
              products.map((product) => (
                <tr key={product.id}>
                  <Td className="font-medium">{product.name}</Td>
                  <Td
                    className="text-right tabular-nums"
                    data-testid={`stock-${product.name}`}
                  >
                    {product.stock}
                  </Td>
                  <Td className="text-right tabular-nums whitespace-nowrap">
                    {formatMoney(product.current_purchase_price)}
                  </Td>
                  <Td className="text-right tabular-nums whitespace-nowrap">
                    {formatMoney(product.sale_price)}
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    <div className="flex justify-end gap-2">
                      <MoneyButton
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={product.stock < 1}
                        title={
                          product.stock < 1 ? me.storage.outOfStock : undefined
                        }
                        aria-label={`${me.storage.sale} ${product.name}`}
                        onClick={() => setDialog({ kind: "sale", product })}
                      >
                        {me.storage.sale}
                      </MoneyButton>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-label={`${me.storage.stockIn} ${product.name}`}
                        onClick={() => setDialog({ kind: "stockIn", product })}
                      >
                        {me.storage.stockIn}
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </TableWrapper>

      {dialog?.kind === "sale" ? (
        <SaleDialog product={dialog.product} onClose={close} />
      ) : null}
      {dialog?.kind === "stockIn" ? (
        <StockInDialog product={dialog.product} onClose={close} />
      ) : null}
    </>
  );
}

/** S-13 Prodaja (BR-142): quantity up to the stock, `Ukupno`, the method. */
function SaleDialog({
  product,
  onClose,
}: {
  product: StorageProduct;
  onClose: () => void;
}) {
  const [state, onSubmit, pending] = useFormAction(sellProduct);
  const [quantity, setQuantity] = useState("1");
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  useActionToast(state, onClose);
  const total = times(product.sale_price, Number(quantity));
  const errors = state.fieldErrors ?? {};

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{me.storage.sale}</DialogTitle>
          <DialogDescription>
            {product.name} · {formatMoney(product.sale_price)}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <input type="hidden" name="productId" value={product.id} />
          <FormError>{state.error}</FormError>
          <div className="grid gap-2">
            <Label htmlFor="sale-quantity">{me.storage.quantity}</Label>
            <Input
              id="sale-quantity"
              name="quantity"
              type="number"
              min={1}
              max={product.stock}
              inputMode="numeric"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              aria-invalid={Boolean(errors.quantity)}
              aria-describedby="sale-quantity-error"
            />
            <FieldError id="sale-quantity-error">{errors.quantity}</FieldError>
          </div>
          <p className="text-lg font-semibold" aria-live="polite">
            {me.storage.total.replace(
              "{amount}",
              total ? formatMoney(total) : "—",
            )}
          </p>
          <MethodButtons
            idPrefix="sale"
            value={method}
            onChange={setMethod}
            error={errors.method}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {me.common.cancel}
              </Button>
            </DialogClose>
            <MoneyButton type="submit" disabled={pending}>
              {pending ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : null}
              {me.storage.charge}
            </MoneyButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * S-13 Nova roba (BR-141, D-55): the invoice price per unit (at least €0.01), and whether
 * it was paid from the till, which needs the open shift (BR-092), or outside it.
 */
function StockInDialog({
  product,
  onClose,
}: {
  product: StorageProduct;
  onClose: () => void;
}) {
  const [state, onSubmit, pending] = useFormAction(receiveStock);
  const { hasOpenShift } = useAppState();
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState(
    product.current_purchase_price.replace(".", ","),
  );
  const [payment, setPayment] = useState<"till" | "outside" | null>(null);
  useActionToast(state, onClose);
  const errors = state.fieldErrors ?? {};

  let total: string | null = null;
  try {
    if (/^\d{1,8}([.,]\d{1,2})?$/.test(unitCost.trim()))
      total = times(parseMoneyInput(unitCost), Number(quantity));
  } catch {
    total = null;
  }

  const options = [
    {
      value: "till" as const,
      label: me.storage.fromTill,
      disabled: !hasOpenShift,
    },
    {
      value: "outside" as const,
      label: me.storage.outsideTill,
      disabled: false,
    },
  ];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{me.storage.stockIn}</DialogTitle>
          <DialogDescription>
            {product.name}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <input type="hidden" name="productId" value={product.id} />
          <FormError>{state.error}</FormError>
          <div className="grid gap-2">
            <Label htmlFor="stock-in-quantity">{me.storage.quantity}</Label>
            <Input
              id="stock-in-quantity"
              name="quantity"
              type="number"
              min={1}
              max={10000}
              inputMode="numeric"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              aria-invalid={Boolean(errors.quantity)}
              aria-describedby="stock-in-quantity-error"
            />
            <FieldError id="stock-in-quantity-error">
              {errors.quantity}
            </FieldError>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="stock-in-cost">{me.storage.unitCost}</Label>
            <Input
              id="stock-in-cost"
              name="unitCost"
              inputMode="decimal"
              value={unitCost}
              onChange={(event) => setUnitCost(event.target.value)}
              aria-invalid={Boolean(errors.unitCost)}
              aria-describedby="stock-in-cost-error"
            />
            <FieldError id="stock-in-cost-error">{errors.unitCost}</FieldError>
          </div>
          <fieldset
            className="grid gap-2"
            aria-describedby="stock-in-payment-error"
          >
            <legend className="mb-2 text-sm font-medium">
              {me.storage.payment}
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {options.map((option) => (
                <label
                  key={option.value}
                  title={
                    option.disabled ? me.errors.E_NO_OPEN_SHIFT : undefined
                  }
                  className={cn(
                    "flex h-12 cursor-pointer items-center justify-center rounded-lg border bg-card text-sm font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    payment === option.value &&
                      "border-primary bg-primary text-primary-foreground",
                    option.disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <input
                    type="radio"
                    name="payment"
                    value={option.value}
                    checked={payment === option.value}
                    disabled={option.disabled}
                    onChange={() => setPayment(option.value)}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              ))}
            </div>
            {!hasOpenShift ? (
              <p className="text-sm text-muted-foreground">
                {me.errors.E_NO_OPEN_SHIFT}
              </p>
            ) : null}
            <FieldError id="stock-in-payment-error">
              {errors.payment}
            </FieldError>
          </fieldset>
          <p className="text-lg font-semibold" aria-live="polite">
            {me.storage.total.replace(
              "{amount}",
              total ? formatMoney(total) : "—",
            )}
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {me.common.cancel}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : null}
              {me.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
