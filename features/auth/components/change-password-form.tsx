"use client";

import { useActionState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { FieldError, FormError } from "@/components/common/form-message";
import { useToast } from "@/components/common/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idleState } from "@/lib/action-state";
import { me } from "@/lib/i18n/me";
import { changeOwnPassword } from "../actions";

/**
 * S-01b when `firstLogin` is true: only the new password and its repeat, because the
 * temporary password was just used, or the reset link proved who it is (D-69).
 * Otherwise US-01.4 also asks for the current one.
 */
export function ChangePasswordForm({ firstLogin }: { firstLogin: boolean }) {
  const [state, action, pending] = useActionState(changeOwnPassword, idleState);
  const toast = useToast();

  // Keyed on the state object, not its text, so a second change reports again
  // even though the confirmation reads the same (US-01.4 AC1).
  useEffect(() => {
    if (state.success) toast({ tone: "success", message: state.success });
  }, [state, toast]);

  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormError>{state.error}</FormError>
      {firstLogin ? null : (
        <div className="grid gap-1.5">
          <Label htmlFor="current">{me.password.current}</Label>
          <Input
            id="current"
            name="current"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={Boolean(state.fieldErrors?.current)}
            aria-describedby="current-error"
          />
          <FieldError id="current-error">
            {state.fieldErrors?.current}
          </FieldError>
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="next">{me.password.next}</Label>
        <Input
          id="next"
          name="next"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          aria-invalid={Boolean(state.fieldErrors?.next)}
          aria-describedby="next-error"
        />
        <FieldError id="next-error">{state.fieldErrors?.next}</FieldError>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="repeat">{me.password.repeat}</Label>
        <Input
          id="repeat"
          name="repeat"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          aria-invalid={Boolean(state.fieldErrors?.repeat)}
          aria-describedby="repeat-error"
        />
        <FieldError id="repeat-error">{state.fieldErrors?.repeat}</FieldError>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : null}
        {me.password.submit}
      </Button>
    </form>
  );
}
