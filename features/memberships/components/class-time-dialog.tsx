"use client";

import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { FormError } from "@/components/common/form-message";
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
import { me } from "@/lib/i18n/me";
import { changeClassTime } from "../actions";
import {
  classTimesOf,
  membershipClassTimeLabel,
  type ClassTime,
} from "../class-time";
import { ClassTimeSelect } from "./class-time-select";

export type ClassTimeMembership = {
  id: string;
  plan_name: string;
  trainer_id: string;
  trainer_name: string | null;
  class_time: string | null;
};

/**
 * D-71: S-07 [Promijeni termin]. The member moves to another active time of the same
 * trainer; the trainer, amount and payment stay as sold, so nothing is charged.
 */
export function ClassTimeDialog({
  open,
  onOpenChange,
  memberId,
  membership,
  classTimes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
  membership: ClassTimeMembership | null;
  classTimes: ClassTime[];
}) {
  const current = membership?.class_time
    ? membershipClassTimeLabel(
        classTimes,
        membership.trainer_id,
        membership.class_time,
      )
    : me.memberships.classTimeNone;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{me.memberships.changeClassTime}</DialogTitle>
          {membership ? (
            <DialogDescription>
              {membership.plan_name} · {membership.trainer_name ?? "—"}
              <br />
              {me.memberships.currentClassTime.replace("{value}", current)}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        {/* Remounted per opening, so each change starts from the saved time. */}
        {open && membership ? (
          <ClassTimeForm
            memberId={memberId}
            membership={membership}
            options={classTimesOf(classTimes, membership.trainer_id)}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ClassTimeForm({
  memberId,
  membership,
  options,
  onDone,
}: {
  memberId: string;
  membership: ClassTimeMembership;
  options: ClassTime[];
  onDone: () => void;
}) {
  const [state, onSubmit, pending] = useFormAction(changeClassTime);
  const close = useCallback(() => onDone(), [onDone]);
  useActionToast(state, close);
  const [value, setValue] = useState(
    options.some((option) => option.starts_at === membership.class_time)
      ? (membership.class_time ?? "")
      : "",
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="membershipId" value={membership.id} />
      <FormError>{state.error}</FormError>
      <ClassTimeSelect
        id="change-class-time"
        options={options}
        value={value}
        onChange={setValue}
        error={state.fieldErrors?.classTime}
      />
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            {me.common.cancel}
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending || !options.length}>
          {pending ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : null}
          {me.common.save}
        </Button>
      </DialogFooter>
    </form>
  );
}
