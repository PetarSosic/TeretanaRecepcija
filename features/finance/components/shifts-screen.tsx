"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { FieldError, FormError } from "@/components/common/form-message";
import { useActionToast } from "@/components/common/use-action-toast";
import { useFormAction } from "@/components/common/use-form-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { formatDateTime, formatMoney } from "@/lib/format";
import { me } from "@/lib/i18n/me";
import { closeAnyShift, resendShiftReport } from "../actions";

export type ShiftRow = {
  id: string;
  staff_name: string;
  started_at: string;
  closed_at: string | null;
  close_type: "manual" | "takeover" | "auto" | null;
  closed_by_name: string | null;
  /** Decimal text, as numeric(10,2) arrives (BR-003). */
  counted_cash: string | null;
  report_path: string | null;
  email_status: "not_sent" | "pending" | "sent" | "failed";
  email_attempts: number;
  emailed_at: string | null;
  cash_income: string;
  card_income: string;
  till_expenses: string;
  expected_cash: string;
  difference: string | null;
};

const CLOSE_TYPES: Record<string, string> = {
  manual: me.report.closedManual,
  takeover: me.report.closedTakeover.replace(" {name}", ""),
  auto: me.report.closedAuto,
};

const EMAIL_STATUS: Record<string, string> = {
  sent: me.finance.emailSent,
  failed: me.finance.emailFailed,
  not_sent: me.finance.emailNotSent,
  pending: me.finance.emailPending,
};

/** S-19 (F-16 for the owner): the shifts of the period, and the open one on top. */
export function ShiftsScreen({ rows }: { rows: ShiftRow[] }) {
  const [closing, setClosing] = useState<ShiftRow | null>(null);
  const open = rows.find((row) => row.closed_at === null);
  const closed = rows.filter((row) => row.closed_at !== null);

  return (
    <div className="grid gap-6">
      {open ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">
                {me.finance.openShift}
              </p>
              <p className="mt-1 font-medium">
                {open.staff_name} · {formatDateTime(open.started_at)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {me.finance.expected}: {formatMoney(open.expected_cash)}
              </p>
            </div>
            <Button onClick={() => setClosing(open)}>
              {me.finance.closeShift}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {closed.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {me.finance.shiftsEmpty}
        </p>
      ) : (
        <TableWrapper>
          <Table>
            <thead>
              <tr>
                <Th>{me.finance.receptionist}</Th>
                <Th>{me.finance.start}</Th>
                <Th>{me.finance.end}</Th>
                <Th>{me.finance.closeType}</Th>
                <Th className="text-right">{me.finance.cash}</Th>
                <Th className="text-right">{me.finance.card}</Th>
                <Th className="text-right">{me.finance.expected}</Th>
                <Th className="text-right">{me.finance.counted}</Th>
                <Th className="text-right">{me.finance.difference}</Th>
                <Th>{me.finance.emailStatus}</Th>
                <Th>
                  <span className="sr-only">{me.users.actions}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {closed.map((row) => (
                <tr key={row.id}>
                  <Td>{row.staff_name}</Td>
                  <Td className="whitespace-nowrap">
                    {formatDateTime(row.started_at)}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {row.closed_at ? formatDateTime(row.closed_at) : "—"}
                  </Td>
                  <Td>
                    {CLOSE_TYPES[row.close_type ?? ""] ?? "—"}
                    {row.closed_by_name ? (
                      <span className="block text-xs text-muted-foreground">
                        {row.closed_by_name}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {formatMoney(row.cash_income)}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {formatMoney(row.card_income)}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {formatMoney(row.expected_cash)}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {row.counted_cash === null
                      ? me.report.notCounted
                      : formatMoney(row.counted_cash)}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {row.difference === null ? "—" : formatMoney(row.difference)}
                  </Td>
                  <Td>
                    {EMAIL_STATUS[row.email_status]}
                    {row.email_attempts > 0 ? (
                      <span className="block text-xs text-muted-foreground">
                        {row.email_attempts}×
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      {row.report_path ? (
                        <Button asChild variant="outline" size="sm">
                          <a href={`/api/pdf/shift/${row.id}`}>
                            {me.finance.downloadPdf}
                          </a>
                        </Button>
                      ) : null}
                      {row.email_status !== "sent" ? (
                        <ResendButton shiftId={row.id} />
                      ) : null}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrapper>
      )}

      <CloseDialog shift={closing} onDone={() => setClosing(null)} />
    </div>
  );
}

/** BR-118 [Pošalji ponovo]. */
function ResendButton({ shiftId }: { shiftId: string }) {
  const [state, onSubmit, pending] = useFormAction(resendShiftReport);
  useActionToast(state);

  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="shiftId" value={shiftId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : null}
        {me.finance.resendEmail}
      </Button>
    </form>
  );
}

/** BR-114 and P-12: the owner closes any open shift, with the counted cash optional. */
function CloseDialog({
  shift,
  onDone,
}: {
  shift: ShiftRow | null;
  onDone: () => void;
}) {
  const [state, onSubmit, pending] = useFormAction(closeAnyShift);
  useActionToast(state, onDone);

  return (
    <Dialog open={Boolean(shift)} onOpenChange={(open) => !open && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{me.finance.closeShift}</DialogTitle>
          <DialogDescription>
            {shift
              ? `${shift.staff_name} · ${me.finance.expected}: ${formatMoney(shift.expected_cash)}`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <input type="hidden" name="shiftId" value={shift?.id ?? ""} />
          <FormError>{state.error}</FormError>
          <div className="grid gap-1.5">
            <Label htmlFor="countedCash">{me.finance.countedCash}</Label>
            <Input id="countedCash" name="countedCash" inputMode="decimal" />
            <p className="text-xs text-muted-foreground">
              {me.finance.countedOptional}
            </p>
            <FieldError id="countedCash-error">
              {state.fieldErrors?.countedCash}
            </FieldError>
          </div>
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
              {me.finance.closeShift}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
