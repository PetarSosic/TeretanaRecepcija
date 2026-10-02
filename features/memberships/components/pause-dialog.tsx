"use client";

import { useCallback, useState } from "react";
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
import { formatDate } from "@/lib/format";
import { me } from "@/lib/i18n/me";
import { endMembershipPause, pauseMembership } from "../actions";

/** BR-056 (D-100): the most days a membership may be paused, in total. */
export const PAUSE_DAYS_MAX = 7;

export type MembershipPause = {
  id: string;
  paused_from: string;
  paused_until: string;
  ended_early: boolean;
};

export type PausableMembership = {
  id: string;
  plan_name: string;
  start_date: string;
  end_date: string;
  paused_days: number;
};

/** A calendar day moved by whole days; dates stay yyyy-mm-dd, as the database keeps them. */
function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** "Pauza 05.10.2026–07.10.2026", for the profile and the dialogs. */
export function pauseRangeText(pause: MembershipPause): string {
  return me.memberships.pauseRange
    .replace("{from}", formatDate(pause.paused_from))
    .replace("{until}", formatDate(pause.paused_until));
}

/**
 * S-07 [Pauziraj] (BR-056, D-100): from today or later, inside the membership's validity,
 * for as many days as are left of the 7. "Važi do" moves by the days chosen.
 */
export function PauseDialog({
  open,
  onOpenChange,
  memberId,
  membership,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
  membership: PausableMembership | null;
  today: string;
}) {
  const left = membership ? PAUSE_DAYS_MAX - membership.paused_days : 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{me.memberships.pauseTitle}</DialogTitle>
          {membership ? (
            <DialogDescription>
              {membership.plan_name} · {me.memberships.until}{" "}
              {formatDate(membership.end_date)}
              <br />
              {me.memberships.pauseLeft.replace("{days}", String(left))}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        {/* Remounted per opening, so a new pause never shows the last one's messages. */}
        {open && membership ? (
          <PauseForm
            memberId={memberId}
            membership={membership}
            left={left}
            today={today}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PauseForm({
  memberId,
  membership,
  left,
  today,
  onDone,
}: {
  memberId: string;
  membership: PausableMembership;
  left: number;
  today: string;
  onDone: () => void;
}) {
  const [state, onSubmit, pending] = useFormAction(pauseMembership);
  const close = useCallback(() => onDone(), [onDone]);
  useActionToast(state, close);
  const first = membership.start_date > today ? membership.start_date : today;
  const [days, setDays] = useState("1");
  const count = Number(days);
  const valid = Number.isInteger(count) && count >= 1 && count <= left;

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="membershipId" value={membership.id} />
      <FormError>{state.error}</FormError>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="pause-from">{me.memberships.pauseFrom}</Label>
          <Input
            id="pause-from"
            name="pauseFrom"
            type="date"
            defaultValue={first}
            min={first}
            max={membership.end_date}
            aria-invalid={Boolean(state.fieldErrors?.pauseFrom)}
            aria-describedby="pause-from-error"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pause-days">{me.memberships.pauseDays}</Label>
          <Input
            id="pause-days"
            name="days"
            type="number"
            inputMode="numeric"
            min={1}
            max={left}
            value={days}
            onChange={(event) => setDays(event.target.value)}
            aria-invalid={Boolean(state.fieldErrors?.days)}
            aria-describedby="pause-days-error pause-preview"
          />
        </div>
      </div>
      <FieldError id="pause-from-error">
        {state.fieldErrors?.pauseFrom}
      </FieldError>
      <FieldError id="pause-days-error">{state.fieldErrors?.days}</FieldError>
      <p id="pause-preview" className="text-sm text-muted-foreground">
        {valid
          ? me.memberships.pauseUntilPreview.replace(
              "{date}",
              formatDate(addDays(membership.end_date, count)),
            )
          : me.memberships.pauseDaysInvalid.replace("{max}", String(left))}
      </p>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            {me.common.cancel}
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending || left < 1}>
          {pending ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : null}
          {me.common.save}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** S-07 [Prekini pauzu] (D-100): the member is back; the days from today go back. */
export function EndPauseDialog({
  open,
  onOpenChange,
  memberId,
  planName,
  pause,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
  planName: string;
  pause: MembershipPause | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{me.memberships.pauseEndTitle}</DialogTitle>
          {pause ? (
            <DialogDescription>
              {planName} · {pauseRangeText(pause)}
              <br />
              {me.memberships.pauseEndText}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        {open && pause ? (
          <EndPauseForm
            memberId={memberId}
            pause={pause}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EndPauseForm({
  memberId,
  pause,
  onDone,
}: {
  memberId: string;
  pause: MembershipPause;
  onDone: () => void;
}) {
  const [state, onSubmit, pending] = useFormAction(endMembershipPause);
  const close = useCallback(() => onDone(), [onDone]);
  useActionToast(state, close);

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="pauseId" value={pause.id} />
      <FormError>{state.error}</FormError>
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
          {me.memberships.pauseEnd}
        </Button>
      </DialogFooter>
    </form>
  );
}
