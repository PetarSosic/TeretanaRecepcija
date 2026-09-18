"use client";

import { useRef, useState, useTransition } from "react";
import { CircleCheck, Loader2 } from "lucide-react";
import { FieldError } from "@/components/common/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { me } from "@/lib/i18n/me";
import { checkCard } from "../actions";

/**
 * The card field of S-05 and S-09. The USB scanner types ten digits and Enter; Enter
 * checks the card instead of submitting the form, and the BR-070 message appears when it
 * is not an unassigned card of this gym (US-11.1 AC2). Only a confirmed code is sent,
 * through the hidden `cardCode` input, so the save stays disabled until then (US-06.1 AC4).
 */
export function CardScanField({
  id,
  label,
  onChange,
  serverError,
  autoFocus,
  initialCode,
}: {
  id: string;
  label: string;
  onChange: (code: string | null) => void;
  serverError?: string;
  autoFocus?: boolean;
  /** S-05 opened by a scan on S-03: the card is already known and read-only. */
  initialCode?: string;
}) {
  const [text, setText] = useState("");
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  // Two scans in quick succession can be answered out of order; only the answer to the
  // latest one may change the field.
  const latest = useRef(0);

  if (initialCode)
    return (
      <div className="grid gap-2">
        <span className="text-sm font-medium">{me.members.cardCode}</span>
        <output className="flex h-10 items-center rounded-lg border bg-muted px-3 font-mono text-sm tabular-nums">
          {initialCode}
        </output>
        <input type="hidden" name="cardCode" value={initialCode} />
        <FieldError id={`${id}-error`}>{serverError}</FieldError>
      </div>
    );

  function check() {
    const value = text.trim();
    // Enter already checked it; the blur that follows must not ask again.
    if (!value || value === confirmed) return;
    const request = ++latest.current;
    startTransition(async () => {
      const result = await checkCard(value);
      if (request !== latest.current) return;
      if (result.data) {
        setConfirmed(result.data);
        setError(undefined);
        onChange(result.data);
      } else {
        setConfirmed(null);
        setError(result.error);
        onChange(null);
      }
    });
  }

  const shownError = error ?? (confirmed ? undefined : serverError);
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          value={text}
          inputMode="numeric"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder={me.members.cardCode}
          aria-invalid={Boolean(shownError)}
          aria-describedby={`${id}-error ${id}-status`}
          onChange={(event) => {
            setText(event.target.value);
            latest.current++;
            if (confirmed) {
              setConfirmed(null);
              onChange(null);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              check();
            }
          }}
          onBlur={check}
        />
        {pending ? (
          <Loader2
            aria-hidden="true"
            className="absolute top-3 right-3 size-4 animate-spin text-muted-foreground"
          />
        ) : null}
      </div>
      <input type="hidden" name="cardCode" value={confirmed ?? ""} />
      <p
        id={`${id}-status`}
        role="status"
        className="flex items-center gap-1.5 text-sm text-success empty:hidden"
      >
        {confirmed ? (
          <>
            <CircleCheck aria-hidden="true" className="size-3.5 shrink-0" />
            {me.members.cardReady}
          </>
        ) : null}
      </p>
      <FieldError id={`${id}-error`}>{shownError}</FieldError>
    </div>
  );
}
