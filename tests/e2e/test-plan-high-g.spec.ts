import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// TEST_PLAN.md §3, priority Visoko, the last group: E2E-05, E2E-06, STAT-05, E2E-04 and
// UX-03. One synthetic gym (D-56), serial: the desk's sales of the first test are what
// the owner's month then shows.
test.describe.configure({ mode: "serial" });

const PASSWORD = "visokoGlozinka1";
const ZONE = "Europe/Podgorica";

let gymId: string;
const staff = {} as Record<"admin" | "owner" | "ana", TestStaff>;
const plan = { mjesecna: "", grupni: "" };
let tamara: string;
const member: Record<string, { id: string; number: number }> = {};
const category = { plate: "", kirija: "", struja: "" };
const card = { old: "", fresh: "" };

function gymDate(days: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map(({ type, value }) => [type, value]),
  );
  const date = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  const iso = date.toISOString().slice(0, 10);
  const [y, m, d] = iso.split("-");
  return { iso, display: `${d}.${m}.${y}`, month: iso.slice(0, 7) };
}

function code(): string {
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

test.beforeAll(async ({}, workerInfo) => {
  test.skip(workerInfo.project.name !== "desktop");
  gymId = await createTestGym(`${workerInfo.project.name}-visg-${suffix()}`);
  for (const [key, role, name] of [
    ["admin", "admin", "E2E Admin G"],
    ["owner", "owner", "E2E Vlasnik G"],
    ["ana", "receptionist", "E2E Ana G"],
  ] as const)
    staff[key] = await createTestStaff(gymId, {
      role,
      fullName: name,
      password: PASSWORD,
    });
  const admin = adminClient();
  tamara = (
    await must(
      admin
        .from("trainers")
        .insert({ gym_id: gymId, full_name: "E2E Tamara G" })
        .select("id")
        .single<{ id: string }>(),
      "Test trainer",
    )
  ).id;
  await must(
    admin
      .from("trainer_finance")
      .insert({ trainer_id: tamara, gym_id: gymId, personal_gym_fee: 20 })
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
      .insert({ gym_id: gymId, trainer_id: tamara, program_id: program.id })
      .select("trainer_id"),
    "Test assignment",
  );
  const base = {
    gym_id: gymId,
    duration_value: 1,
    duration_unit: "month",
    covers_gym: false,
    covers_group: false,
    covers_personal: false,
    requires_trainer: false,
  };
  const plans = await must(
    admin
      .from("plans")
      .insert([
        { ...base, name: "E2E Mjesečna", kind: "gym", price: 79, covers_gym: true, sort_order: 1 },
        { ...base, name: "E2E Grupni", kind: "group", price: 69, covers_group: true, requires_trainer: true, sort_order: 2 },
        { ...base, duration_value: null, duration_unit: null, name: "E2E Dnevna karta", kind: "day_pass", price: 10, covers_gym: true, sort_order: 3 },
      ])
      .select("id, name")
      .returns<{ id: string; name: string }[]>(),
    "Test plans",
  );
  plan.mjesecna = plans.find((p) => p.name === "E2E Mjesečna")!.id;
  plan.grupni = plans.find((p) => p.name === "E2E Grupni")!.id;
  await must(
    admin
      .from("plan_finance")
      .insert(
        plans.map((p) => ({
          plan_id: p.id,
          gym_id: gymId,
          trainer_share_pct: p.name === "E2E Grupni" ? 70 : null,
        })),
      )
      .select("plan_id"),
    "Test plan finance",
  );
  const names = [
    ["Kupac", "Mjesečni"],
    ["Kupac", "Grupni"],
    ["Zaboravljeni", "Naknadni"],
    ["Kartica", "Gubitnik"],
    ["Česti", "Anonimni"],
    ["Drugi", "Posjetilac"],
    ["Treći", "Posjetilac"],
  ];
  const created = await must(
    admin
      .from("members")
      .insert(
        names.map(([first, last], index) => ({
          gym_id: gymId,
          member_number: index + 1,
          first_name: `E2E ${first}`,
          last_name: last,
          phone: `+3826790200${index}`,
          email: `visg-${index}@e2e.invalid`,
          date_of_birth: "1990-01-01",
          created_by: staff.owner.id,
        })),
      )
      .select("id, member_number")
      .returns<{ id: string; member_number: number }[]>(),
    "Test members",
  );
  for (const [index, [first]] of names.entries()) {
    const key = index === 1 ? "KupacGrupni" : first;
    member[key] = {
      id: created.find((m) => m.member_number === index + 1)!.id,
      number: index + 1,
    };
  }
  await must(
    admin
      .from("member_counters")
      .insert({ gym_id: gymId, last_number: names.length })
      .select("gym_id"),
    "Test member counter",
  );
  // E2E-06: the member who loses a card has a valid membership and an active card.
  await must(
    admin
      .from("memberships")
      .insert({
        gym_id: gymId,
        member_id: member.Kartica.id,
        plan_id: plan.mjesecna,
        start_date: gymDate(-5).iso,
        end_date: gymDate(25).iso,
        start_reason: "E2E",
        covers_gym: true,
        covers_group: false,
        covers_personal: false,
        is_backdated: true,
        created_by: staff.owner.id,
      })
      .select("id"),
    "Test membership",
  );
  const batch = await must(
    admin
      .from("card_batches")
      .insert({ gym_id: gymId, quantity: 2, created_by: staff.owner.id })
      .select("id")
      .single<{ id: string }>(),
    "Test batch",
  );
  card.old = code();
  card.fresh = code();
  await must(
    admin
      .from("cards")
      .insert([
        {
          gym_id: gymId,
          code: card.old,
          batch_id: batch.id,
          status: "active",
          member_id: member.Kartica.id,
          assigned_at: new Date().toISOString(),
        },
        {
          gym_id: gymId,
          code: card.fresh,
          batch_id: batch.id,
          status: "unassigned",
          member_id: null,
          assigned_at: null,
        },
      ])
      .select("id"),
    "Test cards",
  );
  // STAT-05: six visits of the member who will be anonymized, two and one of others.
  const visits = [
    ...Array.from({ length: 6 }, (_, i) => [member.Česti.id, i + 1] as const),
    ...[1, 2].map((i) => [member.Drugi.id, i] as const),
    [member.Treći.id, 1] as const,
  ].map(([memberId, daysAgo]) => {
    const at = Date.now() - daysAgo * 86_400_000;
    return {
      gym_id: gymId,
      member_id: memberId,
      visit_type: "gym",
      is_unpaid: true,
      is_backdated: true,
      checked_in_at: new Date(at).toISOString(),
      checked_out_at: new Date(at + 3_600_000).toISOString(),
      checked_in_by: staff.owner.id,
    };
  });
  await must(admin.from("visits").insert(visits).select("id"), "Test visits");
  const categories = await must(
    admin
      .from("expense_categories")
      .insert([
        { gym_id: gymId, name: "E2E Plate", is_salary: true },
        { gym_id: gymId, name: "E2E Kirija", is_salary: false },
        { gym_id: gymId, name: "E2E Struja", is_salary: false },
      ])
      .select("id, name")
      .returns<{ id: string; name: string }[]>(),
    "Test categories",
  );
  category.plate = categories.find((c) => c.name === "E2E Plate")!.id;
  category.kirija = categories.find((c) => c.name === "E2E Kirija")!.id;
  category.struja = categories.find((c) => c.name === "E2E Struja")!.id;
});

test.afterAll(async ({}, workerInfo) => {
  if (workerInfo.project.name === "desktop") await deleteTestGym(gymId);
});

async function signIn(page: Page, identifier: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Korisničko ime ili email").fill(identifier);
  await page.getByLabel("Lozinka", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function clickUntil(button: Locator, visible: Locator) {
  await expect(async () => {
    await button.click({ timeout: 2_000 });
    await expect(visible).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

async function startWork(page: Page) {
  await page
    .getByRole("button", { name: "Počni rad" })
    .click({ timeout: 3_000 })
    .catch(() => {});
}

async function scan(page: Page, value: string) {
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await page.keyboard.type(value);
  await page.keyboard.press("Enter");
}

/** "1.234,56 €" → 123456 cents. */
function cents(text: string): number {
  const clean = text.replace(/[^\d,-]/g, "");
  const [whole, fraction = "0"] = clean.split(",");
  const sign = whole.startsWith("-") ? -1 : 1;
  return sign * (Math.abs(Number(whole)) * 100 + Number(fraction.padEnd(2, "0")));
}

async function tile(page: Page, label: string): Promise<number> {
  const box = page
    .locator("p", { hasText: new RegExp(`^${label}$`) })
    .first()
    .locator("xpath=..");
  await expect(box).toBeVisible();
  return cents(((await box.textContent()) ?? "").replace(label, ""));
}

async function sell(
  page: Page,
  memberId: string,
  planId: string,
  method: "Gotovina" | "Platna kartica",
  trainer?: string,
) {
  await page.goto(`/members/${memberId}`);
  const dialog = page.getByRole("dialog");
  await clickUntil(
    page.getByRole("button", { name: "Nova članarina" }),
    dialog.getByLabel("Vrsta članarine"),
  );
  await dialog.getByLabel("Vrsta članarine").selectOption(planId);
  if (trainer) await dialog.getByLabel("Trener").selectOption(trainer);
  await dialog.getByText(method, { exact: true }).click();
  await dialog.getByRole("button", { name: "Naplati i sačuvaj" }).click();
  await expect(page.getByText("Članarina sačuvana.").first()).toBeVisible();
}

async function newExpense(
  page: Page,
  values: { category: string; description: string; amount: string },
) {
  await page.goto("/finance/expenses?period=month");
  const dialog = page.getByRole("dialog");
  await clickUntil(
    page.getByRole("button", { name: "Novi trošak" }),
    dialog.getByLabel("Kategorija", { exact: true }),
  );
  await dialog.getByLabel("Kategorija", { exact: true }).selectOption(values.category);
  await dialog.getByLabel("Opis").fill(values.description);
  await dialog.getByLabel("Iznos (€)").fill(values.amount);
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Trošak je sačuvan.").first()).toBeVisible();
}

test("the desk's sales of the month (data for E2E-05)", async ({ page }) => {
  await signIn(page, staff.ana.identifier);
  await sell(page, member.Kupac.id, plan.mjesecna, "Gotovina");
  await sell(page, member.KupacGrupni.id, plan.grupni, "Platna kartica", tamara);
});

test("E2E-05: the owner's month — expenses, a payout, the audit and a back-dated sale", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signIn(page, staff.owner.identifier);
  await page.goto("/finance?period=month");
  const before = {
    income: await tile(page, "Prihod"),
    expenses: await tile(page, "Troškovi"),
    profit: await tile(page, "Profit"),
  };
  console.log(`[note] E2E-05 before: ${JSON.stringify(before)}`);
  expect(before.income).toBe(14_800);

  // 2. Rent and electricity; 3. Tamara's payout from S-18.
  await newExpense(page, { category: category.kirija, description: "E2E Kirija mjesec", amount: "300" });
  await newExpense(page, { category: category.struja, description: "E2E Struja mjesec", amount: "45,50" });
  await page.goto(`/finance/trainers?month=${gymDate(0).month}`);
  const row = page.getByRole("row", { name: /E2E Tamara G/ });
  await expect(row).toContainText("48,30 €");
  await row.getByRole("link", { name: "Evidentiraj isplatu" }).click();
  const payout = page.getByRole("dialog");
  await expect(payout.getByLabel("Iznos (€)")).toHaveValue("48,30");
  await payout.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Trošak je sačuvan.").first()).toBeVisible();
  await page.goto(`/finance/trainers?month=${gymDate(0).month}`);
  await expect(page.getByRole("row", { name: /E2E Tamara G/ })).toContainText(
    /48,30 €\s*0,00 €/,
  );

  // 4. Expenses up and profit down by exactly 300 + 45,50 + 48,30 = 393,80.
  await page.goto("/finance?period=month");
  const after = {
    income: await tile(page, "Prihod"),
    expenses: await tile(page, "Troškovi"),
    profit: await tile(page, "Profit"),
  };
  console.log(`[note] E2E-05 after the expenses: ${JSON.stringify(after)}`);
  expect(after.income).toBe(before.income);
  expect(after.expenses - before.expenses).toBe(39_380);
  expect(before.profit - after.profit).toBe(39_380);

  // 5. The audit log has all three, with the owner's name.
  await page.goto("/finance/audit?period=today&table=expenses");
  const main = page.locator("main");
  await expect(main.locator("tbody tr").first()).toBeVisible();
  const entries = main.locator("tbody tr", { hasText: "E2E Vlasnik G" });
  await expect(entries).toHaveCount(3);
  for (const text of ["E2E Kirija mjesec", "E2E Struja mjesec", "Evidentiraj isplatu"])
    await expect(main).toContainText(text);

  // 6. A membership sale forgotten three days ago; 7. income up by it.
  const forgotten = gymDate(-3);
  const monthStart = `${gymDate(0).month}-01`;
  const range = `/finance?period=custom&from=${forgotten.iso < monthStart ? forgotten.iso : monthStart}&to=${gymDate(0).iso}`;
  await page.goto(range);
  const incomeBefore = await tile(page, "Prihod");
  await page.goto("/finance/backdated");
  await expect(async () => {
    await page.getByRole("tab", { name: "Članarina" }).click({ timeout: 2_000 });
    await expect(page.locator("#planId")).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await page.getByLabel("Član", { exact: true }).fill("E2E Zaboravljeni");
  await page.getByRole("button", { name: /E2E Zaboravljeni/ }).first().click();
  await page.locator("#planId").selectOption(plan.mjesecna);
  await page.locator("#paidOn").fill(forgotten.iso);
  await page.locator("#method").selectOption("cash");
  await page.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Naknadni unos je sačuvan.").first()).toBeVisible();
  await page.goto(range);
  expect((await tile(page, "Prihod")) - incomeBefore).toBe(7_900);
  const { data } = await adminClient()
    .from("payments")
    .select("shift_id, is_backdated, paid_on")
    .eq("member_id", member.Zaboravljeni.id)
    .single<{ shift_id: string | null; is_backdated: boolean; paid_on: string }>();
  expect(data).toEqual({ shift_id: null, is_backdated: true, paid_on: forgotten.iso });
  await page.goto(`/members/${member.Zaboravljeni.id}?tab=uplate`);
  await expect(page.locator("main tbody tr", { hasText: "Naknadno" })).toHaveCount(1);
});

test("E2E-06: a lost card — search, fee, new card; the old one refused, the new one works", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page, staff.ana.identifier);
  // 2. Found by search, then the profile.
  await page.goto("/members");
  await page.getByLabel("Pretraga člana (ime, telefon, broj)").fill("Gubitnik");
  // The search goes into the address after a short pause; a click before that is undone.
  await expect(page).toHaveURL(/q=Gubitnik/);
  await expect(page.getByRole("link", { name: /E2E Kupac/ })).toHaveCount(0);
  await page.getByRole("link", { name: /E2E Kartica Gubitnik/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`/members/${member.Kartica.id}`));
  const dialog = page.getByRole("dialog");
  await clickUntil(
    page.getByRole("button", { name: "Izgubljena kartica" }),
    dialog.getByText("Naknada za novu karticu: 5,00 €"),
  );
  await dialog.getByText("Gotovina", { exact: true }).click();
  await dialog.getByRole("button", { name: "Nastavi" }).click();
  const field = dialog.getByLabel("Skenirajte novu praznu karticu");
  await field.fill(card.fresh);
  await field.press("Enter");
  await expect(
    page.getByText("Nova kartica dodijeljena. Stara kartica je poništena.").first(),
  ).toBeVisible();

  // 3. The old card; 4. the new one.
  await page.goto("/reception");
  await startWork(page);
  await scan(page, card.old);
  await expect(
    page.getByRole("status").getByText("Kartica je poništena. Pronađite člana pretragom."),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await scan(page, card.fresh);
  const covered = page.locator("[data-result=covered]");
  await expect(covered).toBeVisible();
  await expect(covered).toContainText("E2E Kartica Gubitnik");

  // 5. Today's payments and the shift.
  await page.goto("/payments/today");
  await expect(
    page.getByText(`Zamjenska kartica – #${member.Kartica.number} E2E Kartica Gubitnik`).first(),
  ).toBeVisible();
  await page.goto("/shift/close");
  // The shift's cash is the 79,00 € membership of the first test plus the 5,00 € fee.
  const summary = page.locator("main");
  await expect(summary).toContainText(/Gotovina \(prihod\)\s*84,00 €/);
  await expect(summary).toContainText("Uplate: 3");
  await page.getByRole("button", { name: "Pregledaj stavke" }).click();
  const items = (await summary.innerText()).replace(/\s+/g, " ");
  console.log(`[note] E2E-06 shift items: ${items.match(/Zamjensk.{0,120}/)?.[0]}`);
  expect(items).toMatch(/Zamjensk.{0,120}5,00 €/);
});

test("STAT-05: an anonymized member's visits count, but not in the top list", async ({
  page,
}) => {
  await signIn(page, staff.owner.identifier);
  await page.goto(`/members/${member.Česti.id}`);
  const dialog = page.getByRole("dialog");
  await clickUntil(
    page.getByRole("button", { name: "Anonimiziraj" }),
    dialog.getByLabel("Broj člana"),
  );
  await dialog.getByLabel("Broj člana").fill(String(member.Česti.number));
  await dialog.getByRole("button", { name: "Anonimiziraj trajno" }).click();
  await expect(page.getByText("Član je anonimiziran.").first()).toBeVisible();

  const from = gymDate(-10).iso;
  const to = gymDate(0).iso;
  const { count } = await adminClient()
    .from("visits")
    .select("id", { count: "exact", head: true })
    .eq("gym_id", gymId);
  await page.goto(`/stats/visits?period=custom&from=${from}&to=${to}`);
  const total = page
    .locator("p", { hasText: /^Ukupno dolazaka$/ })
    .locator("xpath=following-sibling::p");
  await expect(total).toBeVisible();
  console.log(`[note] STAT-05 total ${await total.innerText()} (visits in the gym: ${count})`);
  expect(Number(await total.innerText())).toBe(count);
  const top = page.locator("section", {
    has: page.getByRole("heading", { name: "Najčešći članovi" }),
  });
  const rows = (await top.locator("tbody tr").allInnerTexts()).map((r) =>
    r.replace(/\s+/g, " ").trim(),
  );
  console.log(`[note] STAT-05 top: ${JSON.stringify(rows)}`);
  expect(rows.some((r) => r.startsWith(`#${member.Česti.number} `))).toBe(false);
  expect(rows).toContain(`#${member.Drugi.number} E2E Drugi Posjetilac 2`);
});

test("E2E-04: a new employee from creation to deactivation", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const login = `e2e.novi.${suffix().slice(0, 6)}`.toLowerCase();
  const TEMPORARY = "privremena123";
  const CHOSEN = "mojaLozinka123";
  const RESET = "vlasnikova456";
  const FINAL = "konacnaLozinka789";

  // 1. The owner creates the receptionist.
  await signIn(page, staff.owner.identifier);
  await page.goto("/settings/users");
  const create = page.getByRole("dialog");
  await clickUntil(
    page.getByRole("button", { name: "Novi korisnik" }),
    create.getByLabel("Uloga"),
  );
  await create.getByLabel("Uloga").selectOption("receptionist");
  await create.getByLabel("Ime i prezime").fill("E2E Novi Radnik");
  await create.getByLabel("Korisničko ime").fill(login);
  await create.getByLabel("Privremena lozinka").fill(TEMPORARY);
  await create.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Korisnik je kreiran.").first()).toBeVisible();
  const { data: created } = await adminClient()
    .from("staff")
    .select("id")
    .eq("gym_id", gymId)
    .eq("username", login)
    .single<{ id: string }>();
  const newId = created!.id;

  // 2. First sign-in: the password first, then S-02 (Ana's shift is open) and his own shift.
  const second = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const worker = await second.newPage();
  await signIn(worker, login, TEMPORARY);
  await expect(worker).toHaveURL(/\/change-password/);
  await worker.goto("/reception");
  await expect(worker).toHaveURL(/\/change-password/);
  await worker.getByLabel("Nova lozinka", { exact: true }).fill(CHOSEN);
  await worker.getByLabel("Ponovi lozinku").fill(CHOSEN);
  await worker.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(worker).toHaveURL(/\/shift\/gate/, { timeout: 15_000 });
  await expect(worker.getByText(/Otvorena je smjena: E2E Ana G/)).toBeVisible();
  await worker.getByRole("button", { name: "Preuzmi smjenu" }).click();
  await expect(worker).toHaveURL(/\/reception/, { timeout: 15_000 });
  const { data: shift } = await adminClient()
    .from("shifts")
    .select("staff_id")
    .eq("gym_id", gymId)
    .is("closed_at", null)
    .single<{ staff_id: string }>();
  expect(shift?.staff_id).toBe(newId);

  // 3. A day pass.
  await startWork(worker);
  const pass = worker.getByRole("dialog");
  await clickUntil(
    worker.getByRole("button", { name: "Dnevna karta" }),
    pass.getByRole("button", { name: "Naplati" }),
  );
  await pass.getByText("Gotovina", { exact: true }).click();
  await pass.getByRole("button", { name: "Naplati" }).click();
  await expect(pass).toBeHidden();
  await worker.goto("/payments/today");
  await expect(worker.locator("main")).toContainText("Dnevna karta × 1");

  // 4. The admin reads the password he chose.
  const third = await browser.newContext();
  const adminPage = await third.newPage();
  await signIn(adminPage, staff.admin.identifier);
  await adminPage.goto("/settings/users");
  const adminRow = adminPage.getByRole("row", { name: /E2E Novi Radnik/ });
  await adminRow.getByRole("button", { name: "Prikaži" }).click();
  await expect(adminRow.getByText(CHOSEN)).toBeVisible();
  await third.close();

  // 5. The owner sets a new one; his next sign-in asks for a change again.
  await page.goto("/settings/users");
  const ownerRow = page.getByRole("row", { name: /E2E Novi Radnik/ });
  const reset = page.getByRole("dialog");
  await clickUntil(
    ownerRow.getByRole("button", { name: "Nova lozinka" }),
    reset.getByLabel("Privremena lozinka"),
  );
  await reset.getByLabel("Privremena lozinka").fill(RESET);
  await reset.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Nova lozinka je postavljena.").first()).toBeVisible();
  const fourth = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const again = await fourth.newPage();
  await signIn(again, login, RESET);
  await expect(again).toHaveURL(/\/change-password/);
  await again.getByLabel("Nova lozinka", { exact: true }).fill(FINAL);
  await again.getByLabel("Ponovi lozinku").fill(FINAL);
  await again.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(again).toHaveURL(/\/reception/, { timeout: 15_000 });
  await fourth.close();

  // 6. Deactivated while signed in: out on the next click, the shift stays open.
  await page.reload();
  await page
    .getByRole("row", { name: /E2E Novi Radnik/ })
    .getByRole("button", { name: "Deaktiviraj" })
    .click();
  await expect(page.getByText("Korisnik je deaktiviran.").first()).toBeVisible();
  await worker.getByRole("link", { name: "Članovi" }).first().click();
  await expect(worker).toHaveURL(/\/login/, { timeout: 15_000 });
  const { data: still } = await adminClient()
    .from("shifts")
    .select("staff_id, closed_at")
    .eq("gym_id", gymId)
    .eq("staff_id", newId)
    .single<{ staff_id: string; closed_at: string | null }>();
  expect(still?.closed_at).toBeNull();
  await second.close();
});

test("UX-03: a failed request shows our message and [Pokušaj ponovo], never English", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const english = /Application error|Server Action|Body exceeded|Unhandled|TypeError|Failed to fetch|NetworkError|Internal Server Error/i;
  await signIn(page, staff.owner.identifier);

  // The server does not answer an action (a stopped server, a lost connection).
  await page.goto("/finance/expenses?period=month");
  const dialog = page.getByRole("dialog");
  await clickUntil(
    page.getByRole("button", { name: "Novi trošak" }),
    dialog.getByLabel("Kategorija", { exact: true }),
  );
  await dialog.getByLabel("Kategorija", { exact: true }).selectOption(category.kirija);
  await dialog.getByLabel("Opis").fill("E2E bez servera");
  await dialog.getByLabel("Iznos (€)").fill("1");
  await page.route("**/*", (route) =>
    route.request().method() === "POST" && route.request().headers()["next-action"]
      ? route.abort("connectionrefused")
      : route.continue(),
  );
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Došlo je do greške. Pokušajte ponovo.")).toBeVisible();
  const retry = page.getByRole("button", { name: "Pokušaj ponovo" });
  await expect(retry).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(english);
  console.log(
    `[note] UX-03 aborted action: ${(await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 160)}`,
  );
  await page.unroute("**/*");
  await retry.click();
  await expect(page.getByRole("button", { name: "Novi trošak" })).toBeVisible();

  // An action the server does not know (a deployment changed under an open tab).
  await page.goto("/finance/expenses?period=month");
  await clickUntil(
    page.getByRole("button", { name: "Novi trošak" }),
    dialog.getByLabel("Kategorija", { exact: true }),
  );
  await dialog.getByLabel("Kategorija", { exact: true }).selectOption(category.kirija);
  await dialog.getByLabel("Opis").fill("E2E nepoznata radnja");
  await dialog.getByLabel("Iznos (€)").fill("1");
  await page.route("**/*", (route) => {
    const headers = route.request().headers();
    if (route.request().method() === "POST" && headers["next-action"])
      return route.continue({
        headers: { ...headers, "next-action": "0".repeat(42) },
      });
    return route.continue();
  });
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Došlo je do greške. Pokušajte ponovo.")).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(english);
  await page.unroute("**/*");

  // The sign-in screen has its own boundary.
  const context = await page.context().browser()!.newContext();
  const login = await context.newPage();
  await login.goto("/login");
  await login.route("**/*", (route) =>
    route.request().method() === "POST"
      ? route.abort("connectionrefused")
      : route.continue(),
  );
  await login.getByLabel("Korisničko ime ili email").fill(staff.ana.identifier);
  await login.getByLabel("Lozinka", { exact: true }).fill(PASSWORD);
  await login.getByRole("button", { name: "Prijavi se" }).click();
  await expect(login.getByText("Došlo je do greške. Pokušajte ponovo.")).toBeVisible();
  await expect(login.getByRole("button", { name: "Pokušaj ponovo" })).toBeVisible();
  expect(await login.locator("body").innerText()).not.toMatch(english);
  await context.close();

  const { count } = await adminClient()
    .from("expenses")
    .select("id", { count: "exact", head: true })
    .eq("gym_id", gymId)
    .in("description", ["E2E bez servera", "E2E nepoznata radnja"]);
  expect(count).toBe(0);
});
