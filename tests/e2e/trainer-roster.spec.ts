import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// D-72 (BR-027): S-29 Treneri shows every role who is assigned to which trainer and
// fixed class time, who of them checked in to today's class, and who checked in to it
// without being on its list. Only the owner and the admin see the amounts (BR-157).
test.describe.configure({ mode: "serial" });

const PASSWORD = "trenerilozinka1";
const DAYS = ["pon", "uto", "sri", "čet", "pet", "sub", "ned"];

let gymId: string;
let receptionist: TestStaff;
let owner: TestStaff;
let today: string;
let weekday: number;

async function must<T>(
  query: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  what: string,
): Promise<T> {
  const { data, error } = await query;
  if (error || data === null)
    throw new Error(`${what} not created: ${error?.message}`);
  return data;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** ISO weekday `shift` days after today (1 = Monday). */
function dayAfter(shift: number) {
  return ((weekday - 1 + shift) % 7) + 1;
}

/** As classTimeLabel shows it: "Uto, čet · 08:00". */
function label(days: number[], clock: string) {
  const text = [...days]
    .sort((a, b) => a - b)
    .map((day) => DAYS[day - 1])
    .join(", ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} · ${clock}`;
}

test.beforeAll(async ({}, workerInfo) => {
  gymId = await createTestGym(`${workerInfo.project.name}-treneri-${suffix()}`);
  receptionist = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Recepcija trenera",
    password: PASSWORD,
  });
  owner = await createTestStaff(gymId, {
    role: "owner",
    fullName: "E2E Vlasnik trenera",
    password: PASSWORD,
  });

  const admin = adminClient();
  // BR-001: the fixtures are laid out around the gym's today, never the runner's.
  today = await must<string>(
    admin.rpc("gym_today", { p_gym: gymId }),
    "Gym today",
  );
  const utcDay = new Date(`${today}T12:00:00Z`).getUTCDay();
  weekday = utcDay === 0 ? 7 : utcDay;

  const trainers = await must(
    admin
      .from("trainers")
      .insert(
        ["E2E Milena", "E2E Tamara"].map((full_name) => ({
          gym_id: gymId,
          full_name,
        })),
      )
      .select("id, full_name")
      .returns<{ id: string; full_name: string }[]>(),
    "Test trainers",
  );
  const milena = trainers.find((t) => t.full_name === "E2E Milena")!.id;
  const tamara = trainers.find((t) => t.full_name === "E2E Tamara")!.id;

  const program = await must(
    admin
      .from("programs")
      .insert({ gym_id: gymId, name: "E2E Grupni trening", kind: "group" })
      .select("id")
      .single<{ id: string }>(),
    "Test program",
  );
  await must(
    admin
      .from("trainer_programs")
      .insert(
        [milena, tamara].map((trainer_id) => ({
          gym_id: gymId,
          trainer_id,
          program_id: program.id,
        })),
      )
      .select("trainer_id"),
    "Test assignments",
  );
  // Milena at 08:00 today and two days later; Tamara at 19:00 tomorrow only.
  const slots = await must(
    admin
      .from("class_slots")
      .insert(
        [
          [milena, dayAfter(0), "08:00"],
          [milena, dayAfter(2), "08:00"],
          [tamara, dayAfter(1), "19:00"],
        ].map(([trainer_id, day, starts_at]) => ({
          gym_id: gymId,
          program_id: program.id,
          trainer_id,
          weekday: day,
          starts_at,
          is_active: true,
        })),
      )
      .select("id, trainer_id, weekday")
      .returns<{ id: string; trainer_id: string; weekday: number }[]>(),
    "Test class slots",
  );
  const todaySlot = slots.find(
    (slot) => slot.trainer_id === milena && slot.weekday === weekday,
  )!.id;

  const base = {
    gym_id: gymId,
    duration_value: 1,
    duration_unit: "month",
    covers_personal: false,
    group_session_limit: 12,
    requires_trainer: true,
    covers_group: true,
  };
  const plans = await must(
    admin
      .from("plans")
      .insert([
        {
          ...base,
          name: "E2E Grupni",
          kind: "group",
          price: 69,
          covers_gym: false,
          sort_order: 1,
        },
        {
          ...base,
          name: "E2E G+T",
          kind: "combo",
          price: 99,
          covers_gym: true,
          sort_order: 2,
        },
      ])
      .select("id, name")
      .returns<{ id: string; name: string }[]>(),
    "Test plans",
  );
  const grupni = plans.find((plan) => plan.name === "E2E Grupni")!.id;
  const combo = plans.find((plan) => plan.name === "E2E G+T")!.id;

  const members = await must(
    admin
      .from("members")
      .insert(
        [
          ["Ena", "Lista"],
          ["Iva", "Lista"],
          ["Stari", "Termin"],
          ["Van", "Spiska"],
          ["Tea", "Tamarina"],
        ].map(([first_name, last_name], index) => ({
          gym_id: gymId,
          member_number: index + 1,
          first_name,
          last_name,
          phone: `+3826755500${index + 1}`,
          email: `trener${index + 1}@e2e.invalid`,
          date_of_birth: "1995-03-05",
          created_by: owner.id,
        })),
      )
      .select("id, member_number")
      .returns<{ id: string; member_number: number }[]>(),
    "Test members",
  );
  const member = (number: number) =>
    members.find((row) => row.member_number === number)!.id;

  // 1 Grupni and 2 G+T with Milena at 08:00, 3 with Milena and no time (before D-71),
  // 5 Grupni with Tamara at 19:00. Member 4 holds nothing.
  const sales: [number, string, string, string | null, number][] = [
    [1, grupni, milena, "08:00", 69],
    [2, combo, milena, "08:00", 99],
    [3, grupni, milena, null, 69],
    [5, grupni, tamara, "19:00", 69],
  ];
  const memberships = await must(
    admin
      .from("memberships")
      .insert(
        sales.map(([number, plan_id, trainer_id, class_time]) => ({
          gym_id: gymId,
          member_id: member(number),
          plan_id,
          trainer_id,
          class_time,
          start_date: addDays(today, -3),
          end_date: addDays(today, 27),
          start_reason: "E2E",
          covers_gym: plan_id === combo,
          covers_group: true,
          covers_personal: false,
          group_session_limit: 12,
          is_backdated: true,
          created_by: owner.id,
        })),
      )
      .select("id, member_id")
      .returns<{ id: string; member_id: string }[]>(),
    "Test memberships",
  );
  await must(
    admin
      .from("payments")
      .insert(
        sales.map(([number, plan_id, , , amount]) => ({
          gym_id: gymId,
          kind: "membership",
          membership_id: memberships.find(
            (row) => row.member_id === member(number),
          )!.id,
          member_id: member(number),
          plan_id,
          amount,
          method: "cash",
          paid_on: addDays(today, -3),
          is_backdated: true,
          created_by: owner.id,
        })),
      )
      .select("id"),
    "Test payments",
  );

  // Today: 1 came to Milena's 08:00; 4 came to it unpaid, without being on the list.
  await must(
    admin
      .from("visits")
      .insert([
        {
          gym_id: gymId,
          member_id: member(1),
          membership_id: memberships.find((row) => row.member_id === member(1))!
            .id,
          visit_type: "group",
          trainer_id: milena,
          class_slot_id: todaySlot,
          is_unpaid: false,
          checked_in_by: receptionist.id,
        },
        {
          gym_id: gymId,
          member_id: member(4),
          membership_id: null,
          visit_type: "group",
          trainer_id: milena,
          class_slot_id: todaySlot,
          is_unpaid: true,
          checked_in_by: receptionist.id,
        },
      ])
      .select("id"),
    "Test visits",
  );
});

test.afterAll(async () => {
  await deleteTestGym(gymId);
});

async function signIn(page: Page, staff: TestStaff) {
  await page.goto("/login");
  await page.getByLabel("Korisničko ime ili email").fill(staff.identifier);
  await page.getByLabel("Lozinka", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("D-72: reception sees each trainer's classes, today's check-ins and who is not on the list", async ({
  page,
}, testInfo) => {
  await signIn(page, receptionist);
  if (testInfo.project.name === "desktop") {
    await page
      .getByRole("navigation", { name: "Meni" })
      .getByRole("link", { name: "Treneri", exact: true })
      .click();
    await expect(page).toHaveURL(/\/trainers$/);
  } else {
    await page.goto("/trainers");
  }
  await expect(page.getByRole("heading", { name: "Treneri" })).toBeVisible();

  const milena = page.getByRole("region", { name: "E2E Milena" });
  await expect(milena).toContainText(
    `${label([dayAfter(0), dayAfter(2)], "08:00")} · Članova: 2 · Došlo danas: 1 / 2`,
  );
  // D-78: the class time is the bold part of its header row.
  await expect(
    milena.getByText(label([dayAfter(0), dayAfter(2)], "08:00"), {
      exact: true,
    }),
  ).toHaveCSS("font-weight", "700");
  await expect(milena.getByRole("row", { name: /#1 Ena Lista/ })).toContainText(
    /E2E Grupni.*\d{2}:\d{2}/,
  );
  await expect(milena.getByRole("row", { name: /#2 Iva Lista/ })).toContainText(
    "—",
  );
  await expect(milena).toContainText("Prijavljeni na čas, a nisu na spisku:");
  await expect(milena).toContainText(
    /#4 Van Spiska \(\d{2}:\d{2}, neplaćen dolazak\)/,
  );
  // BR-027: the memberships sold before D-71 come last, without "today".
  await expect(milena).toContainText("Termin nije upisan · Članova: 1");

  // Tamara's 19:00 is not held today: no count of arrivals.
  const tamara = page.getByRole("region", { name: "E2E Tamara" });
  await expect(tamara).toContainText(
    `${label([dayAfter(1)], "19:00")} · Članova: 1`,
  );
  await expect(tamara).not.toContainText("Došlo danas");

  // BR-157: no amount reaches reception.
  await expect(page.getByText("Cijena po članu (€)")).toHaveCount(0);
  await expect(page.getByText(/UKUPNO/)).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("69,00");
});

test("D-72: the owner also sees each price and the trainer's total", async ({
  page,
}) => {
  await signIn(page, owner);
  await page.goto("/trainers");
  const milena = page.getByRole("region", { name: "E2E Milena" });
  await expect(
    milena.getByRole("columnheader", { name: "Cijena po članu (€)" }),
  ).toBeVisible();
  await expect(milena.getByRole("row", { name: /#2 Iva Lista/ })).toContainText(
    "99,00 €",
  );
  // 69 + 99 + 69: every listed membership, the one with no time included.
  await expect(milena).toContainText("UKUPNO – E2E Milena");
  await expect(milena).toContainText("237,00 €");
  await expect(page.getByRole("region", { name: "E2E Tamara" })).toContainText(
    "69,00 €",
  );
});

test("D-77: the schedule on Treneri i raspored can show one trainer's classes", async ({
  page,
}) => {
  await signIn(page, owner);
  await page.goto("/settings/trainers");
  const schedule = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Raspored", exact: true }),
  });
  const rows = schedule.locator("tbody tr");
  await expect(rows).toHaveCount(3);
  const filter = schedule.getByLabel("Trener", { exact: true });
  // Only trainers with a class in the schedule, by name.
  await expect(filter.locator("option")).toHaveText([
    "Svi treneri",
    "E2E Milena",
    "E2E Tamara",
  ]);

  await filter.selectOption({ label: "E2E Tamara" });
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("19:00");
  await expect(rows.first()).toContainText("E2E Tamara");

  await filter.selectOption({ label: "E2E Milena" });
  await expect(rows).toHaveCount(2);
  for (const row of await rows.all())
    await expect(row).toContainText("E2E Milena");

  await filter.selectOption({ label: "Svi treneri" });
  await expect(rows).toHaveCount(3);
});
