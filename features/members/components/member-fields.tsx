"use client";

import { useRef } from "react";
import { CalendarDays } from "lucide-react";
import { FieldError } from "@/components/common/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate, parseDateInput } from "@/lib/format";
import { me } from "@/lib/i18n/me";

export type MemberValues = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  /** As typed: dd.mm.yyyy. */
  dateOfBirth: string;
};

/**
 * BR-040: the personal data of S-05 and of [Uredi podatke] on S-07. The date of birth
 * accepts typing dd.mm.yyyy and also offers the browser's date picker (S-05 item 2).
 */
export function MemberFields({
  idPrefix,
  defaults,
  fieldErrors = {},
  onContactBlur,
}: {
  idPrefix: string;
  defaults?: Partial<MemberValues>;
  fieldErrors?: Record<string, string>;
  /** BR-043: the duplicate check runs when the phone or email field loses focus. */
  onContactBlur?: () => void;
}) {
  const dateText = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  const field = (
    name: keyof MemberValues,
    label: string,
    props: React.ComponentProps<"input"> = {},
  ) => (
    <div className="grid gap-2">
      <Label htmlFor={`${idPrefix}-${name}`}>{label}</Label>
      <Input
        id={`${idPrefix}-${name}`}
        name={name}
        defaultValue={defaults?.[name] ?? ""}
        aria-invalid={Boolean(fieldErrors[name])}
        aria-describedby={`${idPrefix}-${name}-error`}
        {...props}
      />
      <FieldError id={`${idPrefix}-${name}-error`}>
        {fieldErrors[name]}
      </FieldError>
    </div>
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {field("firstName", me.members.firstName, { autoComplete: "off" })}
      {field("lastName", me.members.lastName, { autoComplete: "off" })}
      {field("phone", me.members.phone, {
        type: "tel",
        autoComplete: "off",
        onBlur: onContactBlur,
      })}
      {field("email", me.members.email, {
        type: "email",
        autoComplete: "off",
        onBlur: onContactBlur,
      })}
      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-dateOfBirth`}>
          {me.members.dateOfBirth}
        </Label>
        <div className="flex gap-2">
          <Input
            ref={dateText}
            id={`${idPrefix}-dateOfBirth`}
            name="dateOfBirth"
            placeholder={me.members.datePlaceholder}
            defaultValue={defaults?.dateOfBirth ?? ""}
            autoComplete="off"
            aria-invalid={Boolean(fieldErrors.dateOfBirth)}
            aria-describedby={`${idPrefix}-dateOfBirth-error`}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={me.members.pickDate}
            title={me.members.pickDate}
            onClick={() => picker.current?.showPicker()}
          >
            <CalendarDays aria-hidden="true" />
          </Button>
          {/* The picker writes back into the typed field, which is what is submitted. */}
          <input
            ref={picker}
            type="date"
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
            min="1900-01-01"
            onChange={(event) => {
              const iso = parseDateInput(event.target.value);
              if (iso && dateText.current)
                dateText.current.value = formatDate(iso);
            }}
          />
        </div>
        <FieldError id={`${idPrefix}-dateOfBirth-error`}>
          {fieldErrors.dateOfBirth}
        </FieldError>
      </div>
    </div>
  );
}
