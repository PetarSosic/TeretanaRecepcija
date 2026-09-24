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
  title,
  ...props
}: ComponentProps<typeof Button>) {
  const { hasOpenShift, isOffline } = useAppState();
  const state = moneyActionState({ hasOpenShift, isOffline });
  // N-22 (STO-07): a caller that disables the button for its own reason, such as
  // `Nema na stanju.`, keeps that reason; BR-092's shift or connection reason wins.
  const reason = state.reason ?? (disabled ? title : undefined);

  return (
    <Button
      {...props}
      disabled={disabled || state.disabled}
      title={reason ?? title}
      aria-describedby={undefined}
      aria-label={
        reason
          ? `${props["aria-label"] ?? ""} ${reason}`.trim()
          : props["aria-label"]
      }
    />
  );
}
