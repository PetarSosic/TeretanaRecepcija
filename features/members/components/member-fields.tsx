"use client";

import { FieldError } from "@/components/common/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { me } from "@/lib/i18n/me";
import { DateOfBirthField } from "./date-of-birth-field";

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
 * accepts typing dd.mm.yyyy and also offers a calendar (S-05 item 2, D-79).
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
      <DateOfBirthField
        id={`${idPrefix}-dateOfBirth`}
        defaultValue={defaults?.dateOfBirth ?? ""}
        error={fieldErrors.dateOfBirth}
      />
    </div>
  );
}
