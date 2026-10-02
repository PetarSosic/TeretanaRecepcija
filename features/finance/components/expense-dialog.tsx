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
import { Select } from "@/components/ui/select";
import type { Category } from "@/features/settings/components/categories-section";
import type { ActionState } from "@/lib/action-state";
import { me } from "@/lib/i18n/me";

export type Trainer = { id: string; full_name: string };

export type ExpensePrefill = {
  categoryId: string;
  trainerId: string;
  amount: string;
  description: string;
};

type ExpenseFormProps = {
  /** S-17 saves with saveExpense, the desk's [Trošak] with recordDeskExpense (D-98). */
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  categories: Category[];
  trainers: Trainer[];
  /** BR-001: gym_today, the newest date BR-133 allows. */
  today: string;
  prefill?: ExpensePrefill;
  /** D-98: at the desk the form opens on "Iz kase", as the desk expense always was. */
  defaultFromTill?: boolean;
};

/**
 * BR-133: the expense form. S-17 [Novi trošak] and, since D-98, the desk's [Trošak]
 * (S-11); the RPC decides what each role may record.
 */
export function ExpenseDialog({
  open,
  onOpenChange,
  ...form
}: ExpenseFormProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{me.finance.newExpense}</DialogTitle>
          <DialogDescription>{me.finance.expensesTitle}</DialogDescription>
        </DialogHeader>
        {/* N-12: the form and its action state exist only while the dialog is open,
            so a reopened dialog never shows the previous attempt's messages. */}
        {open ? <ExpenseForm onOpenChange={onOpenChange} {...form} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ExpenseForm({
  onOpenChange,
  action,
  categories,
  trainers,
  today,
  prefill,
  defaultFromTill = false,
}: ExpenseFormProps & { onOpenChange: (open: boolean) => void }) {
  const [state, onSubmit, pending] = useFormAction(action);
  useActionToast(state, () => onOpenChange(false));
  const [categoryId, setCategoryId] = useState(prefill?.categoryId ?? "");
  const [fromTill, setFromTill] = useState(defaultFromTill);
  const [method, setMethod] = useState("cash");

  // BR-133 (D-92): Roba za prodaju is written only by Nova roba, never by hand.
  const active = categories.filter(
    (category) => category.is_active && !category.is_system,
  );
  const salary = active.some(
    (category) => category.id === categoryId && category.is_salary,
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormError>{state.error}</FormError>

      <div className="grid gap-1.5">
        <Label htmlFor="expense-category">{me.finance.category}</Label>
        <Select
          id="expense-category"
          name="categoryId"
          required
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          <option value="">—</option>
          {active.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <FieldError id="categoryId-error">
          {state.fieldErrors?.categoryId}
        </FieldError>
      </div>

      {/* BR-133: a trainer belongs to a salary category and marks a payout. */}
      {salary ? (
        <div className="grid gap-1.5">
          <Label htmlFor="expense-trainer">{me.finance.trainer}</Label>
          <Select
            id="expense-trainer"
            name="trainerId"
            defaultValue={prefill?.trainerId ?? ""}
          >
            <option value="">—</option>
            {trainers.map((trainer) => (
              <option key={trainer.id} value={trainer.id}>
                {trainer.full_name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor="expense-description">{me.finance.description}</Label>
        <Input
          id="expense-description"
          name="description"
          defaultValue={prefill?.description ?? ""}
          required
        />
        <FieldError id="description-error">
          {state.fieldErrors?.description}
        </FieldError>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="expense-amount">{me.finance.amount} (€)</Label>
          <Input
            id="expense-amount"
            name="amount"
            inputMode="decimal"
            defaultValue={prefill?.amount ?? ""}
            required
          />
          <FieldError id="amount-error">{state.fieldErrors?.amount}</FieldError>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="expense-date">{me.finance.date}</Label>
          <Input
            id="expense-date"
            name="spentOn"
            type="date"
            max={today}
            defaultValue={today}
            disabled={fromTill}
            required
          />
          {/* A disabled input sends nothing, so the forced value goes with it. */}
          {fromTill ? (
            <input type="hidden" name="spentOn" value={today} />
          ) : null}
          <FieldError id="spentOn-error">
            {state.fieldErrors?.spentOn}
          </FieldError>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="expense-method">{me.finance.method}</Label>
          <Select
            id="expense-method"
            name="method"
            value={fromTill ? "cash" : method}
            disabled={fromTill}
            onChange={(event) => setMethod(event.target.value)}
          >
            <option value="cash">{me.finance.methodCash}</option>
            <option value="card">{me.finance.methodCard}</option>
            <option value="none">{me.finance.methodNone}</option>
          </Select>
          {fromTill ? <input type="hidden" name="method" value="cash" /> : null}
          <FieldError id="method-error">{state.fieldErrors?.method}</FieldError>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="expense-vat">{me.finance.vat}</Label>
          <Select id="expense-vat" name="vat" defaultValue="unset">
            <option value="unset">{me.finance.vatUnset}</option>
            <option value="yes">{me.finance.vatYes}</option>
            <option value="no">{me.finance.vatNo}</option>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="expense-supplier">{me.finance.supplier}</Label>
          {/* N-11: a refused supplier or invoice used to leave no message at all. */}
          <Input
            id="expense-supplier"
            name="supplier"
            aria-invalid={Boolean(state.fieldErrors?.supplier)}
            aria-describedby="supplier-error"
          />
          <FieldError id="supplier-error">
            {state.fieldErrors?.supplier}
          </FieldError>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="expense-invoice">{me.finance.invoice}</Label>
          <Input
            id="expense-invoice"
            name="invoice"
            aria-invalid={Boolean(state.fieldErrors?.invoice)}
            aria-describedby="invoice-error"
          />
          <FieldError id="invoice-error">
            {state.fieldErrors?.invoice}
          </FieldError>
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="fromTill"
          checked={fromTill}
          onChange={(event) => setFromTill(event.target.checked)}
          className="mt-0.5 size-4"
        />
        <span>
          {me.finance.fromTill}
          <span className="block text-xs text-muted-foreground">
            {me.finance.fromTillHint}
          </span>
        </span>
      </label>

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
  );
}
