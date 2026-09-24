import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// M-12, doc 08 §10 flows 9 and 10: the owner's finance pages show the E9–E12 figures,
// and a manager cannot reach any of them.
test.describe.configure({ mode: "serial" });

const PASSWORD = "finansije12345";

let gymId: string;
let owner: TestStaff;
let manager: TestStaff;
let receptionist: TestStaff;
/** The first day of last month, so the fixtures never straddle a month boundary. */
let monthValue: string;

/**
 * E9 to E12 as rows in the database: Grupni €69 at 70%, G+T €99 with €50 to the gym
 * first, Personalni €120 with a trainer whose fee is €80, and Personalni €100 with a
 * trainer who has no fee at all (OQ-1).
 */
async function seedFinance(): Promise<void> {
  const admin = adminClient();
  const fail = (step: string, error: { message: string } | null) => {
    if (error) throw new Error(`Finance fixture ${step}: ${error.message}`);
  };

  const { data: today } = await admin.rpc("gym_today", { p_gym: gymId });
  const first = new Date(`${today as string}T12:00:00Z`);
  first.setUTCDate(1);
  first.setUTCMonth(first.getUTCMonth() - 1);
  const month = first.toISOString().slice(0, 7);
  monthValue = month;
  const paidOn = `${month}-10`;
  const endDate = `${month}-28`;

  const trainers = await admin
    .from("trainers")
    .insert([
      { gym_id: gymId, full_name: "E2E Tamara" },
      { gym_id: gymId, full_name: "E2E Julija" },
    ])
    .select("id, full_name")
    .returns<{ id: string; full_name: string }[]>();
  fail("trainers", trainers.error);
  const tamara = trainers.data!.find((t) => t.full_name === "E2E Tamara")!.id;
  const julija = trainers.data!.find((t) => t.full_name === "E2E Julija")!.id;

  fail(
    "trainer finance",
    (
      await admin.from("trainer_finance").insert([
        { trainer_id: tamara, gym_id: gymId, personal_gym_fee: 80 },
        { trainer_id: julija, gym_id: gymId, personal_gym_fee: null },
      ])
    ).error,
  );

  const plans = await admin
    .from("plans")
    .insert([
      {
        gym_id: gymId,
        name: "E2E Grupni",
        kind: "group",
        duration_value: 1,
        duration_unit: "month",
        price: 69,
        covers_gym: false,
        covers_group: true,
        covers_personal: false,
        requires_trainer: true,
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
        requires_trainer: true,
      },
      {
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
      },
    ])
    .select("id, name")
    .returns<{ id: string; name: string }[]>();
  fail("plans", plans.error);
  const planId = (name: string) => plans.data!.find((p) => p.name === name)!.id;

  fail(
    "plan finance",
    (
      await admin.from("plan_finance").insert([
        {
          plan_id: planId("E2E Grupni"),
          gym_id: gymId,
          gym_fixed_amount: 0,
          trainer_share_pct: 70,
        },
        {
          plan_id: planId("E2E G+T"),
          gym_id: gymId,
          gym_fixed_amount: 50,
          trainer_share_pct: 100,
        },
        {
          plan_id: planId("E2E Personalni"),
          gym_id: gymId,
          gym_fixed_amount: 0,
          trainer_share_pct: null,
        },
      ])
    ).error,
  );

  fail(
    "expense category",
    (
      await admin
        .from("expense_categories")
        .insert({ gym_id: gymId, name: "E2E Struja" })
    ).error,
  );

  const members = await admin
    .from("members")
    .insert(
      ["Đurđa", "Željko", "Milica", "Nikola"].map((name, index) => ({
        gym_id: gymId,
        member_number: index + 1,
        first_name: name,
        last_name: "Čučković",
        phone: `+3826700040${index}`,
        email: `e2e-fin-${index}@pgtap.invalid`,
        date_of_birth: "1990-01-01",
        created_by: owner.id,
      })),
    )
    .select("id, member_number")
    .returns<{ id: string; member_number: number }[]>();
  fail("members", members.error);
  const member = (n: number) =>
    members.data!.find((m) => m.member_number === n)!.id;

  const cases = [
    { plan: "E2E Grupni", trainer: tamara, amount: 69, member: 1, group: true },
    { plan: "E2E G+T", trainer: tamara, amount: 99, member: 2, group: true },
    {
      plan: "E2E Personalni",
      trainer: tamara,
      amount: 120,
      member: 3,
      group: false,
    },
    {
      plan: "E2E Personalni",
      trainer: julija,
      amount: 100,
      member: 4,
      group: false,
    },
  ];

  for (const entry of cases) {
    const membership = await admin
      .from("memberships")
      .insert({
        gym_id: gymId,
        member_id: member(entry.member),
        plan_id: planId(entry.plan),
        trainer_id: entry.trainer,
        start_date: paidOn,
        end_date: endDate,
        start_reason: "E2E",
        covers_gym: entry.plan === "E2E G+T",
        covers_group: entry.group,
        covers_personal: !entry.group,
        personal_session_limit: entry.group ? null : 10,
        is_backdated: true,
        created_by: owner.id,
        shift_id: null,
      })
      .select("id")
      .single<{ id: string }>();
    fail("membership", membership.error);

    fail(
      "membership finance",
      (
        await admin.from("membership_finance").insert({
          membership_id: membership.data!.id,
          gym_id: gymId,
          gym_fixed_amount: entry.plan === "E2E G+T" ? 50 : 0,
          trainer_share_pct: entry.group
            ? entry.plan === "E2E G+T"
              ? 100
              : 70
            : null,
          personal_gym_fee: entry.group
            ? null
            : entry.trainer === tamara
              ? 80
              : null,
        })
      ).error,
    );

    fail(
      "payment",
      (
        await admin.from("payments").insert({
          gym_id: gymId,
          kind: "membership",
          membership_id: membership.data!.id,
          member_id: member(entry.member),
          plan_id: planId(entry.plan),
          amount: entry.amount,
          method: "cash",
          paid_on: paidOn,
          is_backdated: true,
          created_by: owner.id,
          shift_id: null,
        })
      ).error,
    );
  }
}

test.beforeAll(async ({}, workerInfo) => {
  gymId = await createTestGym(`${workerInfo.project.name}-fin-${suffix()}`);
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
  receptionist = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Recepcioner finansija",
    password: PASSWORD,
  });
  await seedFinance();
});

test.afterAll(async () => {
  await deleteTestGym(gymId);
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

test("Flow 9: S-16 shows the period totals and the twelve-month chart", async ({
  page,
}) => {
  await signIn(page, owner);
  await page.goto("/finance?period=last_month");

  // BR-150: €69 + €99 + €120 + €100.
  await expect(page.getByText("Prihod", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("388,00 €").first()).toBeVisible();
  await expect(page.getByText("Profit", { exact: true })).toBeVisible();

  // US-17.1 AC3: the chart is a real figure with both series named.
  const figure = page.getByRole("img", {
    name: /Prihod i troškovi|Pređite mišem/,
  });
  await expect(
    page.getByText("Prihod i troškovi po mjesecima (€)"),
  ).toBeVisible();
  await expect(figure.or(page.locator("svg").first())).toBeVisible();

  // US-17.1 AC2: the breakdown adds up to the same money.
  await expect(page.getByText("Prihod po vrsti članarine")).toBeVisible();
  await expect(page.getByRole("cell", { name: "E2E Grupni" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "220,00 €" })).toBeVisible();
});

test("D-68: the S-16 chart opens on this year and narrows to one month by day", async ({
  page,
}) => {
  const { data: today } = await adminClient().rpc("gym_today", { p_gym: gymId });
  const thisYear = (today as string).slice(0, 4);
  const [year, month] = monthValue.split("-");
  const months = [
    "januar", "februar", "mart", "april", "maj", "jun",
    "jul", "avgust", "septembar", "oktobar", "novembar", "decembar",
  ];
  const monthName = months[Number(month) - 1];

  await signIn(page, owner);
  await page.goto("/finance");
  const yearSelect = page.getByLabel("Godina", { exact: true });
  const monthSelect = page.getByLabel("Mjesec", { exact: true });
  await expect(yearSelect).toHaveValue(thisYear);
  await expect(monthSelect).toHaveValue("");
  await expect(page.getByText("Prihod i troškovi po mjesecima (€)")).toBeVisible();
  const chart = page.locator("figure", { hasText: "Prihod i troškovi po" });
  await expect(chart.locator("svg text", { hasText: /^dec$/ })).toHaveCount(1);
  await expect(chart).toContainText(`Ukupno za ${thisYear}:`);

  // The fixture month through the two selects, as the owner would pick it.
  if (year !== thisYear) {
    // In January the fixture month is last December, in last year.
    await yearSelect.selectOption(year);
    await page.waitForURL((url) => url.searchParams.get("year") === year);
  }
  await monthSelect.selectOption(String(Number(month)));
  await page.waitForURL(
    (url) => url.searchParams.get("month") === String(Number(month)),
  );
  await expect(page.getByText("Prihod i troškovi po danima (€)")).toBeVisible();
  await expect(chart).toContainText(`Ukupno za ${monthName} ${year}:`);
  await expect(chart).toContainText("Prihod 388,00 €");
  const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  await expect(chart.locator("svg g:has(rect)")).toHaveCount(days);

  // The 10th: BR-150's €69 + €99 + €120 + €100, paid that day.
  await chart.locator("svg g:has(rect)").nth(9).locator("rect").first().hover();
  await expect(chart.locator("p[aria-live=polite]")).toContainText(
    `10.${month}.${year} — Prihod: 388,00 €`,
  );

  // The period of the cards stays its own: the chart filter leaves it alone.
  await expect(page.getByLabel("Period")).toHaveValue("month");

  // A year that has not come, or a month that is not one, falls back to this year.
  await page.goto(`/finance?year=${Number(thisYear) + 1}&month=13`);
  await expect(yearSelect).toHaveValue(thisYear);
  await expect(monthSelect).toHaveValue("");
});

test("Flow 9 and E9–E12: S-18 shows each trainer's share, and none for an unknown fee", async ({
  page,
}) => {
  await signIn(page, owner);
  await page.goto(`/finance/trainers?month=${monthValue}`);

  const tamara = page.getByRole("row", { name: /E2E Tamara/ });
  // E9 €48.30 + E10 €49.00 + E11 €40.00.
  await expect(tamara).toContainText("288,00 €");
  await expect(tamara).toContainText("137,30 €");
  await expect(tamara).toContainText("150,70 €");

  const julija = page.getByRole("row", { name: /E2E Julija/ });
  // E12: the payment counts as revenue, the shares do not exist.
  await expect(julija).toContainText("100,00 €");
  await expect(julija).toContainText("nije definisano");

  // The detail lists each payment with its own split.
  await page.getByRole("link", { name: "E2E Tamara" }).click();
  await expect(page.getByText("Uplate trenera — E2E Tamara")).toBeVisible();
  await expect(page.getByRole("cell", { name: "48,30 €" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "49,00 €" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "40,00 €" })).toBeVisible();
});

test("US-18.1 and BR-133: the owner records an expense on a past day", async ({
  page,
}) => {
  await signIn(page, owner);
  await page.goto("/finance/expenses?period=month");

  await page.getByRole("button", { name: "Novi trošak" }).click();
  // The filter row carries the same labels, so the form is addressed through its dialog.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel("Kategorija", { exact: true })
    .selectOption({ label: "E2E Struja" });
  await dialog.getByLabel("Opis").fill("E2E struja za prošli mjesec");
  await dialog.getByLabel("Iznos (€)").fill("123,45");
  await dialog.getByLabel("Način", { exact: true }).selectOption("card");
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();

  await expect(page.getByText("Trošak je sačuvan.")).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "E2E struja za prošli mjesec" }),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: "123,45 €" })).toBeVisible();
});

test("Flow 10: a manager and a receptionist cannot open any finance page", async ({
  page,
}) => {
  for (const staff of [manager, receptionist]) {
    await signIn(page, staff);
    for (const path of [
      "/finance",
      "/finance/expenses",
      "/finance/trainers",
      "/finance/shifts",
      "/finance/storage",
      "/finance/audit",
      "/finance/backdated",
    ]) {
      await page.goto(path);
      await expect(
        page.getByText("404", { exact: false }).first(),
        `${staff.identifier} on ${path}`,
      ).toBeVisible();
      // BR-157: no figure of doc 03 §14 reaches the page at all.
      await expect(page.locator("body")).not.toContainText("€");
    }
  }
});
