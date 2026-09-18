"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { idleState, type ActionState } from "@/lib/action-state";

/**
 * useActionState for forms that must keep what was typed. A form given `action=` is
 * reset by React once the action settles, which would empty a half-filled registration
 * after a single validation error; submitting through onSubmit keeps every field.
 */
export function useFormAction<T>(
  action: (
    state: ActionState<T>,
    formData: FormData,
  ) => Promise<ActionState<T>>,
) {
  const [state, dispatch, pending] = useActionState(
    action,
    idleState as ActionState<T>,
  );
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    // A submit button inside the form may carry its own name and value.
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (submitter instanceof HTMLButtonElement && submitter.name)
      formData.set(submitter.name, submitter.value);
    startTransition(() => dispatch(formData));
  }
  return [state, onSubmit, pending] as const;
}
