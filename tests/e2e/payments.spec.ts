import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// M-08 "done when" (doc 09): E2E flow 6 of doc 08 §10, correct and void a payment, plus
// the S-10 day pass and S-11 desk expense that put records on S-12.
test.describe.configure({ mode: "serial" });

const PASSWORD = "uplatelozinka1";

let gymId: string;
let receptionist: TestStaff;
let owner: TestStaff;
let today: string;
let mjesecnaId: string;
let memberId: string;
let closedPaymentId: string;

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
    `${workerInfo.project.name}-payments-${suffix()}`,
  );
  receptionist = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Blagajna",
    password: PASSWORD,
  });
  owner = await createTestStaff(gymId, {
    role: "owner",
    fullName: "E2E Vlasnik uplata",
    password: PASSWORD,
  });
  const admin = adminClient();
  today = (await must(
    admin.rpc("gym_today", { p_gym: gymId }),
    "Gym today",
  )) as string;

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
          // A bulk insert fills missing keys with null, so both rows give every key.
          covers_group: false,
          covers_personal: false,
          requires_trainer: false,
          sort_order: 1,
        },
        {
          gym_id: gymId,
          name: "E2E Dnevna karta",
          kind: "day_pass",
          duration_value: null,
          duration_unit: null,
          price: 10,
          covers_gym: false,
          covers_group: false,
          covers_personal: false,
          requires_trainer: false,
          sort_order: 2,
        },
      ])
      .select("id, name")
      .returns<{ id: string; name: string }[]>(),
    "Test plans",
  );
  mjesecnaId = plans.find((plan) => plan.name === "E2E Mjesečna")!.id;
  const dayPassId = plans.find((plan) => plan.name === "E2E Dnevna karta")!.id;
  await must(
    admin
      .from("plan_finance")
      .insert(plans.map((plan) => ({ plan_id: plan.id, gym_id: gymId })))
      .select("plan_id"),
    "Test plan finance",
  );
  await must(
    admin
      .from("expense_categories")
      .insert([
        { gym_id: gymId, name: "E2E Potrošni materijal", is_salary: false },
        { gym_id: gymId, name: "E2E Plate", is_salary: true },
      ])
      .select("id"),
    "Test categories",
  );

  const member = await must(
    admin
      .from("members")
      .insert({
        gym_id: gymId,
        member_number: 1,
        first_name: "E2E Šesnaesta",
        last_name: "Članica",
        phone: "+38267160016",
        email: "e16@e2e.invalid",
        date_of_birth: "1990-01-01",
        created_by: owner.id,
      })
      .select("id")
      .single<{ id: string }>(),
    "Test member",
  );
  memberId = member.id;

  // AS-14: a payment from a shift that is already closed, earlier today.
  const closed = await must(
    admin
      .from("shifts")
      .insert({
        gym_id: gymId,
        staff_id: receptionist.id,
        started_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
        closed_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
        close_type: "manual",
        closed_by: receptionist.id,
      })
      .select("id")
      .single<{ id: string }>(),
    "Closed shift",
  );
  const payment = await must(
    admin
      .from("payments")
      .insert({
        gym_id: gymId,
        kind: "day_pass",
        plan_id: dayPassId,
        quantity: 1,
        amount: 10,
        method: "cash",
        paid_on: today,
        created_by: receptionist.id,
        shift_id: closed.id,
        created_at: new Date(Date.now() - 2.5 * 3600_000).toISOString(),
      })
      .select("id")
      .single<{ id: string }>(),
    "Closed-shift payment",
  );
  closedPaymentId = payment.id;
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

test("US-12.1 and US-14.1: a day pass and a desk expense from reception", async ({
  page,
}) => {
  await signIn(page, receptionist);
  await page.getByRole("button", { name: "Počni rad" }).click();

  // S-10 and BR-100: the stepper, the live total, the method.
  await page.getByRole("button", { name: "Dnevna karta" }).click();
  const pass = page.getByRole("dialog");
  await pass.getByRole("button", { name: "Jedna više" }).click();
  await pass.getByRole("button", { name: "Jedna više" }).click();
  await expect(pass.getByText("Ukupno: 30,00 €")).toBeVisible();
  await pass.getByText("Gotovina", { exact: true }).click();
  await pass.getByRole("button", { name: "Naplati" }).click();
  await expect(
    page.getByText("Prodato: 3 × dnevna karta = 30,00 €"),
  ).toBeVisible();

  // S-11 and BR-132: salary categories are not offered at the desk (D-37).
  await page.getByRole("button", { name: "Trošak" }).click();
  const expense = page.getByRole("dialog");
  await expect(expense.getByText("Plaćeno iz kase · danas")).toBeVisible();
  await expect(
    expense
      .getByLabel("Kategorija")
      .locator("option", { hasText: "E2E Plate" }),
  ).toHaveCount(0);
  await expense
    .getByLabel("Kategorija")
    .selectOption({ label: "E2E Potrošni materijal" });
  await expense.getByLabel("Opis").fill("Deterdžent");
  await expense.getByLabel("Iznos (€)").fill("4,50");
  await expense.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Trošak je sačuvan.")).toBeVisible();

  const { data } = await adminClient()
    .from("expenses")
    .select("amount::text, method, paid_from_till, spent_on")
    .eq("gym_id", gymId)
    .single<{
      amount: string;
      method: string;
      paid_from_till: boolean;
      spent_on: string;
    }>();
  expect(data).toEqual({
    amount: "4.50",
    method: "cash",
    paid_from_till: true,
    spent_on: today,
  });
});

test("Flow 6: correct and void payments on S-12, with E16 and AS-14", async ({
  page,
}) => {
  await signIn(page, receptionist);

  // E16 set-up: a membership sold on this open shift, with one visit using it.
  const admin = adminClient();
  const { data: shift } = await admin
    .from("shifts")
    .select("id")
    .eq("gym_id", gymId)
    .is("closed_at", null)
    .single<{ id: string }>();
  const membership = await must(
    admin
      .from("memberships")
      .insert({
        gym_id: gymId,
        member_id: memberId,
        plan_id: mjesecnaId,
        start_date: today,
        end_date: today,
        start_reason: "Počinje danas",
        covers_gym: true,
        covers_group: false,
        covers_personal: false,
        created_by: receptionist.id,
        shift_id: shift!.id,
      })
      .select("id")
      .single<{ id: string }>(),
    "Membership",
  );
  await must(
    admin
      .from("payments")
      .insert({
        gym_id: gymId,
        kind: "membership",
        membership_id: membership.id,
        member_id: memberId,
        plan_id: mjesecnaId,
        amount: 79,
        method: "cash",
        paid_on: today,
        created_by: receptionist.id,
        shift_id: shift!.id,
      })
      .select("id"),
    "Membership payment",
  );
  await must(
    admin
      .from("visits")
      .insert({
        gym_id: gymId,
        member_id: memberId,
        membership_id: membership.id,
        visit_type: "gym",
        checked_in_at: new Date(Date.now() - 3600_000).toISOString(),
        checked_out_at: new Date(Date.now() - 1800_000).toISOString(),
        checked_in_by: receptionist.id,
        shift_id: shift!.id,
      })
      .select("id"),
    "Visit",
  );

  await page.goto("/payments/today");
  await expect(
    page.getByRole("heading", { name: "Uplate danas" }),
  ).toBeVisible();

  // AS-14: the closed shift's payment is read-only for a receptionist.
  await expect(
    page.getByRole("button", { name: "Ispravi Dnevna karta × 1" }),
  ).toBeDisabled();

  // BR-094: method and note; no amount field for a receptionist.
  await page.getByRole("button", { name: "Ispravi Dnevna karta × 3" }).click();
  const correct = page.getByRole("dialog");
  await expect(correct.getByLabel("Iznos (€)")).toHaveCount(0);
  await correct.getByText("Platna kartica", { exact: true }).click();
  await correct.getByLabel("Napomena").fill("Kartica, ne gotovina");
  await correct.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Uplata je ispravljena.")).toBeVisible();

  // BR-095: a reason of 3–200 characters, then the void.
  await page.getByRole("button", { name: "Poništi Dnevna karta × 3" }).click();
  const voiding = page.getByRole("dialog");
  await voiding.getByLabel("Razlog").fill("ab");
  await voiding.getByRole("button", { name: "Poništi" }).click();
  await expect(
    voiding.getByText("Unesite razlog (3–200 znakova)."),
  ).toBeVisible();
  await voiding.getByLabel("Razlog").fill("Pogrešna prodaja");
  await voiding.getByRole("button", { name: "Poništi" }).click();
  await expect(page.getByText("Stavka je poništena.").last()).toBeVisible();

  // E16 through the screen: US-13.1 AC3 warns first.
  await page
    .getByRole("button", {
      name: /^Poništi E2E Mjesečna – #1 E2E Šesnaesta Članica$/,
    })
    .click();
  const membershipVoid = page.getByRole("dialog");
  await expect(
    membershipVoid.getByText(
      "Poništavanjem ove uplate poništava se i članarina, a njeni dolasci postaju neplaćeni.",
    ),
  ).toBeVisible();
  await membershipVoid.getByLabel("Razlog").fill("Pogrešan član");
  await membershipVoid.getByRole("button", { name: "Poništi" }).click();
  await expect(page.getByText("Stavka je poništena.").last()).toBeVisible();

  // Voided rows stay, struck through (BR-095).
  await expect(page.locator("tr[data-voided=true]")).toHaveCount(2);

  const { data: payments } = await admin
    .from("payments")
    .select("kind, quantity, method, note, void_reason")
    .eq("gym_id", gymId)
    .not("voided_at", "is", null)
    .order("kind")
    .returns<Record<string, unknown>[]>();
  expect(payments).toEqual([
    {
      kind: "membership",
      quantity: 1,
      method: "cash",
      note: null,
      void_reason: "Pogrešan član",
    },
    {
      kind: "day_pass",
      quantity: 3,
      method: "card",
      note: "Kartica, ne gotovina",
      void_reason: "Pogrešna prodaja",
    },
  ]);
  const { data: voidedMembership } = await admin
    .from("memberships")
    .select("void_reason")
    .eq("id", membership.id)
    .single<{ void_reason: string | null }>();
  expect(voidedMembership?.void_reason).toBe("Pogrešan član");
  const { data: visits } = await admin
    .from("visits")
    .select("membership_id, is_unpaid")
    .eq("member_id", memberId)
    .returns<{ membership_id: string | null; is_unpaid: boolean }[]>();
  expect(visits).toEqual([{ membership_id: null, is_unpaid: true }]);

  // BR-135: my own expense from this shift can be voided too.
  await page
    .getByRole("button", { name: "Poništi E2E Potrošni materijal: Deterdžent" })
    .click();
  const expenseVoid = page.getByRole("dialog");
  await expenseVoid.getByLabel("Razlog").fill("Duplo uneseno");
  await expenseVoid.getByRole("button", { name: "Poništi" }).click();
  await expect(page.getByText("Stavka je poništena.").last()).toBeVisible();
  await expect(page.locator("tr[data-voided=true]")).toHaveCount(3);
});

test("P-31: the owner changes the amount of a closed-shift payment", async ({
  page,
}) => {
  await signIn(page, owner);
  await page.goto("/payments/today");
  await expect(
    page.getByRole("heading", { name: "Troškovi danas" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ispravi Dnevna karta × 1" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Iznos (€)").fill("12,00");
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Uplata je ispravljena.")).toBeVisible();

  const { data } = await adminClient()
    .from("payments")
    .select("amount::text")
    .eq("id", closedPaymentId)
    .single<{ amount: string }>();
  expect(data?.amount).toBe("12.00");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
