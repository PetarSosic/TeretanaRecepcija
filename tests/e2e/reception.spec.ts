import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// M-07 "done when" (doc 09): E2E flows 2, 3 and 4 of doc 08 §10.
//   2. scan an unassigned card → register → auto check-in → scan again → check-out;
//   3. expired member → yellow, then red, dialog → renew → start date per E3;
//   4. G+T group visit with trainer and slot.
test.describe.configure({ mode: "serial" });

const PASSWORD = "recepcijalozinka1";
const ZONE = "Europe/Podgorica";

let gymId: string;
let receptionist: TestStaff;
let mjesecnaId: string;
let slotTime: string;
const codes = { empty: "", expired: "", combo: "" };
const members = { expired: "", combo: "" };

function cardCode(): string {
  return `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
}

/** The gym's local date, weekday (ISO) and HH:mm right now (BR-001). */
function gymNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map(({ type, value }) => [type, value]),
  );
  const weekday =
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday) +
    1;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    display: `${parts.day}.${parts.month}.${parts.year}`,
    weekday,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function shiftDate(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function must<T>(
  query: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  what: string,
): Promise<T> {
  const { data, error } = await query;
  if (error || data === null)
    throw new Error(`${what} not created: ${error?.message}`);
  return data;
}

test.beforeAll(async ({}, workerInfo) => {
  gymId = await createTestGym(
    `${workerInfo.project.name}-reception-${suffix()}`,
  );
  receptionist = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Recepcija",
    password: PASSWORD,
  });
  const admin = adminClient();
  const now = gymNow();

  const plans = await must(
    admin
      .from("plans")
      .insert([
        {
          gym_id: gymId,
          name: "E2E Mjesečna",
          kind: "gym",
          duration_value: 1,
          duration_unit: "month",
          price: 79,
          covers_gym: true,
          covers_group: false,
          covers_personal: false,
          group_session_limit: null,
          requires_trainer: false,
          sort_order: 1,
        },
        {
          gym_id: gymId,
          name: "E2E G+T",
          kind: "combo",
          duration_value: 1,
          duration_unit: "month",
          price: 99,
          covers_gym: true,
          covers_group: true,
          covers_personal: false,
          group_session_limit: 12,
          requires_trainer: true,
          sort_order: 2,
        },
      ])
      .select("id, name")
      .returns<{ id: string; name: string }[]>(),
    "Test plans",
  );
  mjesecnaId = plans.find((plan) => plan.name === "E2E Mjesečna")!.id;
  const comboId = plans.find((plan) => plan.name === "E2E G+T")!.id;
  await must(
    admin
      .from("plan_finance")
      .insert(plans.map((plan) => ({ plan_id: plan.id, gym_id: gymId })))
      .select("plan_id"),
    "Test plan finance",
  );

  // BR-021/022: Milena on the group program, with a class starting right now (BR-075).
  const trainer = await must(
    admin
      .from("trainers")
      .insert({ gym_id: gymId, full_name: "E2E Milena" })
      .select("id")
      .single<{ id: string }>(),
    "Test trainer",
  );
  await must(
    admin
      .from("trainer_finance")
      .insert({ trainer_id: trainer.id, gym_id: gymId })
      .select("trainer_id"),
    "Test trainer finance",
  );
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
      .insert({ gym_id: gymId, trainer_id: trainer.id, program_id: program.id })
      .select("trainer_id"),
    "Test assignment",
  );
  slotTime = now.time;
  await must(
    admin
      .from("class_slots")
      .insert({
        gym_id: gymId,
        program_id: program.id,
        trainer_id: trainer.id,
        weekday: now.weekday,
        starts_at: `${now.time}:00`,
      })
      .select("id"),
    "Test class slot",
  );

  // Two members: one whose Mjesečna ended three days ago, one holding a G+T.
  const created = await must(
    admin
      .from("members")
      .insert([
        {
          gym_id: gymId,
          member_number: 101,
          first_name: "E2E Istekla",
          last_name: "Članarina",
          phone: "+38267100101",
          email: "istekla@e2e.invalid",
          date_of_birth: "1990-01-01",
          created_by: receptionist.id,
        },
        {
          gym_id: gymId,
          member_number: 102,
          first_name: "E2E Grupna",
          last_name: "Članica",
          phone: "+38267100102",
          email: "grupna@e2e.invalid",
          date_of_birth: "1990-01-01",
          created_by: receptionist.id,
        },
      ])
      .select("id, member_number")
      .returns<{ id: string; member_number: number }[]>(),
    "Test members",
  );
  members.expired = created.find((m) => m.member_number === 101)!.id;
  members.combo = created.find((m) => m.member_number === 102)!.id;
  await must(
    admin
      .from("member_counters")
      .insert({ gym_id: gymId, last_number: 102 })
      .select("gym_id"),
    "Test member counter",
  );
  // Back-dated fixtures (BR-120): no shift, like the owner's catch-up entries.
  await must(
    admin
      .from("memberships")
      .insert([
        {
          gym_id: gymId,
          member_id: members.expired,
          plan_id: mjesecnaId,
          start_date: shiftDate(now.date, -33),
          end_date: shiftDate(now.date, -3),
          start_reason: "E2E",
          covers_gym: true,
          covers_group: false,
          covers_personal: false,
          is_backdated: true,
          created_by: receptionist.id,
        },
        {
          gym_id: gymId,
          member_id: members.combo,
          plan_id: comboId,
          trainer_id: trainer.id,
          start_date: shiftDate(now.date, -5),
          end_date: shiftDate(now.date, 25),
          start_reason: "E2E",
          covers_gym: true,
          covers_group: true,
          covers_personal: false,
          group_session_limit: 12,
          is_backdated: true,
          created_by: receptionist.id,
        },
      ])
      .select("id"),
    "Test memberships",
  );

  const batch = await must(
    admin
      .from("card_batches")
      .insert({ gym_id: gymId, quantity: 3, created_by: receptionist.id })
      .select("id")
      .single<{ id: string }>(),
    "Test card batch",
  );
  codes.empty = cardCode();
  codes.expired = cardCode();
  codes.combo = cardCode();
  await must(
    admin
      .from("cards")
      .insert([
        {
          gym_id: gymId,
          code: codes.empty,
          batch_id: batch.id,
          // A bulk insert fills missing keys with null, so every key is given.
          status: "unassigned",
          member_id: null,
          assigned_at: null,
        },
        {
          gym_id: gymId,
          code: codes.expired,
          batch_id: batch.id,
          status: "active",
          member_id: members.expired,
          assigned_at: new Date().toISOString(),
        },
        {
          gym_id: gymId,
          code: codes.combo,
          batch_id: batch.id,
          status: "active",
          member_id: members.combo,
          assigned_at: new Date().toISOString(),
        },
      ])
      .select("id"),
    "Test cards",
  );
});

test.afterAll(async () => {
  await deleteTestGym(gymId);
});

/** Signs in and passes the S-03 audio overlay, which a new browser session shows. */
async function openReception(page: Page) {
  await page.goto("/login");
  await page
    .getByLabel("Korisničko ime ili email")
    .fill(receptionist.identifier);
  await page.getByLabel("Lozinka", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await page.waitForURL(/\/reception/);
  await page.getByRole("button", { name: "Počni rad" }).click();
  await expect(
    page.getByRole("heading", { name: "Skenirajte karticu" }),
  ).toBeVisible();
}

/** The USB scanner: ten digits and Enter, typed while no field has focus. */
async function scan(page: Page, code: string) {
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await page.keyboard.type(code);
  await page.keyboard.press("Enter");
}

test("BR-070: invalid and unknown cards are reported in the status area", async ({
  page,
}) => {
  await openReception(page);
  await scan(page, "12345");
  await expect(
    page.getByRole("status").getByText("Neispravan kod kartice."),
  ).toBeVisible({
    timeout: 20_000,
  });
  await scan(page, "9000000001");
  await expect(
    page.getByRole("status").getByText("Nepoznata kartica."),
  ).toBeVisible();
  await expect(
    page.getByText("Trenutno nema nikoga u teretani."),
  ).toBeVisible();
  // Doc 08 §9: no horizontal scrolling, at 375 px included.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("Flow 2: an empty card registers, checks in, and the next scan checks out", async ({
  page,
}) => {
  await openReception(page);
  await scan(page, codes.empty);

  // BR-070: the unassigned card opens S-05 with the card attached and read-only.
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Novi član" }),
  ).toBeVisible();
  await expect(dialog.getByText(codes.empty)).toBeVisible();
  await dialog.getByLabel("Ime", { exact: true }).fill("E2E Nova");
  await dialog.getByLabel("Prezime").fill("Članica");
  await dialog.getByLabel("Telefon").fill("069 111 222");
  await dialog.getByLabel("Email").fill("nova@e2e.invalid");
  await dialog.getByLabel("Datum rođenja", { exact: true }).fill("01.02.2000");
  await dialog.getByLabel("Vrsta članarine").selectOption(mjesecnaId);
  await expect(dialog.getByLabel("Prijavi odmah")).toBeChecked();
  await dialog.getByText("Gotovina", { exact: true }).click();
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(dialog.getByText(/^Član #103 je kreiran\./)).toBeVisible({
    // Registration writes member, card, membership, payment and visit in one
    // transaction, after the preview; allow for a slow network.
    timeout: 15_000,
  });
  await dialog.getByRole("button", { name: "Zatvori" }).first().click();

  // S-03b: covered, green, with the membership.
  const result = page.locator("[data-result=covered]");
  await expect(result).toBeVisible();
  await expect(result.getByText("E2E Mjesečna")).toBeVisible();
  await expect(result.getByText("Neograničeno")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByText(/^U teretani: 1 · Danas dolazaka: 1$/),
  ).toBeVisible();

  // BR-072: the next scan checks out, after S-03e because it is within 120 s.
  await scan(page, codes.empty);
  await expect(
    page.getByText(
      /^E2E Nova Članica je prijavljen\/a prije \d+ s\. Odjaviti\?$/,
    ),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Odjavi" })
    .click();
  await expect(
    page.getByText(/^Odjavljen\/a: E2E Nova Članica – 0h 0min$/),
  ).toBeVisible();
  await expect(
    page.getByText("Trenutno nema nikoga u teretani."),
  ).toBeVisible();
});

test("Flow 3 and E3: yellow, then red, then the renewal covers both visits", async ({
  page,
}) => {
  await openReception(page);

  // N = 1: the yellow dialog, which does not close by itself.
  await scan(page, codes.expired);
  await expect(page.locator("[data-result=yellow]")).toBeVisible();
  await expect(
    page.getByText("Članarina nije važeća – neplaćeni dolazak."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Zatvori" }).first().click();

  // BR-080: [Odjavi] in "U teretani".
  await page
    .getByRole("button", { name: "Odjavi E2E Istekla Članarina" })
    .click();
  await expect(
    page.getByText("Trenutno nema nikoga u teretani."),
  ).toBeVisible();

  // N = 2: the full-screen red dialog.
  await scan(page, codes.expired);
  await expect(page.locator("[data-result=red]")).toBeVisible();
  await expect(page.getByText("PAŽNJA: 2. neplaćeni dolazak!")).toBeVisible();

  // US-04.4 AC2: [Produži članarinu] opens S-08; BR-052 step 2 starts it at the first
  // unpaid visit.
  await page.getByRole("button", { name: "Produži članarinu" }).click();
  const sell = page.getByRole("dialog");
  await sell.getByLabel("Vrsta članarine").selectOption(mjesecnaId);
  await expect(
    sell.getByText(`Počinje od prvog neplaćenog dolaska ${gymNow().display}`),
  ).toBeVisible();
  await sell.getByText("Gotovina", { exact: true }).click();
  await sell.getByRole("button", { name: "Naplati i sačuvaj" }).click();
  await expect(page.getByText("Članarina sačuvana.")).toBeVisible();

  const admin = adminClient();
  const { data: renewal } = await admin
    .from("memberships")
    .select("id, start_date")
    .eq("member_id", members.expired)
    .eq("is_backdated", false)
    .single<{ id: string; start_date: string }>();
  expect(renewal?.start_date).toBe(gymNow().date);
  const { data: visits } = await admin
    .from("visits")
    .select("membership_id, is_unpaid")
    .eq("member_id", members.expired)
    .returns<{ membership_id: string | null; is_unpaid: boolean }[]>();
  expect(visits).toHaveLength(2);
  for (const visit of visits ?? [])
    expect(visit).toEqual({ membership_id: renewal?.id, is_unpaid: true });
});

test("Flow 4: a G+T group visit with its trainer and the class starting now", async ({
  page,
}) => {
  await openReception(page);
  await scan(page, codes.combo);

  // S-03a: Teretana preselected (the G+T covers the gym), Grupni offered (BR-073).
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: /^Prijava: E2E Grupna Članica$/ }),
  ).toBeVisible();
  await expect(dialog.getByLabel("Teretana")).toBeChecked();
  await dialog.getByText("Grupni", { exact: true }).click();
  // BR-075: the membership's trainer and the class within ±90 minutes.
  await expect(dialog.getByLabel("Trener")).toHaveValue(/.+/);
  await expect(
    dialog.getByLabel("Trener").locator("option:checked"),
  ).toHaveText("E2E Milena");
  await expect(dialog.getByLabel("Čas").locator("option:checked")).toHaveText(
    `Čas: ${slotTime}`,
  );
  await dialog.getByRole("button", { name: "Prijavi" }).click();

  const result = page.locator("[data-result=covered]");
  await expect(result).toBeVisible();
  await expect(result.getByText("Grupni: 11 preostalo")).toBeVisible();

  const { data: visit } = await adminClient()
    .from("visits")
    .select("visit_type, trainer_id, class_slot_id, is_unpaid")
    .eq("member_id", members.combo)
    .single<{
      visit_type: string;
      trainer_id: string | null;
      class_slot_id: string | null;
      is_unpaid: boolean;
    }>();
  expect(visit?.visit_type).toBe("group");
  expect(visit?.trainer_id).not.toBeNull();
  expect(visit?.class_slot_id).not.toBeNull();
  expect(visit?.is_unpaid).toBe(false);
});
