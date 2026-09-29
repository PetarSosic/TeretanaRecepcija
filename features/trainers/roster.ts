import { sumMoney } from "@/lib/format";

/** BR-027: one of a trainer's active group class times, as trainer_roster() returns it. */
export type RosterTime = {
  trainer_id: string;
  trainer_name: string;
  /** As Postgres returns a time: "08:00:00". */
  starts_at: string;
  /** ISO, 1 = Monday. */
  weekdays: number[];
};

/** BR-027: a group membership valid today. */
export type RosterMember = {
  membership_id: string;
  trainer_id: string;
  trainer_name: string;
  /** Null for a membership sold before D-71. */
  class_time: string | null;
  member_id: string;
  member_number: number;
  first_name: string;
  last_name: string;
  plan_name: string;
  paid_on: string | null;
  end_date: string;
  /** The first group check-in today to a slot of this trainer at this time. */
  checked_in_at: string | null;
};

/** BR-027: a check-in today to a class by a member who is not on its list. */
export type RosterExtra = {
  trainer_id: string;
  trainer_name: string;
  class_time: string;
  member_id: string;
  member_number: number;
  first_name: string;
  last_name: string;
  checked_in_at: string;
  is_unpaid: boolean;
};

export type RosterData = {
  today: string;
  /** Today's ISO weekday in the gym (BR-001). */
  weekday: number;
  times: RosterTime[];
  members: RosterMember[];
  extras: RosterExtra[];
};

export type RosterRow = RosterMember & {
  /** BR-157: the owner's and admin's only; null for everyone else. */
  amount: string | null;
};

export type RosterGroup = {
  key: string;
  /** Null groups the memberships with no fixed class time ("Termin nije upisan"). */
  startsAt: string | null;
  /** Empty for a time no longer in the schedule, which is shown as the clock time. */
  weekdays: number[];
  heldToday: boolean;
  rows: RosterRow[];
  extras: RosterExtra[];
  /** The members on the list who checked in today. */
  attended: number;
};

export type RosterTrainer = {
  trainerId: string;
  trainerName: string;
  groups: RosterGroup[];
  /** BR-027: the sum of the amounts, when they were given (owner and admin). */
  total: string | null;
};

/**
 * BR-027: the roster by trainer, then by fixed class time. Every active time is kept,
 * even with no members; a time that left the schedule keeps its members; the
 * memberships with no time come last. `prices` maps membership ids to their amounts and
 * is passed only for the owner and admin.
 */
export function buildRoster(
  data: RosterData,
  prices?: ReadonlyMap<string, string>,
): RosterTrainer[] {
  const trainers = new Map<
    string,
    { name: string; groups: Map<string, RosterGroup> }
  >();

  const groupFor = (
    trainerId: string,
    trainerName: string,
    startsAt: string | null,
  ) => {
    const trainer = trainers.get(trainerId) ?? {
      name: trainerName,
      groups: new Map<string, RosterGroup>(),
    };
    trainers.set(trainerId, trainer);
    const key = `${trainerId}|${startsAt ?? ""}`;
    const group = trainer.groups.get(key) ?? {
      key,
      startsAt,
      weekdays: [],
      heldToday: false,
      rows: [],
      extras: [],
      attended: 0,
    };
    trainer.groups.set(key, group);
    return group;
  };

  for (const time of data.times) {
    groupFor(time.trainer_id, time.trainer_name, time.starts_at).weekdays = [
      ...time.weekdays,
    ];
  }
  for (const member of data.members) {
    groupFor(
      member.trainer_id,
      member.trainer_name,
      member.class_time,
    ).rows.push({
      ...member,
      amount: prices?.get(member.membership_id) ?? null,
    });
  }
  for (const extra of data.extras) {
    groupFor(
      extra.trainer_id,
      extra.trainer_name,
      extra.class_time,
    ).extras.push(extra);
  }

  return [...trainers.entries()]
    .map(([trainerId, trainer]) => {
      const groups = [...trainer.groups.values()]
        .map((group) => {
          const attended = group.rows.filter((row) => row.checked_in_at).length;
          return {
            ...group,
            attended,
            // A time with no day of its own in the schedule is still held today when
            // someone checked in to it.
            heldToday:
              group.startsAt !== null &&
              (group.weekdays.includes(data.weekday) ||
                attended > 0 ||
                group.extras.length > 0),
          };
        })
        .sort((a, b) =>
          a.startsAt === null
            ? 1
            : b.startsAt === null
              ? -1
              : a.startsAt.localeCompare(b.startsAt),
        );
      const rows = groups.flatMap((group) => group.rows);
      return {
        trainerId,
        trainerName: trainer.name,
        groups,
        total: prices
          ? sumMoney(rows.flatMap((row) => (row.amount ? [row.amount] : [])))
          : null,
      };
    })
    .sort(
      (a, b) =>
        a.trainerName.localeCompare(b.trainerName, "sr-Latn") ||
        a.trainerId.localeCompare(b.trainerId),
    );
}
