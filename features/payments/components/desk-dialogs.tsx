"use client";

import { useCallback, useState } from "react";
import { Loader2, Minus, Plus } from "lucide-react";
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
import { Select } from "@/components/ui/select";
import { formatMoney, parseMoneyInput } from "@/lib/format";
import { me } from "@/lib/i18n/me";
import { recordDeskExpense, sellDayPasses } from "../actions";

type OpenProps = { open: boolean; onOpenChange: (open: boolean) => void };

/**
 * S-10 (F-12, BR-100): a 1–20 stepper, the live total at the current price, and the
 * method. The price shown is only a preview; the RPC charges the price it reads itself.
 */
export function DayPassDialog({
  price,
  ...props
}: OpenProps & { price: string | null }) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{me.dayPass.title}</DialogTitle>
        </DialogHeader>
        {props.open ? (
          price ? (
            <DayPassForm
              price={price}
              onDone={() => props.onOpenChange(false)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {me.dayPass.unavailable}
            </p>
          )
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DayPassForm({ price, onDone }: { price: string; onDone: () => void }) {
  const [state, onSubmit, pending] = useFormAction(sellDayPasses);
  const [quantity, setQuantity] = useState(1);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const close = useCallback(() => onDone(), [onDone]);
  useActionToast(state, close);
  const total = (
    BigInt(parseMoneyInput(price).replace(".", "")) * BigInt(quantity)
  ).toString();
  const totalText = formatMoney(
    `${total.slice(0, -2) || "0"}.${total.slice(-2).padStart(2, "0")}`,
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormError>{state.error}</FormError>
      <div className="grid gap-2">
        <Label htmlFor="day-pass-quantity">{me.dayPass.quantity}</Label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={me.dayPass.fewer}
            disabled={quantity <= 1}
            onClick={() => setQuantity((value) => Math.max(1, value - 1))}
          >
            <Minus aria-hidden="true" />
          </Button>
          <Input
            id="day-pass-quantity"
            name="quantity"
            inputMode="numeric"
            className="w-20 text-center text-lg tabular-nums"
            value={quantity}
            onChange={(event) => {
              const value = Number.parseInt(event.target.value, 10);
              setQuantity(
                Number.isFinite(value) ? Math.min(20, Math.max(1, value)) : 1,
              );
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={me.dayPass.more}
            disabled={quantity >= 20}
            onClick={() => setQuantity((value) => Math.min(20, value + 1))}
          >
            <Plus aria-hidden="true" />
          </Button>
        </div>
      </div>
      <p className="text-lg font-semibold" aria-live="polite">
        {me.dayPass.total.replace("{amount}", totalText)}
      </p>
      <MethodButtons
        idPrefix="day-pass"
        value={method}
        onChange={setMethod}
        error={state.fieldErrors?.method}
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
          {me.dayPass.charge}
        </MoneyButton>
      </DialogFooter>
    </form>
  );
}

export type ExpenseCategory = { id: string; name: string };

/** S-11 (F-14, BR-132): paid from the till, today; active non-salary categories only. */
export function DeskExpenseDialog({
  categories,
  ...props
}: OpenProps & { categories: ExpenseCategory[] }) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent aria-describedby="desk-expense-note">
        <DialogHeader>
          <DialogTitle>{me.deskExpense.title}</DialogTitle>
          <DialogDescription id="desk-expense-note">
            {me.deskExpense.fixedNote}
          </DialogDescription>
        </DialogHeader>
        {props.open ? (
          <DeskExpenseForm
            categories={categories}
            onDone={() => props.onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DeskExpenseForm({
  categories,
  onDone,
}: {
  categories: ExpenseCategory[];
  onDone: () => void;
}) {
  const [state, onSubmit, pending] = useFormAction(recordDeskExpense);
  const close = useCallback(() => onDone(), [onDone]);
  useActionToast(state, close);
  const errors = state.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormError>{state.error}</FormError>
      <div className="grid gap-2">
        <Label htmlFor="expense-category">{me.deskExpense.category}</Label>
        <Select
          id="expense-category"
          name="categoryId"
          defaultValue=""
          aria-invalid={Boolean(errors.categoryId)}
          aria-describedby="expense-category-error"
        >
          <option value="" disabled>
            {me.deskExpense.categoryRequired}
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <FieldError id="expense-category-error">{errors.categoryId}</FieldError>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="expense-description">
          {me.deskExpense.description}
        </Label>
        <Input
          id="expense-description"
          name="description"
          autoComplete="off"
          aria-invalid={Boolean(errors.description)}
          aria-describedby="expense-description-error"
        />
        <FieldError id="expense-description-error">
          {errors.description}
        </FieldError>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="expense-amount">{me.deskExpense.amount}</Label>
        <Input
          id="expense-amount"
          name="amount"
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={Boolean(errors.amount)}
          aria-describedby="expense-amount-error"
        />
        <FieldError id="expense-amount-error">{errors.amount}</FieldError>
      </div>
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
          {me.common.save}
        </MoneyButton>
      </DialogFooter>
    </form>
  );
}
