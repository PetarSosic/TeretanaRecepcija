import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// D-99: S-05 Novi član takes the gym's fixed part of a Personalni sale. D-100 (BR-056):
// S-07 pauses a membership, [Prekini pauzu] ends it, and a scan on a paused day ends
// it too. Everything lives in this test's own gym, which afterAll removes.
test.describe.configure({ mode: "serial" });

const PASSWORD = "pauzalozinka1";

let gymId: string;
let receptionist: TestStaff;
let owner: TestStaff;
let personalniId: string;
let trainerId: string;
let cards: string[];

/** BR-030 codes, unique across gyms; the 9 prefix keeps them clear of real batches. */
function cardCode(): string {
  return `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
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

/** A yyyy-mm-dd day moved by whole days. */
function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** dd.mm.yyyy, as the screens write a date. */
function shown(day: string): string {
  const [year, month, date] = day.split("-");
  return `${date}.${month}.${year}`;
}

test.beforeAll(async ({}, workerInfo) => {
  gymId = await createTestGym(`${workerInfo.project.name}-pause-${suffix()}`);
  receptionist = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Recepcija pauze",
    password: PASSWORD,
  });
  owner = await createTestStaff(gymId, {
    role: "owner",
    fullName: "E2E Vlasnik pauze",
    password: PASSWORD,
  });

  const admin = adminClient();
  const plan = await must(
    admin
      .from("plans")
      .insert({
        gym_id: gymId,
        name: "E2E Personalni",
        kind: "personal",
        duration_value: 1,
        duration_unit: "month",
        price: null,
        covers_gym: false,
        covers_group: false,
        covers_personal: true,
        requires_trainer: true,
        sort_order: 1,
      })
      .select("id")
      .single<{ id: string }>(),
    "Test plan",
  );
  personalniId = plan.id;
  await must(
    admin
      .from("plan_finance")
      .insert({ plan_id: personalniId, gym_id: gymId })
      .select("plan_id"),
    "Test plan finance",
  );

  const trainer = await must(
    admin
      .from("trainers")
      .insert({ gym_id: gymId, full_name: "E2E Tamara" })
      .select("id")
      .single<{ id: string }>(),
    "Test trainer",
  );
  trainerId = trainer.id;
  await must(
    admin
      .from("trainer_finance")
      .insert({ trainer_id: trainerId, gym_id: gymId, personal_gym_fee: 80 })
      .select("trainer_id"),
    "Test trainer fee",
  );
  const program = await must(
    admin
      .from("programs")
      .insert({
        gym_id: gymId,
        name: "E2E Personalni trening",
        kind: "personal",
      })
      .select("id")
      .single<{ id: string }>(),
    "Test program",
  );
  await must(
    admin
      .from("trainer_programs")
      .insert({ gym_id: gymId, trainer_id: trainerId, program_id: program.id })
      .select("trainer_id"),
    "Test assignment",
  );

  const batch = await must(
    admin
      .from("card_batches")
      .insert({ gym_id: gymId, quantity: 2, created_by: owner.id })
      .select("id")
      .single<{ id: string }>(),
    "Test card batch",
  );
  cards = [cardCode(), cardCode()];
  await must(
    admin
      .from("cards")
      .insert(
        cards.map((code) => ({ gym_id: gymId, code, batch_id: batch.id })),
      )
      .select("id"),
    "Test cards",
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

async function gymToday(): Promise<string> {
  const { data } = await adminClient().rpc("gym_today", { p_gym: gymId });
  return data as string;
}

/** S-05 with Personalni: 10 sessions, €100, and the fixed part given (D-99). */
async function register(
  page: Page,
  card: string,
  name: string,
  phone: string,
  checkIn: boolean,
) {
  await page.goto("/members");
  await page.getByRole("button", { name: "Novi član" }).click();
  const dialog = page.getByRole("dialog");
  const field = dialog.getByLabel("Skenirajte praznu karticu");
  await field.fill(card);
  await field.press("Enter");
  await expect(dialog.getByText("Kartica je prazna i spremna.")).toBeVisible({
    timeout: 20_000,
  });
  await dialog.getByLabel("Ime", { exact: true }).fill(name);
  await dialog.getByLabel("Prezime").fill("Pauza");
  await dialog.getByLabel("Telefon").fill(phone);
  await dialog
    .getByLabel("Email")
    .fill(`${phone.replace(/\D/g, "")}@e2e.invalid`);
  await dialog.getByLabel("Datum rođenja", { exact: true }).fill("05.03.1995");
  await dialog.getByLabel("Vrsta članarine").selectOption(personalniId);
  await dialog.getByLabel("Trener").selectOption(trainerId);
  await dialog.getByLabel("Broj termina").fill("10");
  await dialog.getByLabel("Iznos (€)").fill("100");
  if (!checkIn) await dialog.getByLabel("Prijavi odmah").uncheck();
  await dialog.getByText("Gotovina", { exact: true }).click();
  return dialog;
}

test("D-99: Novi član with Personalni takes the gym's fixed part", async ({
  page,
}) => {
  await signIn(page, receptionist);
  const dialog = await register(
    page,
    cards[0],
    "E2E Ana",
    "067 310 001",
    false,
  );
  await expect(dialog.getByLabel("Fiksni dio za teretanu (€)")).toHaveValue("");
  await expect(
    dialog.getByText("Ako ostane prazno, važi naknada trenera iz podešavanja."),
  ).toBeVisible();

  // More than the amount is refused under the field, and nothing is saved.
  await dialog.getByLabel("Fiksni dio za teretanu (€)").fill("150");
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(
    dialog.getByText(
      "Fiksni dio za teretanu mora biti između 0 i iznosa članarine.",
    ),
  ).toBeVisible();

  await dialog.getByLabel("Fiksni dio za teretanu (€)").fill("30");
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(dialog.getByText(/Član #1 je kreiran\./)).toBeVisible({
    timeout: 15_000,
  });

  const { data } = await adminClient()
    .from("membership_finance")
    .select("personal_gym_fee::text")
    .eq("gym_id", gymId)
    .single<{ personal_gym_fee: string }>();
  expect(data?.personal_gym_fee).toBe("30.00");
});

test("D-100: S-07 pauses a membership and [Prekini pauzu] gives the days back", async ({
  page,
}) => {
  const admin = adminClient();
  const { data: membership } = await admin
    .from("memberships")
    .select("id, member_id, end_date")
    .eq("gym_id", gymId)
    .single<{ id: string; member_id: string; end_date: string }>();
  const today = await gymToday();
  const from = addDays(today, 1);

  await signIn(page, receptionist);
  await page.goto(`/members/${membership!.member_id}`);
  await page.getByRole("button", { name: "Pauziraj E2E Personalni" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("Preostalo za pauzu: 7 od 7 dana."),
  ).toBeVisible();
  await dialog.getByLabel("Od").fill(from);
  await dialog.getByLabel("Broj dana").fill("3");
  await expect(
    dialog.getByText(
      `Važi do će biti ${shown(addDays(membership!.end_date, 3))}.`,
    ),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Članarina je pauzirana.").first()).toBeVisible();

  const row = page.locator("tr", { hasText: "E2E Personalni" });
  await expect(row).toContainText(shown(addDays(membership!.end_date, 3)));
  await expect(row).toContainText(
    `Pauza ${shown(from)}–${shown(addDays(from, 2))}`,
  );

  await row
    .getByRole("button", { name: "Prekini pauzu E2E Personalni" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Prekini pauzu" })
    .click();
  await expect(page.getByText("Pauza je prekinuta.").first()).toBeVisible();
  await expect(row).toContainText(shown(membership!.end_date));
  const { data: after } = await admin
    .from("memberships")
    .select("end_date")
    .eq("id", membership!.id)
    .single<{ end_date: string }>();
  expect(after?.end_date).toBe(membership!.end_date);
});

test("D-100: a scan on a paused day ends the pause", async ({ page }) => {
  await signIn(page, receptionist);
  const dialog = await register(page, cards[1], "E2E Bo", "067 310 002", false);
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(dialog.getByText(/Član #2 je kreiran\./)).toBeVisible({
    timeout: 15_000,
  });

  // A pause of 3 days from today, as pause_membership would leave it.
  const admin = adminClient();
  const today = await gymToday();
  const { data: membership } = await admin
    .from("memberships")
    .select("id, end_date, members!inner(first_name)")
    .eq("gym_id", gymId)
    .eq("members.first_name", "E2E Bo")
    .single<{ id: string; end_date: string }>();
  await must(
    admin
      .from("memberships")
      .update({ end_date: addDays(membership!.end_date, 3) })
      .eq("id", membership!.id)
      .select("id"),
    "Test pause end date",
  );
  await must(
    admin
      .from("membership_pauses")
      .insert({
        gym_id: gymId,
        membership_id: membership!.id,
        paused_from: today,
        paused_until: addDays(today, 2),
        created_by: owner.id,
      })
      .select("id"),
    "Test pause",
  );

  await page.goto("/reception");
  await page
    .getByRole("button", { name: "Počni rad" })
    .click({ timeout: 3_000 })
    .catch(() => {});
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await page.keyboard.type(cards[1]);
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Pauza članarine je završena jer je član došao.").first(),
  ).toBeVisible({ timeout: 15_000 });

  // Personalni asks for the visit type (S-03a); the pause is already over by then.
  await page.keyboard.press("Escape");
  const { data: pause } = await admin
    .from("membership_pauses")
    .select("paused_until, ended_early")
    .eq("membership_id", membership!.id)
    .single<{ paused_until: string; ended_early: boolean }>();
  expect(pause).toEqual({
    paused_until: addDays(today, -1),
    ended_early: true,
  });
  const { data: after } = await admin
    .from("memberships")
    .select("end_date")
    .eq("id", membership!.id)
    .single<{ end_date: string }>();
  expect(after?.end_date).toBe(membership!.end_date);
});
