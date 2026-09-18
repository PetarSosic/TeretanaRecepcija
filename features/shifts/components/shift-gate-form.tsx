"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { FieldError, FormError } from "@/components/common/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signOutAction } from "@/features/auth/actions";
import { idleState } from "@/lib/action-state";
import { me } from "@/lib/i18n/me";
import { takeOverShift } from "../actions";

/** S-02: [Preuzmi smjenu] with an optional counted-cash field, or [Odjavi se]. */
export function ShiftGateForm() {
  const [state, action, pending] = useActionState(takeOverShift, idleState);

  return (
    <div className="grid gap-4">
      <form action={action} className="grid gap-4" noValidate>
        <FormError>{state.error}</FormError>
        <div className="grid gap-1.5">
          <Label htmlFor="countedCash">{me.shift.countedCash}</Label>
          <Input
            id="countedCash"
            name="countedCash"
            inputMode="decimal"
            autoFocus
            aria-invalid={Boolean(state.fieldErrors?.countedCash)}
            aria-describedby="countedCash-error"
          />
          <FieldError id="countedCash-error">
            {state.fieldErrors?.countedCash}
          </FieldError>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : null}
          {me.shift.takeOver}
        </Button>
      </form>
      <form action={signOutAction}>
        <Button type="submit" variant="outline" className="w-full">
          {me.shift.signOut}
        </Button>
      </form>
    </div>
  );
}
