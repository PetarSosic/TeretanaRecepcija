import { describe, expect, it } from "vitest";
import {
  classTimeLabel,
  classTimesOf,
  membershipClassTimeLabel,
  type ClassTime,
} from "@/features/memberships/class-time";

const milena = "11111111-1111-4111-8111-111111111111";
const tamara = "22222222-2222-4222-8222-222222222222";
const times: ClassTime[] = [
  { trainer_id: milena, starts_at: "18:00:00", weekdays: [2, 4, 6] },
  { trainer_id: tamara, starts_at: "19:00:00", weekdays: [1, 3, 5] },
  { trainer_id: milena, starts_at: "08:00:00", weekdays: [6, 2, 4] },
];

describe("fixed class time (D-71)", () => {
  it("names the days, Monday first, then the time", () => {
    expect(classTimeLabel(times[2])).toBe("Uto, čet, sub · 08:00");
    expect(classTimeLabel({ starts_at: "07:30:00", weekdays: [7, 1] })).toBe(
      "Pon, ned · 07:30",
    );
  });
  it("offers only the chosen trainer's times, earliest first", () => {
    expect(classTimesOf(times, milena).map((time) => time.starts_at)).toEqual([
      "08:00:00",
      "18:00:00",
    ]);
    expect(classTimesOf(times, tamara)).toHaveLength(1);
    expect(classTimesOf(times, "someone else")).toEqual([]);
  });
  it("shows a time no longer in the schedule as the clock time alone", () => {
    expect(membershipClassTimeLabel(times, milena, "18:00:00")).toBe(
      "Uto, čet, sub · 18:00",
    );
    expect(membershipClassTimeLabel(times, milena, "20:00:00")).toBe("20:00");
  });
});
