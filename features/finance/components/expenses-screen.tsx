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
import { Table, TableWrapper, Td, Th } from "@/components/ui/table";
import {
  CategoriesSection,
  type Category,
} from "@/features/settings/components/categories-section";
import { formatDate, formatMoney, sumMoney } from "@/lib/format";
import { me } from "@/lib/i18n/me";
import { cn } from "@/lib/utils";
import { saveExpense, voidExpense } from "../actions";
import type { Period } from "../period";
import {
  ExpenseDialog,
  type ExpensePrefill,
  type Trainer,
} from "./expense-dialog";

export type ExpenseRow = {
  id: string;
  spent_on: string;
  category_name: string;
  is_salary: boolean;
  description: string;
  supplier: string | null;
  invoice_number: string | null;
  method: "cash" | "card" | null;
  paid_from_till: boolean;
  vat_included: boolean | null;
  /** Decimal text, as numeric(10,2) arrives (BR-003). */
  amount: string;
  trainer_name: string | null;
  created_by_name: string;
  stock_movement_id: string | null;
  /** D-93: the fixed expense this row was posted from (BR-136). */
  recurring_expense_id: string | null;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
};

export type StaffOption = { id: string; full_name: string };

export type ExpenseFilters = {
  categoryId: string;
  method: string;
  createdBy: string;
};

const METHOD_LABELS: Record<string, string> = {
  cash: me.finance.methodCash,
  card: me.finance.methodCard,
  none: me.finance.methodNone,
};

/**
 * S-17 (F-18): every expense of the period, the BR-133 form, and the BR-131 categories.
 * D-80: `readOnly` is the manager's view — the list, its filters and its total only.
 */
export function ExpensesScreen({
  rows,
  categories,
  trainers,
  staff,
  filters,
  period,
  today,
  prefill,
  readOnly = false,
}: {
  rows: ExpenseRow[];
  categories: Category[];
  trainers: Trainer[];
  staff: StaffOption[];
  filters: ExpenseFilters;
  /** Kept in the querystring so a filter change never drops the chosen period. */
  period: Period;
  /** BR-001: gym_today, the newest date BR-133 allows. */
  today: string;
  /** S-18 [Evidentiraj isplatu] arrives here with the payout already filled in. */
  prefill?: ExpensePrefill;
  /** D-80: no [Novi trošak], [Kategorije troškova] or [Poništi]. */
  readOnly?: boolean;
}) {
  const [creating, setCreating] = useState(Boolean(prefill));
  const [managing, setManaging] = useState(false);
  const [voiding, setVoiding] = useState<ExpenseRow | null>(null);
  // D-63: what the period and filters list, without voided rows (BR-095). This is what was
  // paid, stock-ins included; the owner's S-16 Troškovi card counts the cost of the goods
  // sold in their place (D-92), the manager's counts the same as this list (D-80).
  const total = sumMoney(
    rows.filter((row) => !row.voided_at).map((row) => row.amount),
  );
  const anyVoided = rows.some((row) => row.voided_at);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{me.finance.expensesTitle}</h2>
        {readOnly ? null : (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setManaging(true)}>
              {me.finance.editCategories}
            </Button>
            <Button onClick={() => setCreating(true)}>
              {me.finance.newExpense}
            </Button>
          </div>
        )}
      </div>

      <Filters
        categories={categories}
        staff={staff}
        filters={filters}
        period={period}
      />

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-lg font-semibold tabular-nums">
          {me.finance.expensesTotal.replace("{amount}", formatMoney(total))}
        </p>
        {anyVoided ? (
          <p className="text-sm text-muted-foreground">
            {me.finance.expensesTotalVoided}
          </p>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {me.finance.expensesEmpty}
        </p>
      ) : (
        <TableWrapper>
          <Table>
            <thead>
              <tr>
                <Th>{me.finance.date}</Th>
                <Th>{me.finance.category}</Th>
                <Th>{me.finance.description}</Th>
                <Th>{me.finance.supplier}</Th>
                <Th>{me.finance.invoice}</Th>
                <Th>{me.finance.method}</Th>
                <Th>{me.finance.fromTill}</Th>
                <Th className="text-right">{me.finance.amount}</Th>
                <Th>{me.finance.enteredBy}</Th>
                {readOnly ? null : (
                  <Th>
                    <span className="sr-only">{me.users.actions}</span>
                  </Th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    // BR-095 (N-19): a voided expense stays listed, struck through.
                    row.voided_at && "text-muted-foreground line-through",
                  )}
                >
                  <Td className="whitespace-nowrap">
                    {formatDate(row.spent_on)}
                  </Td>
                  <Td>
                    {row.category_name}
                    {row.trainer_name ? (
                      <span className="block text-xs text-muted-foreground">
                        {row.trainer_name}
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    {row.description}
                    {row.recurring_expense_id ? (
                      <span className="ml-2 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {me.finance.recurringBadge}
                      </span>
                    ) : null}
                    {/* An inline-block is not struck by the row's line-through. */}
                    {row.voided_at ? (
                      <span className="inline-block w-full text-xs text-danger">
                        {me.report.voided}: {row.void_reason}
                      </span>
                    ) : null}
                  </Td>
                  <Td>{row.supplier ?? "—"}</Td>
                  <Td>{row.invoice_number ?? "—"}</Td>
                  <Td>{METHOD_LABELS[row.method ?? "none"]}</Td>
                  <Td>{row.paid_from_till ? me.users.yes : me.users.no}</Td>
                  <Td className="text-right font-medium tabular-nums">
                    {formatMoney(row.amount)}
                  </Td>
                  <Td>{row.created_by_name}</Td>
                  {readOnly ? null : (
                    <Td className="text-right">
                      {/* BR-135: a stock-in expense is voided with its movement (S-20). */}
                      {!row.voided_at && !row.stock_movement_id ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setVoiding(row)}
                        >
                          {me.payments.void}
                        </Button>
                      ) : null}
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrapper>
      )}

      {readOnly ? null : (
        <>
          <ExpenseDialog
            open={creating}
            onOpenChange={setCreating}
            action={saveExpense}
            categories={categories}
            trainers={trainers}
            today={today}
            prefill={prefill}
          />

          <Dialog open={managing} onOpenChange={setManaging}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{me.finance.editCategories}</DialogTitle>
                <DialogDescription>{me.settings.categories}</DialogDescription>
              </DialogHeader>
              <CategoriesSection categories={categories} heading={false} />
            </DialogContent>
          </Dialog>

          <VoidDialog expense={voiding} onDone={() => setVoiding(null)} />
        </>
      )}
    </div>
  );
}

/** The filter row of S-17; the choice lives in the URL beside the period. */
function Filters({
  categories,
  staff,
  filters,
  period,
}: {
  categories: Category[];
  staff: StaffOption[];
  filters: ExpenseFilters;
  period: Period;
}) {
  return (
    <form className="flex flex-wrap items-end gap-3" method="get">
      {/* A GET form replaces the whole querystring, so the period rides along. */}
      <input type="hidden" name="period" value={period.preset} />
      {period.preset === "custom" ? (
        <>
          <input type="hidden" name="from" value={period.from} />
          <input type="hidden" name="to" value={period.to} />
        </>
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor="categoryId">{me.finance.category}</Label>
        <Select
          id="categoryId"
          name="categoryId"
          defaultValue={filters.categoryId}
          className="w-52"
        >
          <option value="">{me.finance.allCategories}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="method">{me.finance.method}</Label>
        <Select
          id="method"
          name="method"
          defaultValue={filters.method}
          className="w-44"
        >
          <option value="">{me.finance.allMethods}</option>
          <option value="cash">{me.finance.methodCash}</option>
          <option value="card">{me.finance.methodCard}</option>
          <option value="none">{me.finance.methodNone}</option>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="createdBy">{me.finance.enteredBy}</Label>
        <Select
          id="createdBy"
          name="createdBy"
          defaultValue={filters.createdBy}
          className="w-52"
        >
          <option value="">{me.finance.allStaff}</option>
          {staff.map((person) => (
            <option key={person.id} value={person.id}>
              {person.full_name}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" variant="outline">
        {me.finance.apply}
      </Button>
    </form>
  );
}

/** BR-135: the owner voids any expense, with a reason. */
function VoidDialog({
  expense,
  onDone,
}: {
  expense: ExpenseRow | null;
  onDone: () => void;
}) {
  return (
    <Dialog open={Boolean(expense)} onOpenChange={(open) => !open && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{me.payments.void}</DialogTitle>
          <DialogDescription>
            {expense
              ? `${expense.description} · ${formatMoney(expense.amount)}`
              : ""}
          </DialogDescription>
        </DialogHeader>
        {/* N-12: fresh action state for every opening. */}
        {expense ? <VoidForm expense={expense} onDone={onDone} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function VoidForm({
  expense,
  onDone,
}: {
  expense: ExpenseRow;
  onDone: () => void;
}) {
  const [state, onSubmit, pending] = useFormAction(voidExpense);
  useActionToast(state, onDone);

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <input type="hidden" name="expenseId" value={expense.id} />
      <FormError>{state.error}</FormError>
      <div className="grid gap-1.5">
        <Label htmlFor="void-reason">{me.payments.reason}</Label>
        <Input id="void-reason" name="reason" required />
        <FieldError id="reason-error">{state.fieldErrors?.reason}</FieldError>
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
          {me.payments.void}
        </Button>
      </DialogFooter>
    </form>
  );
}
