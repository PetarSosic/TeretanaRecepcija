"use client";

import { useActionState, useCallback, useMemo, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { FormError } from "@/components/common/form-message";
import { useActionToast } from "@/components/common/use-action-toast";
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
import { idleState, type ActionState } from "@/lib/action-state";
import { me } from "@/lib/i18n/me";

/**
 * The settings screens are all the same shape: a dialog with one form that calls one
 * RPC-backed action, reports the outcome as a toast (doc 06 §1) and closes on success.
 * The fields differ, so they arrive as a render prop that receives the action state.
 */
export function ActionDialog({
  title,
  description,
  open,
  onOpenChange,
  action,
  children,
}: {
  title: string;
  description?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: (state: ActionState) => ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Radix links its own DialogDescription; the escape hatch is only needed by a
          dialog that has none, and naming the id by hand left Radix's generated one
          unused, which is what its "Missing `Description`" warning reports. */}
      <DialogContent
        {...(description ? {} : { "aria-describedby": undefined })}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {/* N-12: the form and its action state live only while the dialog is open, so
            a reopened dialog never shows the previous attempt's messages. */}
        {open ? (
          <ActionForm action={action} onOpenChange={onOpenChange}>
            {children}
          </ActionForm>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ActionForm({
  action,
  onOpenChange,
  children,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  onOpenChange: (open: boolean) => void;
  children: (state: ActionState) => ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, idleState);
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  useActionToast(state, close);

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormError>{state.error}</FormError>
      <div className="grid max-h-[60vh] gap-4 overflow-y-auto">
        {children(state)}
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
          {me.common.save}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * The action behind an inline form, for a row whose fields sit in separate table
 * cells and so reach one form through the `form` attribute.
 */
export function useInlineAction(
  action: (state: ActionState, formData: FormData) => Promise<ActionState>,
) {
  const [state, formAction, pending] = useActionState(action, idleState);
  // N-13: an inline form has no field to put a message under, so a refused field is
  // reported as a toast instead of being dropped. Memoised on the state, because the
  // toast effect fires on every new object it is given.
  const reported = useMemo(() => {
    const fieldError = Object.values(state.fieldErrors ?? {}).find(Boolean);
    return !state.error && fieldError ? { ...state, error: fieldError } : state;
  }, [state]);
  useActionToast(reported);
  return [formAction, pending] as const;
}

/** A form that submits on its own, used for the assignment checkboxes and toggles. */
export function InlineForm({
  action,
  children,
  className,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: (pending: boolean) => ReactNode;
  className?: string;
}) {
  const [formAction, pending] = useInlineAction(action);
  return (
    <form action={formAction} className={className}>
      {children(pending)}
    </form>
  );
}
