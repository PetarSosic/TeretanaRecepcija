"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { CircleAlert, Loader2, TriangleAlert } from "lucide-react";
import { FieldError, FormError } from "@/components/common/form-message";
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
import { idleState } from "@/lib/action-state";
import { formatMoney, formatTime, parseMoneyInput } from "@/lib/format";
import { me } from "@/lib/i18n/me";
import { closeShiftAndReport } from "../actions";
import { money, type ShiftReport } from "../types";

/** BR-003: counted − expected in whole cents, or null while the input is not money. */
function differenceOf(counted: string, expected: number): string | null {
  const text = counted.trim();
  if (!/^\d{1,8}([.,]\d{1,2})?$/.test(text)) return null;
  const cents = (value: string) =>
    BigInt(parseMoneyInput(value).replace(".", ""));
  const diff = cents(text) - cents(money(expected));
  const absolute = diff < 0n ? -diff : diff;
  return `${diff < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

/**
 * S-14 (BR-114, BR-115): the summary, the counted cash with the live difference, the
 * items on request, and a confirmation before the shift closes for good. While the
 * action runs, its steps are shown; success lands on `/login?closed=1`.
 */
export function CloseShiftScreen({
  shiftId,
  summary,
}: {
  shiftId: string;
  summary: ShiftReport;
}) {
  const [state, dispatch, pending] = useActionState(
    closeShiftAndReport,
    idleState,
  );
  const [counted, setCounted] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const { totals, counts } = summary;
  const difference = differenceOf(counted, totals.expected_cash);

  const cards: [string, number, boolean][] = [
    [me.closeShift.cashIncome, totals.cash_income, false],
    [me.closeShift.cardIncome, totals.card_income, false],
    [me.closeShift.tillExpenses, totals.till_expenses, false],
    [me.closeShift.expectedCash, totals.expected_cash, true],
  ];

  function submit() {
    setConfirming(false);
    if (!form.current) return;
    const data = new FormData(form.current);
    startTransition(() => dispatch(data));
  }

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">
        {me.closeShift.title}
      </h1>

      <dl className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(([label, value, strong]) => (
          <div
            key={label}
            className={
              strong
                ? "rounded-2xl border-2 border-primary bg-card p-4"
                : "rounded-2xl border bg-card p-4"
            }
          >
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">
              {formatMoney(money(value))}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mb-4 text-sm text-muted-foreground">
        {me.closeShift.counts
          .replace("{payments}", String(counts.payments))
          .replace("{dayPasses}", String(counts.day_passes))
          .replace("{sales}", String(counts.sales))
          .replace("{voided}", String(counts.voided))}
      </p>

      {summary.open_visits > 0 ? (
        <p
          role="status"
          className="mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
        >
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          {me.closeShift.stillInside.replace(
            "{count}",
            String(summary.open_visits),
          )}
        </p>
      ) : null}

      <form
        ref={form}
        className="grid max-w-md gap-3"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setConfirming(true);
        }}
      >
        <input type="hidden" name="shiftId" value={shiftId} />
        <FormError>{state.error}</FormError>
        <Label htmlFor="counted-cash">{me.closeShift.countedCash}</Label>
        <Input
          id="counted-cash"
          name="countedCash"
          inputMode="decimal"
          autoComplete="off"
          value={counted}
          onChange={(event) => setCounted(event.target.value)}
          aria-invalid={Boolean(state.fieldErrors?.countedCash)}
          aria-describedby="counted-cash-error counted-cash-difference"
          disabled={pending}
        />
        <FieldError id="counted-cash-error">
          {state.fieldErrors?.countedCash}
        </FieldError>
        {/* BR-115: negative is Manjak, positive is Višak; text and icon, not colour. */}
        <p
          id="counted-cash-difference"
          aria-live="polite"
          className="flex min-h-6 items-center gap-2 text-base font-medium"
        >
          {difference !== null ? (
            <>
              {difference.startsWith("-") ? (
                <CircleAlert
                  aria-hidden="true"
                  className="size-4 text-danger"
                />
              ) : null}
              {difference === "0.00"
                ? me.closeShift.difference
                    .replace("{amount}", formatMoney(difference))
                    .replace(" ({label})", "")
                : me.closeShift.difference
                    .replace("{amount}", formatMoney(difference))
                    .replace(
                      "{label}",
                      difference.startsWith("-")
                        ? me.closeShift.shortage
                        : me.closeShift.surplus,
                    )}
            </>
          ) : null}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setReviewing((value) => !value)}
            aria-expanded={reviewing}
            aria-controls="shift-items"
          >
            {reviewing ? me.closeShift.hideReview : me.closeShift.review}
          </Button>
          <Button type="submit" disabled={pending || difference === null}>
            {pending ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : null}
            {me.closeShift.submit}
          </Button>
        </div>

        {pending ? (
          <ol
            role="status"
            className="grid gap-1 text-sm text-muted-foreground"
          >
            <li>{me.closeShift.stepClose}</li>
            <li>{me.closeShift.stepReport}</li>
            <li>{me.closeShift.stepEmail}</li>
          </ol>
        ) : null}
      </form>

      {reviewing ? <ShiftItems summary={summary} /> : null}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{me.closeShift.confirmTitle}</DialogTitle>
            <DialogDescription>
              {me.closeShift.confirm}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {me.common.cancel}
              </Button>
            </DialogClose>
            <Button type="button" autoFocus onClick={submit}>
              {me.closeShift.confirmButton}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** S-14 [Pregledaj stavke]: the shift's records, as the report will list them. */
function ShiftItems({ summary }: { summary: ShiftReport }) {
  const rows: { key: string; time: string; text: string; amount: string }[] = [
    ...summary.payments.map((payment, index) => ({
      key: `p${index}`,
      time: payment.created_at,
      text: [
        payment.kind === "membership"
          ? me.members.kindMembership
          : payment.kind === "day_pass"
            ? `${me.members.kindDayPass} × ${payment.quantity}`
            : me.members.kindCardReplacement,
        payment.member,
        payment.method === "cash" ? me.memberships.cash : me.memberships.card,
      ]
        .filter(Boolean)
        .join(" · "),
      amount: formatMoney(money(payment.amount)),
    })),
    ...summary.sales.map((sale, index) => ({
      key: `s${index}`,
      time: sale.created_at,
      text: `${sale.product} × ${sale.quantity} · ${
        sale.method === "cash" ? me.memberships.cash : me.memberships.card
      }`,
      amount: formatMoney(money(sale.amount)),
    })),
    ...summary.till_expenses.map((expense, index) => ({
      key: `e${index}`,
      time: expense.created_at,
      text: `${expense.category}: ${expense.description}`,
      amount: `−${formatMoney(money(expense.amount))}`,
    })),
  ].sort((a, b) => a.time.localeCompare(b.time));

  return (
    <ul
      id="shift-items"
      className="mt-6 grid max-w-2xl gap-1 rounded-2xl border bg-card p-4 text-sm"
    >
      {rows.length === 0 ? (
        <li className="text-muted-foreground">{me.report.none}</li>
      ) : (
        rows.map((row) => (
          <li key={row.key} className="flex gap-3 border-b py-1 last:border-0">
            <span className="w-12 shrink-0 tabular-nums text-muted-foreground">
              {formatTime(row.time)}
            </span>
            <span className="min-w-0 flex-1">{row.text}</span>
            <span className="tabular-nums whitespace-nowrap">{row.amount}</span>
          </li>
        ))
      )}
    </ul>
  );
}
