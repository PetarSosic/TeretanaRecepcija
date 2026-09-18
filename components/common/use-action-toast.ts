"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/common/toast";
import type { ActionState } from "@/lib/action-state";

/**
 * Doc 06 §1: a rule error is a red toast, a success is a confirmation.
 *
 * The effect keys on the state object rather than its text, so two identical
 * confirmations in a row are both reported. The success callback is held in a ref,
 * written from its own effect, so a caller that passes an inline arrow does not make
 * the toast fire again on every render.
 */
export function useActionToast(state: ActionState, onSuccess?: () => void) {
  const toast = useToast();
  const handleSuccess = useRef(onSuccess);

  useEffect(() => {
    handleSuccess.current = onSuccess;
  }, [onSuccess]);

  useEffect(() => {
    if (state.success) {
      toast({ tone: "success", message: state.success });
      handleSuccess.current?.();
    }
    if (state.error) toast({ tone: "error", message: state.error });
  }, [state, toast]);
}
