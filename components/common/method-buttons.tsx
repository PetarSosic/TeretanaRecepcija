"use client";

import { Banknote, CreditCard } from "lucide-react";
import { FieldError } from "@/components/common/form-message";
import { me } from "@/lib/i18n/me";
import { cn } from "@/lib/utils";

export type PaymentMethod = "cash" | "card";

/**
 * S-08 item 6: two large buttons, Gotovina and Platna kartica (BR-090). They are radio
 * inputs underneath, so the choice is announced, reachable with the keyboard and sent
 * with the form as `method`.
 */
export function MethodButtons({
  value,
  onChange,
  error,
  idPrefix,
}: {
  value: PaymentMethod | null;
  onChange: (method: PaymentMethod) => void;
  error?: string;
  idPrefix: string;
}) {
  const options = [
    { value: "cash" as const, label: me.memberships.cash, Icon: Banknote },
    { value: "card" as const, label: me.memberships.card, Icon: CreditCard },
  ];
  return (
    <fieldset
      className="grid gap-2"
      aria-describedby={`${idPrefix}-method-error`}
    >
      <legend className="mb-2 text-sm font-medium">
        {me.memberships.method}
      </legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map(({ value: option, label, Icon }) => (
          <label
            key={option}
            className={cn(
              "flex h-14 cursor-pointer items-center justify-center gap-2 rounded-lg border bg-card text-sm font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              value === option &&
                "border-primary bg-primary text-primary-foreground",
            )}
          >
            <input
              type="radio"
              name="method"
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              className="sr-only"
            />
            <Icon aria-hidden="true" className="size-5" />
            {label}
          </label>
        ))}
      </div>
      <FieldError id={`${idPrefix}-method-error`}>{error}</FieldError>
    </fieldset>
  );
}
