import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// D-71 (BR-058a): a Grupni or G+T sale records the member's fixed class time, chosen
// from the selected trainer's active times only; a trainer with none cannot be sold;
// and the time can be changed later on S-07 without a new sale.
test.describe.configure({ mode: "serial" });

const PASSWORD = "terminilozinka1";
const MILENA_0800 = "Uto, čet, sub · 08:00";
const MILENA_1800 = "Uto, čet, sub · 18:00";
const TAMARA_1900 = "Pon, sri, pet · 19:00";

let gymId: string;
let receptionist: TestStaff;
let owner: TestStaff;
const trainer = { milena: "", tamara: "", julija: "" };
let grupniId: string;
let mjesecnaId: string;
let card: string;
let memberId: string;

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
  gymId = await createTestGym(`${workerInfo.project.name}-termin-${suffix()}`);
  receptionist = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Recepcija termina",
    password: PASSWORD,
  });
  owner = await createTestStaff(gymId, {
    role: "owner",
    fullName: "E2E Vlasnik termina",
    password: PASSWORD,
  });

  const admin = adminClient();
  const trainers = await must(
    admin
      .from("trainers")
      .insert(
        ["E2E Milena", "E2E Tamara", "E2E Julija"].map((full_name) => ({
          gym_id: gymId,
          full_name,
        })),
      )
      .select("id, full_name")
      .returns<{ id: string; full_name: string }[]>(),
    "Test trainers",
  );
  const id = (name: string) => trainers.find((t) => t.full_name === name)!.id;
  trainer.milena = id("E2E Milena");
  trainer.tamara = id("E2E Tamara");
  trainer.julija = id("E2E Julija");

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
        Object.values(trainer).map((trainer_id) => ({
          gym_id: gymId,
          trainer_id,
          program_id: program.id,
        })),
      )
      .select("trainer_id"),
    "Test assignments",
  );
  // BR-022 shapes: Milena twice on Tue/Thu/Sat, Tamara on Mon/Wed/Fri, and Julija with
  // a deactivated class only.
  const slot = (trainerId: string, weekday: number, startsAt: string) => ({
    gym_id: gymId,
    program_id: program.id,
    trainer_id: trainerId,
    weekday,
    starts_at: startsAt,
    // PostgREST fills a column missing from one row of a bulk insert with null.
    is_active: true,
  });
  await must(
    admin
      .from("class_slots")
      .insert([
        ...[2, 4, 6].flatMap((day) => [
          slot(trainer.milena, day, "08:00"),
          slot(trainer.milena, day, "18:00"),
        ]),
        ...[1, 3, 5].map((day) => slot(trainer.tamara, day, "19:00")),
        { ...slot(trainer.julija, 1, "10:00"), is_active: false },
      ])
      .select("id"),
    "Test class slots",
  );

  const base = {
    gym_id: gymId,
    duration_value: 1,
    duration_unit: "month",
    covers_personal: false,
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
          covers_group: true,
          group_session_limit: 12,
          requires_trainer: true,
          sort_order: 1,
        },
        {
          ...base,
          name: "E2E Mjesečna",
          kind: "gym",
          price: 79,
          covers_gym: true,
          covers_group: false,
          requires_trainer: false,
          sort_order: 2,
        },
      ])
      .select("id, name")
      .returns<{ id: string; name: string }[]>(),
    "Test plans",
  );
  grupniId = plans.find((plan) => plan.name === "E2E Grupni")!.id;
  mjesecnaId = plans.find((plan) => plan.name === "E2E Mjesečna")!.id;
  await must(
    admin
      .from("plan_finance")
      .insert(plans.map((plan) => ({ plan_id: plan.id, gym_id: gymId })))
      .select("plan_id"),
    "Test plan finance",
  );

  const batch = await must(
    admin
      .from("card_batches")
      .insert({ gym_id: gymId, quantity: 1, created_by: owner.id })
      .select("id")
      .single<{ id: string }>(),
    "Test card batch",
  );
  card = `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
  await must(
    admin
      .from("cards")
      .insert({ gym_id: gymId, code: card, batch_id: batch.id })
      .select("id"),
    "Test card",
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

async function optionTexts(page: Page, label: string) {
  return page
    .getByRole("dialog")
    .getByLabel(label)
    .locator("option:not([disabled])")
    .allInnerTexts();
}

test("D-71: a new Grupni member takes a fixed class time of the chosen trainer only", async ({
  page,
}) => {
  await signIn(page, receptionist);
  await page.goto("/members");
  await page.getByRole("button", { name: "Novi član" }).click();
  const dialog = page.getByRole("dialog");
  const scanField = dialog.getByLabel("Skenirajte praznu karticu");
  await scanField.fill(card);
  await scanField.press("Enter");
  await expect(dialog.getByText("Kartica je prazna i spremna.")).toBeVisible({
    timeout: 20_000,
  });
  await dialog.getByLabel("Ime", { exact: true }).fill("E2E Grupa");
  await dialog.getByLabel("Prezime").fill("Terminić");
  await dialog.getByLabel("Telefon").fill("067 555 777");
  await dialog.getByLabel("Email").fill("termin@e2e.invalid");
  await dialog.getByLabel("Datum rođenja", { exact: true }).fill("05.03.1995");
  await dialog.getByLabel("Prijavi odmah").uncheck();

  // A gym plan asks for no class time at all.
  await dialog.getByLabel("Vrsta članarine").selectOption(mjesecnaId);
  await expect(dialog.getByLabel("Fiksni termin")).toHaveCount(0);

  // Grupni: the field appears once a trainer is chosen, with that trainer's times only.
  await dialog.getByLabel("Vrsta članarine").selectOption(grupniId);
  await expect(dialog.getByLabel("Fiksni termin")).toHaveCount(0);
  await dialog.getByLabel("Trener").selectOption(trainer.milena);
  expect(await optionTexts(page, "Fiksni termin")).toEqual([
    MILENA_0800,
    MILENA_1800,
  ]);
  await dialog.getByLabel("Trener").selectOption(trainer.tamara);
  expect(await optionTexts(page, "Fiksni termin")).toEqual([TAMARA_1900]);

  // A trainer with no active time cannot be sold (D-71).
  await dialog.getByLabel("Trener").selectOption(trainer.julija);
  await expect(dialog.getByLabel("Fiksni termin")).toHaveCount(0);
  await expect(
    dialog.getByText(/Trener nema nijedan aktivan termin u rasporedu/),
  ).toBeVisible();
  await dialog.getByText("Gotovina", { exact: true }).click();
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(
    dialog.getByText(/Trener nema nijedan aktivan termin u rasporedu/),
  ).toBeVisible();

  // The time is required.
  await dialog.getByLabel("Trener").selectOption(trainer.milena);
  await expect(dialog.getByLabel("Fiksni termin")).toHaveValue("");
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(dialog.getByText("Izaberite fiksni termin.")).toBeVisible({
    timeout: 15_000,
  });
  const { count: none } = await adminClient()
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("gym_id", gymId);
  expect(none).toBe(0);

  await dialog.getByLabel("Fiksni termin").selectOption({ label: MILENA_1800 });
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(dialog.getByText(/Član #1 je kreiran\./)).toBeVisible({
    timeout: 15_000,
  });

  const { data } = await adminClient()
    .from("memberships")
    .select("member_id, trainer_id, class_time")
    .eq("gym_id", gymId)
    .single<{ member_id: string; trainer_id: string; class_time: string }>();
  expect(data).toMatchObject({
    trainer_id: trainer.milena,
    class_time: "18:00:00",
  });
  memberId = data!.member_id;
});

test("D-71: [Promijeni termin] moves the member to another time of the same trainer", async ({
  page,
}) => {
  await signIn(page, receptionist);
  await page.goto(`/members/${memberId}`);
  await page
    .getByRole("button", { name: "Promijeni termin E2E Grupni" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText(`Trenutni termin: ${MILENA_1800}`),
  ).toBeVisible();
  await expect(dialog.getByLabel("Fiksni termin")).toHaveValue("18:00:00");
  // Only Milena's times: the trainer stays as sold.
  expect(await optionTexts(page, "Fiksni termin")).toEqual([
    MILENA_0800,
    MILENA_1800,
  ]);
  await dialog.getByLabel("Fiksni termin").selectOption({ label: MILENA_0800 });
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Termin sačuvan.")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();

  const admin = adminClient();
  const { data } = await admin
    .from("memberships")
    .select("id, trainer_id, class_time")
    .eq("member_id", memberId)
    .single<{ id: string; trainer_id: string; class_time: string }>();
  expect(data).toMatchObject({
    trainer_id: trainer.milena,
    class_time: "08:00:00",
  });
  // No new sale: still the one payment from registration.
  const { count } = await admin
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("member_id", memberId);
  expect(count).toBe(1);
  // BR-096: the change is in the audit log.
  const { count: audited } = await admin
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("table_name", "memberships")
    .eq("row_id", data!.id)
    .eq("action", "update")
    .eq("old_data->>class_time", "18:00:00")
    .eq("new_data->>class_time", "08:00:00");
  expect(audited).toBe(1);
});

test("D-71: [Produži] proposes the same trainer and fixed class time", async ({
  page,
}) => {
  await signIn(page, receptionist);
  await page.goto(`/members/${memberId}`);
  await page.getByRole("button", { name: "Produži E2E Grupni" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Vrsta članarine")).toHaveValue(grupniId);
  await expect(dialog.getByLabel("Trener")).toHaveValue(trainer.milena);
  await expect(dialog.getByLabel("Fiksni termin")).toHaveValue("08:00:00");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});
