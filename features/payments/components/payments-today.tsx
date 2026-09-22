"use client";

import { useCallback, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { FieldError, FormError } from "@/components/common/form-message";
import {
  MethodButtons,
  type PaymentMethod,
} from "@/components/common/method-buttons";
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
import { formatMoney, formatTime } from "@/lib/format";
import { me } from "@/lib/i18n/me";
import { cn } from "@/lib/utils";
import { money, type ShiftTotalsOnly } from "@/features/shifts/types";
import { correctSale, voidSale } from "@/features/storage/actions";
import { correctPayment, voidExpense, voidPayment } from "../actions";

export type TodayPayment = {
  id: string;
  created_at: string;
  kind: "membership" | "day_pass" | "card_replacement";
  quantity: number;
  amount: string;
  method: "cash" | "card";
  note: string | null;
  shift_id: string | null;
  voided_at: string | null;
  void_reason: string | null;
  plan_name: string | null;
  member: string | null;
  entered_by: string;
};

export type TodayExpense = {
  id: string;
  created_at: string;
  category: string;
  description: string;
  amount: string;
  method: "cash" | "card" | null;
  shift_id: string | null;
  created_by: string;
  voided_at: string | null;
  void_reason: string | null;
  /** BR-141: set on a stock-in's automatic expense, which is voided with the stock-in. */
  stock_movement_id: string | null;
  entered_by: string;
};

/** S-12 "Prodaja iz magacina" (BR-142). */
export type TodaySale = {
  id: string;
  created_at: string;
  product: string;
  quantity: number;
  /** quantity × unit price, as decimal text. */
  amount: string;
  method: "cash" | "card";
  shift_id: string | null;
  voided_at: string | null;
  void_reason: string | null;
  entered_by: string;
};

/** S-12 description column, per payment kind. */
function describe(payment: TodayPayment): string {
  switch (payment.kind) {
    case "day_pass":
      return me.payments.descDayPass.replace("{qty}", String(payment.quantity));
    case "card_replacement":
      return me.payments.descCardReplacement.replace(
        "{member}",
        payment.member ?? "—",
      );
    default:
      return me.payments.descMembership
        .replace("{plan}", payment.plan_name ?? "—")
        .replace("{member}", payment.member ?? "—");
  }
}

const saleLabel = (sale: TodaySale) =>
  me.storage.saleDescription
    .replace("{product}", sale.product)
    .replace("{qty}", String(sale.quantity));

const methodLabel = (method: TodayPayment["method"] | null) =>
  method === "cash"
    ? me.memberships.cash
    : method === "card"
      ? me.memberships.card
      : me.payments.outOfTill;

type Editing =
  | { kind: "correct"; payment: TodayPayment }
  | { kind: "voidPayment"; payment: TodayPayment }
  | { kind: "voidExpense"; expense: TodayExpense }
  | { kind: "correctSale"; sale: TodaySale }
  | { kind: "voidSale"; sale: TodaySale }
  | null;

/**
 * S-12 (F-13, F-14): today's payments and my expenses, newest first. [Ispravi] and
 * [Poništi] are enabled per BR-094: the owner may touch any record, everyone else only
 * records of the shift open now (AS-14). The database enforces the same rule.
 */
export function PaymentsToday({
  payments,
  sales,
  expenses,
  openShiftId,
  shiftTotals,
  isOwner,
  staffId,
}: {
  payments: TodayPayment[];
  sales: TodaySale[];
  expenses: TodayExpense[];
  openShiftId: string | null;
  /** P-14: the open shift's totals, when this person may see them. */
  shiftTotals: ShiftTotalsOnly | null;
  isOwner: boolean;
  staffId: string;
}) {
  const [editing, setEditing] = useState<Editing>(null);
  const close = useCallback(() => setEditing(null), []);
  const editable = (shiftId: string | null, voided: string | null) =>
    !voided && (isOwner || (shiftId !== null && shiftId === openShiftId));

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        {me.payments.title}
      </h1>

      <section className="mb-8" aria-labelledby="payments-title">
        <h2 id="payments-title" className="mb-3 text-lg font-semibold">
          {me.payments.sectionPayments}
        </h2>
        <TableWrapper className="rounded-2xl border bg-card">
          <Table>
            <thead>
              <tr>
                <Th>{me.payments.columnTime}</Th>
                <Th>{me.payments.columnDescription}</Th>
                <Th>{me.payments.columnMethod}</Th>
                <Th className="text-right">{me.payments.columnAmount}</Th>
                <Th>{me.payments.columnEnteredBy}</Th>
                <Th>
                  <span className="sr-only">{me.users.actions}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <Td colSpan={6} className="text-muted-foreground">
                    {me.payments.empty}
                  </Td>
                </tr>
              ) : (
                payments.map((payment) => {
                  const canEdit = editable(payment.shift_id, payment.voided_at);
                  return (
                    <tr
                      key={payment.id}
                      data-voided={payment.voided_at ? "true" : undefined}
                      title={payment.void_reason ?? payment.note ?? undefined}
                      className={cn(
                        payment.voided_at &&
                          "text-muted-foreground line-through",
                      )}
                    >
                      <Td className="tabular-nums">
                        {formatTime(payment.created_at)}
                      </Td>
                      <Td>
                        {describe(payment)}
                        {payment.voided_at ? (
                          <span className="ml-2 text-xs no-underline">
                            ({me.payments.voided})
                          </span>
                        ) : null}
                      </Td>
                      <Td>{methodLabel(payment.method)}</Td>
                      <Td className="text-right whitespace-nowrap tabular-nums">
                        {formatMoney(payment.amount)}
                      </Td>
                      <Td>{payment.entered_by}</Td>
                      <Td className="text-right whitespace-nowrap">
                        <RowActions
                          label={describe(payment)}
                          canEdit={canEdit}
                          voided={Boolean(payment.voided_at)}
                          onCorrect={() =>
                            setEditing({ kind: "correct", payment })
                          }
                          onVoid={() =>
                            setEditing({ kind: "voidPayment", payment })
                          }
                        />
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </TableWrapper>
      </section>

      <section className="mb-8" aria-labelledby="sales-title">
        <h2 id="sales-title" className="mb-3 text-lg font-semibold">
          {me.storage.sectionSales}
        </h2>
        <TableWrapper className="rounded-2xl border bg-card">
          <Table>
            <thead>
              <tr>
                <Th>{me.payments.columnTime}</Th>
                <Th>{me.payments.columnDescription}</Th>
                <Th>{me.payments.columnMethod}</Th>
                <Th className="text-right">{me.payments.columnAmount}</Th>
                <Th>{me.payments.columnEnteredBy}</Th>
                <Th>
                  <span className="sr-only">{me.users.actions}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 ? (
                <tr>
                  <Td colSpan={6} className="text-muted-foreground">
                    {me.storage.noSales}
                  </Td>
                </tr>
              ) : (
                sales.map((sale) => {
                  const label = saleLabel(sale);
                  return (
                    <tr
                      key={sale.id}
                      data-voided={sale.voided_at ? "true" : undefined}
                      title={sale.void_reason ?? undefined}
                      className={cn(
                        sale.voided_at && "text-muted-foreground line-through",
                      )}
                    >
                      <Td className="tabular-nums">
                        {formatTime(sale.created_at)}
                      </Td>
                      <Td>
                        {label}
                        {sale.voided_at ? (
                          <span className="ml-2 text-xs no-underline">
                            ({me.payments.voided})
                          </span>
                        ) : null}
                      </Td>
                      <Td>{methodLabel(sale.method)}</Td>
                      <Td className="text-right whitespace-nowrap tabular-nums">
                        {formatMoney(sale.amount)}
                      </Td>
                      <Td>{sale.entered_by}</Td>
                      <Td className="text-right whitespace-nowrap">
                        <RowActions
                          label={label}
                          canEdit={editable(sale.shift_id, sale.voided_at)}
                          voided={Boolean(sale.voided_at)}
                          onCorrect={() =>
                            setEditing({ kind: "correctSale", sale })
                          }
                          onVoid={() => setEditing({ kind: "voidSale", sale })}
                        />
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </TableWrapper>
      </section>

      <section aria-labelledby="expenses-title">
        <h2 id="expenses-title" className="mb-3 text-lg font-semibold">
          {isOwner
            ? me.payments.sectionExpenses
            : me.payments.sectionMyExpenses}
        </h2>
        <TableWrapper className="rounded-2xl border bg-card">
          <Table>
            <thead>
              <tr>
                <Th>{me.payments.columnTime}</Th>
                <Th>{me.payments.columnDescription}</Th>
                <Th>{me.payments.columnMethod}</Th>
                <Th className="text-right">{me.payments.columnAmount}</Th>
                <Th>{me.payments.columnEnteredBy}</Th>
                <Th>
                  <span className="sr-only">{me.users.actions}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 ? (
                <tr>
                  <Td colSpan={6} className="text-muted-foreground">
                    {me.payments.noExpenses}
                  </Td>
                </tr>
              ) : (
                expenses.map((expense) => {
                  // BR-135: only the owner voids someone else's expense.
                  const fromStockIn = expense.stock_movement_id !== null;
                  const canVoid =
                    !fromStockIn &&
                    editable(expense.shift_id, expense.voided_at) &&
                    (isOwner || expense.created_by === staffId);
                  const label = `${expense.category}: ${expense.description}`;
                  return (
                    <tr
                      key={expense.id}
                      data-voided={expense.voided_at ? "true" : undefined}
                      title={expense.void_reason ?? undefined}
                      className={cn(
                        expense.voided_at &&
                          "text-muted-foreground line-through",
                      )}
                    >
                      <Td className="tabular-nums">
                        {formatTime(expense.created_at)}
                      </Td>
                      <Td>
                        {label}
                        {expense.voided_at ? (
                          <span className="ml-2 text-xs no-underline">
                            ({me.payments.voided})
                          </span>
                        ) : null}
                      </Td>
                      <Td>{methodLabel(expense.method)}</Td>
                      <Td className="text-right whitespace-nowrap tabular-nums">
                        {formatMoney(expense.amount)}
                      </Td>
                      <Td>{expense.entered_by}</Td>
                      <Td className="text-right whitespace-nowrap">
                        {!expense.voided_at ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!canVoid}
                            title={
                              canVoid
                                ? undefined
                                : fromStockIn
                                  ? me.storage.stockInExpense
                                  : me.payments.readOnly
                            }
                            aria-label={`${me.payments.void} ${label}`}
                            onClick={() =>
                              setEditing({ kind: "voidExpense", expense })
                            }
                          >
                            {me.payments.void}
                          </Button>
                        ) : null}
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </TableWrapper>
      </section>

      {/* S-12 footer (BR-115, D-54): aggregate totals only, never expense details. */}
      {shiftTotals ? (
        <section
          aria-labelledby="shift-totals-title"
          className="mt-8 rounded-2xl border bg-card p-4"
        >
          <h2 id="shift-totals-title" className="mb-3 font-semibold">
            {me.closeShift.footer}
          </h2>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {(
              [
                [me.closeShift.cashIncome, shiftTotals.cash_income],
                [me.closeShift.cardIncome, shiftTotals.card_income],
                [me.closeShift.tillExpenses, shiftTotals.till_expenses],
                [me.closeShift.expectedCash, shiftTotals.expected_cash],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-base font-semibold tabular-nums">
                  {formatMoney(money(value))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {editing?.kind === "correct" ? (
        <CorrectDialog
          payment={editing.payment}
          isOwner={isOwner}
          onClose={close}
        />
      ) : null}
      {editing?.kind === "voidPayment" ? (
        <VoidDialog
          id={editing.payment.id}
          subject={describe(editing.payment)}
          warning={
            editing.payment.kind === "membership"
              ? me.payments.voidMembershipWarning
              : null
          }
          action={voidPayment}
          onClose={close}
        />
      ) : null}
      {editing?.kind === "correctSale" ? (
        <CorrectSaleDialog sale={editing.sale} onClose={close} />
      ) : null}
      {editing?.kind === "voidSale" ? (
        <VoidDialog
          id={editing.sale.id}
          subject={saleLabel(editing.sale)}
          warning={null}
          action={voidSale}
          onClose={close}
        />
      ) : null}
      {editing?.kind === "voidExpense" ? (
        <VoidDialog
          id={editing.expense.id}
          subject={`${editing.expense.category}: ${editing.expense.description}`}
          warning={null}
          action={voidExpense}
          onClose={close}
        />
      ) : null}
    </>
  );
}

function RowActions({
  label,
  canEdit,
  voided,
  onCorrect,
  onVoid,
}: {
  label: string;
  canEdit: boolean;
  voided: boolean;
  onCorrect: () => void;
  onVoid: () => void;
}) {
  if (voided) return null;
  const title = canEdit ? undefined : me.payments.readOnly;
  return (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!canEdit}
        title={title}
        aria-label={`${me.payments.correct} ${label}`}
        onClick={onCorrect}
      >
        {me.payments.correct}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!canEdit}
        title={title}
        aria-label={`${me.payments.void} ${label}`}
        onClick={onVoid}
      >
        {me.payments.void}
      </Button>
    </div>
  );
}

/** US-13.1 AC2: method and note for everyone, the amount for the owner (BR-094). */
function CorrectDialog({
  payment,
  isOwner,
  onClose,
}: {
  payment: TodayPayment;
  isOwner: boolean;
  onClose: () => void;
}) {
  const [state, onSubmit, pending] = useFormAction(correctPayment);
  const [method, setMethod] = useState<PaymentMethod | null>(payment.method);
  useActionToast(state, onClose);
  const errors = state.fieldErrors ?? {};

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{me.payments.correctTitle}</DialogTitle>
          <DialogDescription>
            {describe(payment)} · {formatMoney(payment.amount)}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <input type="hidden" name="paymentId" value={payment.id} />
          <FormError>{state.error}</FormError>
          <MethodButtons
            idPrefix="correct"
            value={method}
            onChange={setMethod}
            error={errors.method}
          />
          <div className="grid gap-2">
            <Label htmlFor="correct-note">{me.payments.note}</Label>
            <Input
              id="correct-note"
              name="note"
              defaultValue={payment.note ?? ""}
              autoComplete="off"
              aria-invalid={Boolean(errors.note)}
              aria-describedby="correct-note-error"
            />
            <FieldError id="correct-note-error">{errors.note}</FieldError>
          </div>
          {isOwner ? (
            <div className="grid gap-2">
              <Label htmlFor="correct-amount">{me.payments.amount}</Label>
              <Input
                id="correct-amount"
                name="amount"
                inputMode="decimal"
                defaultValue={payment.amount.replace(".", ",")}
                aria-invalid={Boolean(errors.amount)}
                aria-describedby="correct-amount-error"
              />
              <FieldError id="correct-amount-error">{errors.amount}</FieldError>
            </div>
          ) : null}
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

/** BR-094: a bar sale's method is the only thing that can be corrected. */
function CorrectSaleDialog({
  sale,
  onClose,
}: {
  sale: TodaySale;
  onClose: () => void;
}) {
  const [state, onSubmit, pending] = useFormAction(correctSale);
  const [method, setMethod] = useState<PaymentMethod | null>(sale.method);
  useActionToast(state, onClose);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{me.storage.correctSaleTitle}</DialogTitle>
          <DialogDescription>
            {saleLabel(sale)} · {formatMoney(sale.amount)}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <input type="hidden" name="movementId" value={sale.id} />
          <FormError>{state.error}</FormError>
          <MethodButtons
            idPrefix="correct-sale"
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

/** US-13.1 AC2/AC3 and BR-135: a void always asks for a reason of 3–200 characters. */
function VoidDialog({
  id,
  subject,
  warning,
  action,
  onClose,
}: {
  id: string;
  subject: string;
  warning: string | null;
  action: typeof voidPayment;
  onClose: () => void;
}) {
  const [state, onSubmit, pending] = useFormAction(action);
  useActionToast(state, onClose);
  const error = state.fieldErrors?.reason;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{me.payments.voidTitle}</DialogTitle>
          <DialogDescription>{subject}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <input type="hidden" name="id" value={id} />
          <FormError>{state.error}</FormError>
          {warning ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <TriangleAlert
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              {warning}
            </p>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="void-reason">{me.payments.reason}</Label>
            <Input
              id="void-reason"
              name="reason"
              autoComplete="off"
              aria-invalid={Boolean(error)}
              aria-describedby="void-reason-hint void-reason-error"
            />
            <p id="void-reason-hint" className="text-sm text-muted-foreground">
              {me.payments.reasonHint}
            </p>
            <FieldError id="void-reason-error">{error}</FieldError>
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
      </DialogContent>
    </Dialog>
  );
}
