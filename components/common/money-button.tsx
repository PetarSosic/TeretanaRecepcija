"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { useAppState } from "@/components/common/app-state";
import { moneyActionState } from "@/lib/money-action";

/**
 * BR-092: every button that records money — a payment, a bar sale, an expense from the
 * till — is disabled unless a shift is open, and says why. F-27 disables it while the
 * connection is down. The reason is both the tooltip and the accessible description,
 * so the explanation is never colour or hover alone (D-47).
 *
 * The money screens of M-06 onward use this instead of a plain Button.
 */
export function MoneyButton({
  disabled,
  ...props
}: ComponentProps<typeof Button>) {
  const { hasOpenShift, isOffline } = useAppState();
  const state = moneyActionState({ hasOpenShift, isOffline });

  return (
    <Button
      {...props}
      disabled={disabled || state.disabled}
      title={state.reason}
      aria-describedby={undefined}
      aria-label={
        state.reason
          ? `${props["aria-label"] ?? ""} ${state.reason}`.trim()
          : props["aria-label"]
      }
    />
  );
}
