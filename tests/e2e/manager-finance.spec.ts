import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// D-80: the manager's Finansije — Pregled, Troškovi and Smjene, for Danas, Ova sedmica
// or Ovaj mjesec, with income and expenses only and never a salary. D-81: no PDF.
// D-82: the eye button in a password field.
test.describe.configure({ mode: "serial" });

const PASSWORD = "menadzerfin12345";

let gymId: string;
let owner: TestStaff;
let manager: TestStaff;
let shiftId: string;
let batchId: string;

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
  test.skip(workerInfo.project.name !== "desktop");
  gymId = await createTestGym(`${workerInfo.project.name}-manfin-${suffix()}`);
  owner = await createTestStaff(gymId, {
    role: "owner",
    fullName: "E2E Vlasnik finansija",
    password: PASSWORD,
  });
  manager = await createTestStaff(gymId, {
    role: "manager",
    fullName: "E2E Menadžer finansija",
    password: PASSWORD,
  });
  const desk = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Recepcija finansija",
    password: PASSWORD,
  });

  const admin = adminClient();
  const { data: today } = await admin.rpc("gym_today", { p_gym: gymId });

  // Today's closed shift, whose report went out on the second attempt (BR-118).
  const now = new Date().toISOString();
  shiftId = (
    await must(
      admin
        .from("shifts")
        .insert({
          gym_id: gymId,
          staff_id: desk.id,
          started_at: now,
          closed_at: now,
          close_type: "manual",
          report_path: `${gymId}/e2e.pdf`,
          email_status: "sent",
          email_attempts: 2,
          emailed_at: now,
        })
        .select("id")
        .single<{ id: string }>(),
      "Shift",
    )
  ).id;

  // BR-150: €15 of income today.
  const plan = await must(
    admin
      .from("plans")
      .insert({
        gym_id: gymId,
        name: "E2E Dnevna",
        kind: "day_pass",
        price: 15,
        covers_gym: false,
      })
      .select("id")
      .single<{ id: string }>(),
    "Day pass plan",
  );
  await must(
    admin
      .from("payments")
      .insert({
        gym_id: gymId,
        kind: "day_pass",
        plan_id: plan.id,
        amount: 15,
        method: "cash",
        paid_on: today,
        created_by: desk.id,
        shift_id: shiftId,
      })
      .select("id"),
    "Payment",
  );

  // BR-151: €40 of electricity and a €25 payout, both today.
  const trainer = await must(
    admin
      .from("trainers")
      .insert({ gym_id: gymId, full_name: "E2E Tamara finansije" })
      .select("id")
      .single<{ id: string }>(),
    "Trainer",
  );
  const categories = await must(
    admin
      .from("expense_categories")
      .insert([
        { gym_id: gymId, name: "E2E Struja", is_salary: false },
        { gym_id: gymId, name: "E2E Plate", is_salary: true },
      ])
      .select("id, is_salary")
      .returns<{ id: string; is_salary: boolean }[]>(),
    "Categories",
  );
  await must(
    admin
      .from("expenses")
      .insert([
        {
          gym_id: gymId,
          spent_on: today,
          category_id: categories.find((c) => !c.is_salary)!.id,
          description: "E2E struja danas",
          amount: 40,
          method: "card",
          created_by: owner.id,
        },
        {
          gym_id: gymId,
          spent_on: today,
          category_id: categories.find((c) => c.is_salary)!.id,
          description: "E2E isplata trenerki",
          amount: 25,
          method: "cash",
          trainer_id: trainer.id,
          created_by: owner.id,
        },
      ])
      .select("id"),
    "Expenses",
  );

  batchId = (
    await must(
      admin
        .from("card_batches")
        .insert({ gym_id: gymId, quantity: 1, created_by: owner.id })
        .select("id")
        .single<{ id: string }>(),
      "Card batch",
    )
  ).id;
});

test.afterAll(async () => {
  if (gymId) await deleteTestGym(gymId);
});

async function signIn(page: Page, staff: TestStaff) {
  // A signed-in user is bounced off /login to their own home, so the session goes first.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Korisničko ime ili email").fill(staff.identifier);
  await page.getByLabel("Lozinka", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("D-80: the manager's Pregled has income and expenses, no profit and no salary", async ({
  page,
}) => {
  await signIn(page, manager);
  await expect(
    page.getByRole("navigation", { name: "Meni" }).getByRole("link", {
      name: "Finansije",
    }),
  ).toBeVisible();
  await page.goto("/finance");

  const tabs = page.getByRole("navigation", { name: "Finansije" });
  await expect(tabs.getByRole("link")).toHaveText([
    "Pregled",
    "Troškovi",
    "Smjene",
  ]);

  const period = page.getByLabel("Period");
  await expect(period.locator("option")).toHaveText([
    "Danas",
    "Ova sedmica",
    "Ovaj mjesec",
  ]);
  await expect(period).toHaveValue("month");

  const main = page.locator("main");
  await expect(main.getByText("Prihod", { exact: true }).first()).toBeVisible();
  await expect(
    main.getByText("Troškovi", { exact: true }).last(),
  ).toBeVisible();
  await expect(main).toContainText("15,00 €");
  await expect(main).toContainText("40,00 €");
  await expect(main).toContainText("E2E Struja");
  // BR-157 (D-80): no profit, no bar profit, no count, no chart, and no salary at all.
  for (const hidden of [
    "Profit",
    "Zarada na magacinu",
    "Aktivni članovi",
    "Prihod i troškovi po mjesecima (€)",
    "Ističe u narednih 7 dana",
    // D-92: nor the owner's statement and cash flow.
    "Bilans uspjeha",
    "Novčani tok",
    "Trošak prodate robe",
  ])
    await expect(main.getByText(hidden, { exact: true })).toHaveCount(0);
  await expect(main).not.toContainText("E2E Plate");
  await expect(main).not.toContainText("25,00 €");
  await expect(main).not.toContainText("65,00 €");

  // A period the picker does not offer falls back to Ovaj mjesec.
  await page.goto("/finance?period=last_month");
  await expect(page.getByLabel("Period")).toHaveValue("month");
  await expect(page.locator("main")).toContainText("40,00 €");

  await page.getByLabel("Period").selectOption("today");
  await expect(page).toHaveURL(/period=today/);
  await expect(page.locator("main")).toContainText("15,00 €");
});

test("D-80: S-17 is read-only for the manager and lists no salary", async ({
  page,
}) => {
  await signIn(page, manager);
  await page.goto("/finance/expenses");
  const main = page.locator("main");
  await expect(
    main.getByRole("cell", { name: "E2E struja danas" }),
  ).toBeVisible();
  await expect(main).toContainText("Ukupno: 40,00 €");
  await expect(main).not.toContainText("E2E isplata trenerki");
  for (const button of ["Novi trošak", "Kategorije troškova", "Poništi"])
    await expect(main.getByRole("button", { name: button })).toHaveCount(0);
  await expect(
    page.getByLabel("Kategorija", { exact: true }).locator("option"),
  ).not.toContainText(["E2E Plate"]);
});

test("D-80, D-81: S-19 lists the manager's shifts without the report or its email", async ({
  page,
}) => {
  await signIn(page, manager);
  await page.goto("/finance/shifts?period=today");
  const main = page.locator("main");
  await expect(
    main.getByRole("cell", { name: "E2E Recepcija finansija" }),
  ).toBeVisible();
  await expect(main.getByRole("columnheader", { name: "Email" })).toHaveCount(
    0,
  );
  await expect(main.getByRole("link", { name: "PDF" })).toHaveCount(0);
  await expect(
    main.getByRole("button", { name: "Pošalji ponovo" }),
  ).toHaveCount(0);
  await expect(main).not.toContainText("poslato");

  const report = await page.request.get(`/api/pdf/shift/${shiftId}`);
  expect(report.status()).toBe(404);
  const cards = await page.request.get(`/api/pdf/cards/${batchId}`);
  expect(cards.status()).toBe(404);
});

test("D-80, D-81: the owner's pages stay closed to the manager", async ({
  page,
}) => {
  await signIn(page, manager);
  for (const path of [
    // D-93: fixed expenses hold salaries.
    "/finance/recurring",
    "/finance/trainers",
    "/finance/storage",
    "/finance/audit",
    "/finance/backdated",
    "/settings/cards",
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: "404" }),
      path,
    ).toBeVisible();
  }
});

test("BR-157: the owner still sees profit, salaries and the shift report", async ({
  page,
}) => {
  await signIn(page, owner);
  await page.goto("/finance");
  const main = page.locator("main");
  await expect(main.getByText("Profit", { exact: true }).first()).toBeVisible();
  await expect(main).toContainText("65,00 €");
  await expect(main).toContainText("E2E Plate");

  await page.goto("/finance/shifts?period=today");
  await expect(
    page.locator("main").getByRole("columnheader", { name: "Email" }),
  ).toBeVisible();
  await expect(
    page.locator("main").getByRole("link", { name: "PDF" }),
  ).toBeVisible();
});

test("D-82: the eye button shows and hides the typed password", async ({
  page,
}) => {
  await page.context().clearCookies();
  await page.goto("/login");
  const password = page.getByLabel("Lozinka", { exact: true });
  await password.fill("tajna-lozinka");
  await expect(password).toHaveAttribute("type", "password");

  await page.getByRole("button", { name: "Prikaži lozinku" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toHaveValue("tajna-lozinka");

  await page.getByRole("button", { name: "Sakrij lozinku" }).click();
  await expect(password).toHaveAttribute("type", "password");
  await expect(password).toHaveValue("tajna-lozinka");
});

/** D-82: the field's own eye shows and hides it, and pressing it submits nothing. */
async function checkEye(page: Page, scope: Page | Locator, label: string) {
  const field = scope.getByLabel(label, { exact: true });
  const url = page.url();
  await field.fill("tajna-lozinka");
  await expect(field).toHaveAttribute("type", "password");

  const frame = field.locator("..");
  await frame.getByRole("button", { name: "Prikaži lozinku" }).click();
  await expect(field).toHaveAttribute("type", "text");
  await expect(field).toHaveValue("tajna-lozinka");

  await frame.getByRole("button", { name: "Sakrij lozinku" }).click();
  await expect(field).toHaveAttribute("type", "password");
  await expect(field).toHaveValue("tajna-lozinka");
  expect(page.url()).toBe(url);
}

test("D-82: S-01b and both S-23 password dialogs have the eye button too", async ({
  page,
}) => {
  await signIn(page, owner);

  await page.goto("/change-password");
  for (const label of ["Trenutna lozinka", "Nova lozinka", "Ponovi lozinku"])
    await checkEye(page, page, label);

  await page.goto("/settings/users");
  await page.getByRole("button", { name: "Novi korisnik" }).click();
  let dialog = page.getByRole("dialog");
  await checkEye(page, dialog, "Privremena lozinka");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page
    .getByRole("row")
    .filter({ hasText: "E2E Menadžer finansija" })
    .getByRole("button", { name: "Nova lozinka" })
    .click();
  dialog = page.getByRole("dialog");
  await checkEye(page, dialog, "Privremena lozinka");
});
