"use client";

import { useCallback } from "react";
import { Loader2 } from "lucide-react";
import { FormError } from "@/components/common/form-message";
import { MoneyButton } from "@/components/common/money-button";
import { useActionToast } from "@/components/common/use-action-toast";
import { useFormAction } from "@/components/common/use-form-action";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { me } from "@/lib/i18n/me";
import { sellMembership } from "../actions";
import type { SaleCatalog } from "../catalog";
import { MembershipFields, type TrainerDefaults } from "./membership-fields";

/**
 * S-08, opened from the profile ([Nova članarina], or [Produži] with the same plan and
 * trainer preselected, US-08.2). [Naplati i sačuvaj] is a money action (BR-092).
 */
export function SellDialog({
  open,
  onOpenChange,
  memberId,
  catalog,
  defaultPlanId,
  trainerDefaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
  catalog: SaleCatalog;
  defaultPlanId?: string;
  trainerDefaults?: TrainerDefaults;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[92svh] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>{me.memberships.sellTitle}</DialogTitle>
        </DialogHeader>
        {/* Remounted per opening, so every sale starts from a clean form. */}
        {open ? (
          <SellForm
            memberId={memberId}
            catalog={catalog}
            defaultPlanId={defaultPlanId}
            trainerDefaults={trainerDefaults}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SellForm({
  memberId,
  catalog,
  defaultPlanId,
  trainerDefaults,
  onDone,
}: {
  memberId: string;
  catalog: SaleCatalog;
  defaultPlanId?: string;
  trainerDefaults?: TrainerDefaults;
  onDone: () => void;
}) {
  const [state, onSubmit, pending] = useFormAction(sellMembership);
  const close = useCallback(() => onDone(), [onDone]);
  useActionToast(state, close);

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <input type="hidden" name="memberId" value={memberId} />
      <FormError>{state.error}</FormError>
      <MembershipFields
        idPrefix="sell"
        catalog={catalog}
        memberId={memberId}
        defaultPlanId={defaultPlanId}
        trainerDefaults={trainerDefaults}
        fieldErrors={state.fieldErrors}
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
          {me.memberships.submit}
        </MoneyButton>
      </DialogFooter>
    </form>
  );
}
