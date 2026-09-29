"use client";

import { CircleAlert } from "lucide-react";
import { FieldError } from "@/components/common/form-message";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { me } from "@/lib/i18n/me";
import { classTimeLabel, type ClassTime } from "../class-time";

/**
 * D-71 (BR-058a): `Fiksni termin`, offering only the chosen trainer's active class
 * times. A trainer with none cannot be sold, so the field then says why instead.
 */
export function ClassTimeSelect({
  id,
  options,
  value,
  onChange,
  error,
}: {
  id: string;
  options: ClassTime[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  if (!options.length)
    return (
      <div className="grid gap-2">
        <span className="text-sm font-medium">{me.memberships.classTime}</span>
        <p
          id={`${id}-error`}
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-danger px-3 py-2 text-sm text-danger"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {me.memberships.noClassTimes}
        </p>
      </div>
    );

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{me.memberships.classTime}</Label>
      <Select
        id={id}
        name="classTime"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-error`}
      >
        <option value="" disabled>
          {me.memberships.classTimePlaceholder}
        </option>
        {options.map((option) => (
          <option key={option.starts_at} value={option.starts_at}>
            {classTimeLabel(option)}
          </option>
        ))}
      </Select>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}
