import { describe, expect, it } from "vitest";
import {
  buildRoster,
  type RosterData,
  type RosterMember,
} from "@/features/trainers/roster";

const milena = "11111111-1111-4111-8111-111111111111";
const tamara = "22222222-2222-4222-8222-222222222222";

function member(
  id: string,
  trainerId: string,
  trainerName: string,
  classTime: string | null,
  checkedInAt: string | null = null,
): RosterMember {
  return {
    membership_id: `ms-${id}`,
    trainer_id: trainerId,
    trainer_name: trainerName,
    class_time: classTime,
    member_id: `m-${id}`,
    member_number: Number(id),
    first_name: "Ime",
    last_name: id,
    plan_name: "Grupni",
    paid_on: "2026-09-01",
    end_date: "2026-09-30",
    checked_in_at: checkedInAt,
  };
}

// Tuesday 29.09.2026: Milena teaches at 08:00 and 18:00 on Tue/Thu/Sat, Tamara at 19:00
// on Mon/Wed/Fri.
const data: RosterData = {
  today: "2026-09-29",
  weekday: 2,
  times: [
    {
      trainer_id: tamara,
      trainer_name: "Tamara",
      starts_at: "19:00:00",
      weekdays: [1, 3, 5],
    },
    {
      trainer_id: milena,
      trainer_name: "Milena",
      starts_at: "18:00:00",
      weekdays: [2, 4, 6],
    },
    {
      trainer_id: milena,
      trainer_name: "Milena",
      starts_at: "08:00:00",
      weekdays: [2, 4, 6],
    },
  ],
  members: [
    member("1", milena, "Milena", "08:00:00", "2026-09-29T05:52:00+00:00"),
    member("2", milena, "Milena", "08:00:00"),
    member("3", milena, "Milena", null),
    member("4", milena, "Milena", "20:00:00"),
    member("5", tamara, "Tamara", "19:00:00"),
  ],
  extras: [
    {
      trainer_id: milena,
      trainer_name: "Milena",
      class_time: "08:00:00",
      member_id: "m-9",
      member_number: 9,
      first_name: "Ana",
      last_name: "Van spiska",
      checked_in_at: "2026-09-29T05:58:00+00:00",
      is_unpaid: true,
    },
  ],
};

describe("trainer roster (D-72, BR-027)", () => {
  it("groups by trainer, then by class time, with the unset time last", () => {
    const roster = buildRoster(data);
    expect(roster.map((trainer) => trainer.trainerName)).toEqual([
      "Milena",
      "Tamara",
    ]);
    expect(roster[0].groups.map((group) => group.startsAt)).toEqual([
      "08:00:00",
      "18:00:00",
      "20:00:00",
      null,
    ]);
    expect(roster[0].groups[0].rows.map((row) => row.member_number)).toEqual([
      1, 2,
    ]);
  });

  it("keeps an active time with no members and a time that left the schedule", () => {
    const [milenaRoster] = buildRoster(data);
    expect(milenaRoster.groups[1]).toMatchObject({
      startsAt: "18:00:00",
      rows: [],
      weekdays: [2, 4, 6],
    });
    // 20:00 is no longer in the schedule: no days, so it is shown as the clock time.
    expect(milenaRoster.groups[2]).toMatchObject({
      startsAt: "20:00:00",
      weekdays: [],
      heldToday: false,
    });
  });

  it("counts today's check-ins only for the classes held today", () => {
    const [milenaRoster, tamaraRoster] = buildRoster(data);
    expect(milenaRoster.groups[0]).toMatchObject({
      heldToday: true,
      attended: 1,
    });
    expect(
      milenaRoster.groups[0].extras.map((extra) => extra.member_id),
    ).toEqual(["m-9"]);
    // Tamara's 19:00 is on Mon/Wed/Fri, not on a Tuesday.
    expect(tamaraRoster.groups[0]).toMatchObject({
      heldToday: false,
      attended: 0,
    });
    // Memberships with no time belong to no class.
    expect(milenaRoster.groups[3].heldToday).toBe(false);
  });

  it("treats a time as held today when someone checked in to it", () => {
    const roster = buildRoster({
      ...data,
      members: [
        member("4", milena, "Milena", "20:00:00", "2026-09-29T18:01:00+00:00"),
      ],
    });
    expect(roster[0].groups[2]).toMatchObject({
      startsAt: "20:00:00",
      heldToday: true,
      attended: 1,
    });
  });

  it("gives amounts and a total only when the prices are passed (BR-157)", () => {
    expect(buildRoster(data)[0]).toMatchObject({ total: null });
    expect(buildRoster(data)[0].groups[0].rows[0].amount).toBeNull();

    const prices = new Map([
      ["ms-1", "69.00"],
      ["ms-2", "99.00"],
      ["ms-3", "69.00"],
      ["ms-5", "69.00"],
    ]);
    const [milenaRoster, tamaraRoster] = buildRoster(data, prices);
    expect(milenaRoster.groups[0].rows.map((row) => row.amount)).toEqual([
      "69.00",
      "99.00",
    ]);
    // ms-4 has no amount (a voided payment), so it adds nothing.
    expect(milenaRoster.total).toBe("237.00");
    expect(tamaraRoster.total).toBe("69.00");
  });
});
