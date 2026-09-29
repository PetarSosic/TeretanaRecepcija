import { formatClockTime } from "@/lib/format";
import { me } from "@/lib/i18n/me";

/**
 * D-71: a fixed class time ("Fiksni termin") — one trainer's group classes that start at
 * the same time, with every weekday they are held (ISO, 1 = Monday).
 */
export type ClassTime = {
  trainer_id: string;
  /** As Postgres returns a time: "08:00:00". */
  starts_at: string;
  weekdays: number[];
};

/** "Uto, čet, sub · 08:00"; the days come first, Monday first. */
export function classTimeLabel(
  time: Pick<ClassTime, "starts_at" | "weekdays">,
) {
  const days = [...time.weekdays]
    .sort((a, b) => a - b)
    .map((day) => me.memberships.weekdaysShort[day - 1])
    .join(", ");
  const clock = formatClockTime(time.starts_at);
  if (!days) return clock;
  return `${days.charAt(0).toUpperCase()}${days.slice(1)} · ${clock}`;
}

/** The trainer's active class times, earliest first. */
export function classTimesOf(times: ClassTime[], trainerId: string) {
  return times
    .filter((time) => time.trainer_id === trainerId)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/**
 * S-07 shows the membership's time with its days while it is still in the schedule;
 * a time since removed from the schedule is shown as the clock time alone.
 */
export function membershipClassTimeLabel(
  times: ClassTime[],
  trainerId: string,
  startsAt: string,
) {
  const active = times.find(
    (time) => time.trainer_id === trainerId && time.starts_at === startsAt,
  );
  return classTimeLabel(active ?? { starts_at: startsAt, weekdays: [] });
}
