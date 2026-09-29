"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { FieldError } from "@/components/common/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  formatDate,
  gymDateOf,
  parseDateInput,
  typeDateInput,
} from "@/lib/format";
import { me } from "@/lib/i18n/me";
import { cn } from "@/lib/utils";

// AS-2: a date of birth lies between 01.01.1900 and today.
const FIRST_YEAR = 1900;
// Taller than the calendar, so it opens upwards when there is no room below.
const CALENDAR_HEIGHT = 360;

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * S-05 item 2 and D-79: the date of birth is typed as digits (the dots come by
 * themselves) or picked from a calendar whose year and month are chosen from lists,
 * instead of the browser's picker, which scrolled month by month from today. The typed
 * field is what the form submits.
 */
export function DateOfBirthField({
  id,
  defaultValue,
  error,
}: {
  id: string;
  defaultValue: string;
  error?: string;
}) {
  const field = useRef<HTMLInputElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<null | {
    selected: string | null;
    above: boolean;
  }>(null);

  useEffect(() => {
    if (!open) return;
    // Esc closes the calendar, not the dialog around it: Radix listens on the document
    // in the capture phase, and the window hears the key before it.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      event.preventDefault();
      setOpen(null);
      toggle.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(null);
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div className="grid gap-2 sm:col-span-2">
      <Label htmlFor={id}>{me.members.dateOfBirth}</Label>
      <div ref={wrapper} className="relative flex gap-2">
        <Input
          ref={field}
          id={id}
          name="dateOfBirth"
          placeholder={me.members.datePlaceholder}
          defaultValue={defaultValue}
          inputMode="numeric"
          maxLength={10}
          autoComplete="off"
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-error`}
          onChange={(event) => {
            const input = event.currentTarget;
            const inserted = (
              event.nativeEvent as InputEvent
            ).inputType?.startsWith("insert");
            if (inserted && input.selectionStart === input.value.length)
              input.value = typeDateInput(input.value);
          }}
        />
        <Button
          ref={toggle}
          type="button"
          variant="outline"
          size="icon"
          aria-label={me.members.pickDate}
          title={me.members.pickDate}
          aria-expanded={Boolean(open)}
          onClick={() => {
            if (open) {
              setOpen(null);
              return;
            }
            // The member edit dialog does not scroll, so near the bottom of the
            // window the calendar opens upwards.
            const box = wrapper.current?.getBoundingClientRect();
            const below = box ? window.innerHeight - box.bottom : Infinity;
            setOpen({
              selected: parseDateInput(field.current?.value ?? ""),
              above:
                below < CALENDAR_HEIGHT && (box?.top ?? 0) > CALENDAR_HEIGHT,
            });
          }}
        >
          <CalendarDays aria-hidden="true" />
        </Button>
        {open ? (
          <Calendar
            selected={open.selected}
            className={open.above ? "bottom-full mb-2" : "top-full mt-2"}
            onPick={(iso) => {
              if (field.current) field.current.value = formatDate(iso);
              setOpen(null);
              toggle.current?.focus();
            }}
          />
        ) : null}
      </div>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}

function Calendar({
  selected,
  className,
  onPick,
}: {
  selected: string | null;
  className: string;
  onPick: (iso: string) => void;
}) {
  // The gym's date in this browser, only to mark today and stop the calendar there;
  // the server still checks the date against gym_today (BR-001, BR-040).
  const [today] = useState(() => gymDateOf(new Date()));
  const lastYear = Number(today.slice(0, 4));
  const lastMonth = Number(today.slice(5, 7));
  const start = selected && selected <= today ? selected : today;
  const [view, setView] = useState({
    year: Number(start.slice(0, 4)),
    month: Number(start.slice(5, 7)),
  });
  const panel = useRef<HTMLDivElement>(null);
  const yearSelect = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    // Inside the scrolling registration dialog the calendar may start below the fold.
    panel.current?.scrollIntoView({ block: "nearest" });
    yearSelect.current?.focus();
  }, []);

  // A month after today's cannot be shown, so a later month moves back to it.
  const go = (year: number, month: number) =>
    setView(
      year > lastYear || (year === lastYear && month > lastMonth)
        ? { year: lastYear, month: lastMonth }
        : { year, month },
    );
  const previous = () =>
    view.month === 1 ? go(view.year - 1, 12) : go(view.year, view.month - 1);
  const next = () =>
    view.month === 12 ? go(view.year + 1, 1) : go(view.year, view.month + 1);

  // Monday first, as in the schedule; blanks before the 1st.
  const offset =
    (new Date(Date.UTC(view.year, view.month - 1, 1)).getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(view.year, view.month, 0)).getUTCDate();
  const days = Array.from({ length }, (_, index) => index + 1);
  const years = Array.from(
    { length: lastYear - FIRST_YEAR + 1 },
    (_, index) => lastYear - index,
  );

  return (
    <div
      ref={panel}
      role="group"
      aria-label={me.members.pickDate}
      className={cn(
        "absolute right-0 z-10 grid w-72 gap-3 rounded-xl border bg-card p-3 shadow-lg",
        className,
      )}
    >
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          aria-label={me.members.previousMonth}
          disabled={view.year === FIRST_YEAR && view.month === 1}
          onClick={previous}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <Select
          aria-label={me.members.calendarMonth}
          value={view.month}
          onChange={(event) => go(view.year, Number(event.target.value))}
          className="h-9 min-w-0 flex-1 px-2"
        >
          {me.finance.monthNames.map((name, index) => (
            <option
              key={name}
              value={index + 1}
              disabled={view.year === lastYear && index + 1 > lastMonth}
            >
              {name}
            </option>
          ))}
        </Select>
        <Select
          ref={yearSelect}
          aria-label={me.members.calendarYear}
          value={view.year}
          onChange={(event) => go(Number(event.target.value), view.month)}
          className="h-9 w-20 shrink-0 px-2"
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          aria-label={me.members.nextMonth}
          disabled={view.year === lastYear && view.month === lastMonth}
          onClick={next}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {me.memberships.weekdaysShort.map((day) => (
          <span key={day} className="py-1 text-xs text-muted-foreground">
            {day}
          </span>
        ))}
        {Array.from({ length: offset }, (_, index) => (
          <span key={`blank-${index}`} />
        ))}
        {days.map((day) => {
          const iso = isoDate(view.year, view.month, day);
          return (
            <button
              key={day}
              type="button"
              aria-label={formatDate(iso)}
              aria-pressed={iso === selected}
              disabled={iso > today}
              onClick={() => onPick(iso)}
              className={cn(
                "h-9 rounded-md text-sm tabular-nums hover:bg-muted disabled:pointer-events-none disabled:opacity-40",
                iso === today && "border",
                iso === selected &&
                  "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
