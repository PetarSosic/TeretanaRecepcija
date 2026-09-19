import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// M-10 "done when" (doc 09): E2E flow 7 of doc 08 §10 (close shift → PDF stored →
// logged out), E15 on S-14, the D-54 totals a manager sees on S-12, and BR-118: with a
// wrong Resend key (see playwright.config.ts) the shift still closes, email_status failed.
test.describe.configure({ mode: "serial" });

const PASSWORD = "zakljucilozinka1";

let gymId: string;
let receptionist: TestStaff;
let manager: TestStaff;
let shiftId: string;

async function signIn(page: Page, staff: TestStaff) {
  await page.goto("/login");
  await page.getByLabel("Korisničko ime ili email").fill(staff.identifier);
  await page.getByLabel("Lozinka", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
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
  gymId = await createTestGym(`${workerInfo.project.name}-close-${suffix()}`);
  receptionist = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Đurđa Ćirić",
    password: PASSWORD,
  });
  manager = await createTestStaff(gymId, {
    role: "manager",
    fullName: "E2E Menadžer smjene",
    password: PASSWORD,
  });
});

test.afterAll(async () => {
  await deleteTestGym(gymId);
});

test("E15 on S-14, and the D-54 totals a manager sees on S-12", async ({
  page,
  browser,
}) => {
  // The login opens the shift (BR-111); E15's records are then put on it.
  await signIn(page, receptionist);
  const admin = adminClient();
  const shift = await must(
    admin
      .from("shifts")
      .select("id")
      .eq("gym_id", gymId)
      .is("closed_at", null)
      .single<{ id: string }>(),
    "Open shift",
  );
  shiftId = shift.id;
  const today = (await must(
    admin.rpc("gym_today", { p_gym: gymId }),
    "Gym today",
  )) as string;
  const plan = await must(
    admin
      .from("plans")
      .insert({
        gym_id: gymId,
        name: "E2E Dnevna",
        kind: "day_pass",
        price: 10,
      })
      .select("id")
      .single<{ id: string }>(),
    "Day pass plan",
  );
  const category = await must(
    admin
      .from("expense_categories")
      .insert({ gym_id: gymId, name: "E2E Potrošni materijal" })
      .select("id")
      .single<{ id: string }>(),
    "Category",
  );
  const product = await must(
    admin
      .from("products")
      .insert({
        gym_id: gymId,
        name: "E2E Voda",
        current_purchase_price: 0.3,
        sale_price: 1.5,
      })
      .select("id")
      .single<{ id: string }>(),
    "Product",
  );
  const member = await must(
    admin
      .from("members")
      .insert({
        gym_id: gymId,
        member_number: 1,
        first_name: "E2E Željko",
        last_name: "Šćepanović",
        phone: "+38267150015",
        email: "e15@e2e.invalid",
        date_of_birth: "1990-01-01",
        created_by: receptionist.id,
      })
      .select("id")
      .single<{ id: string }>(),
    "Member",
  );
  // E15: cash payments €237.00, cash bar sales €4.50, till expenses €13.50.
  await must(
    admin
      .from("payments")
      .insert([
        {
          gym_id: gymId,
          kind: "day_pass",
          plan_id: plan.id,
          quantity: 20,
          amount: 200,
          method: "cash",
          paid_on: today,
          created_by: receptionist.id,
          shift_id: shiftId,
        },
        {
          gym_id: gymId,
          kind: "day_pass",
          plan_id: plan.id,
          quantity: 3,
          amount: 37,
          method: "cash",
          paid_on: today,
          created_by: receptionist.id,
          shift_id: shiftId,
        },
      ])
      .select("id"),
    "Payments",
  );
  await must(
    admin
      .from("stock_movements")
      .insert({
        gym_id: gymId,
        product_id: product.id,
        type: "out",
        quantity: 3,
        unit_cost: 0.3,
        unit_price: 1.5,
        method: "cash",
        created_by: receptionist.id,
        shift_id: shiftId,
      })
      .select("id"),
    "Bar sale",
  );
  await must(
    admin
      .from("expenses")
      .insert({
        gym_id: gymId,
        spent_on: today,
        category_id: category.id,
        description: "Sredstvo za čišćenje",
        amount: 13.5,
        method: "cash",
        paid_from_till: true,
        created_by: receptionist.id,
        shift_id: shiftId,
      })
      .select("id"),
    "Till expense",
  );
  await must(
    admin
      .from("visits")
      .insert({
        gym_id: gymId,
        member_id: member.id,
        visit_type: "gym",
        is_unpaid: true,
        checked_in_by: receptionist.id,
        shift_id: shiftId,
      })
      .select("id"),
    "Open visit",
  );

  // D-54 and P-14: a manager sees the four totals of the open shift on S-12.
  const managerContext = await browser.newContext();
  const managerPage = await managerContext.newPage();
  await signIn(managerPage, manager);
  await managerPage.goto("/payments/today");
  const footer = managerPage.getByRole("region", { name: "Otvorena smjena" });
  await expect(footer.getByText("241,50 €")).toBeVisible();
  await expect(footer.getByText("13,50 €")).toBeVisible();
  await expect(footer.getByText("228,00 €")).toBeVisible();
  await managerContext.close();

  // S-14 (BR-115): the cards, the counts and the people still inside.
  await page.goto("/shift/close");
  await expect(
    page.getByRole("heading", { name: "Zaključi smjenu" }),
  ).toBeVisible();
  await expect(page.getByText("241,50 €")).toBeVisible();
  await expect(page.getByText("228,00 €")).toBeVisible();
  await expect(page.getByText("U teretani je još 1 osoba.")).toBeVisible();

  // E15: counted €225.00 against €228.00 is −€3.00, a shortage.
  await page.getByLabel("Prebrojana gotovina (€)").fill("225");
  await expect(page.getByText("Razlika: -3,00 € (Manjak)")).toBeVisible();
  await page.getByRole("button", { name: "Pregledaj stavke" }).click();
  await expect(page.getByText("E2E Voda × 3 · Gotovina")).toBeVisible();
});

test("Flow 7 and BR-118: close, report stored, email failed, logged out", async ({
  page,
}) => {
  await signIn(page, receptionist);
  await page.goto("/shift/close");
  await page.getByLabel("Prebrojana gotovina (€)").fill("225,00");
  await page
    .getByRole("button", { name: "Zaključi smjenu i odjavi me" })
    .click();
  await expect(
    page.getByText(
      "Nakon zaključenja nije moguće mijenjati stavke ove smjene.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Zaključi", exact: true }).click();

  // BR-114 step 5: logged out, with the S-01 notice.
  await page.waitForURL(/\/login\?closed=1/, { timeout: 30_000 });
  await expect(page.getByText("Smjena je zaključena.")).toBeVisible();

  const admin = adminClient();
  const { data: shift } = await admin
    .from("shifts")
    .select(
      "close_type, counted_cash::text, report_path, email_status, email_attempts",
    )
    .eq("id", shiftId)
    .single<Record<string, unknown>>();
  expect(shift).toEqual({
    close_type: "manual",
    counted_cash: "225.00",
    report_path: `${gymId}/${shiftId}.pdf`,
    // BR-118: the wrong key fails the email, and the shift stays closed.
    email_status: "failed",
    email_attempts: 1,
  });

  // BR-117: the PDF is really in the private bucket.
  const file = await admin.storage
    .from("shift-reports")
    .download(`${gymId}/${shiftId}.pdf`);
  expect(file.error).toBeNull();
  const bytes = Buffer.from(await file.data!.arrayBuffer());
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");

  // The receptionist's next request is a login page, not reception.
  await page.goto("/reception");
  await expect(page).toHaveURL(/\/login/);
});
