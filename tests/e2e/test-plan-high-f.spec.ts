import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// TEST_PLAN.md §3, priority Visoko, group F (owner finance): FIN-01, FIN-03, FIN-07,
// FIN-08, FIN-10, FIN-11, FIN-12, FIN-14, FIN-15, FIN-16. One synthetic gym (D-56),
// serial: the desk's sales of the first test are what the owner's screens then show.
test.describe.configure({ mode: "serial" });

const PASSWORD = "visokoFlozinka1";
const ZONE = "Europe/Podgorica";

let gymId: string;
const staff = {} as Record<"owner" | "ana", TestStaff>;
const plan = { mjesecna: "", grupni: "", gt: "", personalni: "" };
const trainer = { tamara: "", julija: "" };
const member: Record<string, string> = {};
const category = { plate: "", kirija: "" };

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
  gymId = await createTestGym(`${workerInfo.project.name}-visf-${suffix()}`);
  staff.owner = await createTestStaff(gymId, {
    role: "owner",
    fullName: "E2E Vlasnik F",
    password: PASSWORD,
  });
  staff.ana = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Ana F",
    password: PASSWORD,
  });
  const admin = adminClient();
  const trainers = await must(
    admin
      .from("trainers")
      .insert([
        { gym_id: gymId, full_name: "E2E Tamara" },
        { gym_id: gymId, full_name: "E2E Julija" },
      ])
      .select("id, full_name")
      .returns<{ id: string; full_name: string }[]>(),
    "Test trainers",
  );
  trainer.tamara = trainers.find((t) => t.full_name === "E2E Tamara")!.id;
  trainer.julija = trainers.find((t) => t.full_name === "E2E Julija")!.id;
  await must(
    admin
      .from("trainer_finance")
      .insert([
        { trainer_id: trainer.tamara, gym_id: gymId, personal_gym_fee: 20 },
        // OQ-1: Julija's fee is not defined.
        { trainer_id: trainer.julija, gym_id: gymId, personal_gym_fee: null },
      ])
      .select("trainer_id"),
    "Test trainer finance",
  );
  const programs = await must(
    admin
      .from("programs")
      .insert([
        { gym_id: gymId, name: "E2E Grupni trening", kind: "group" },
        { gym_id: gymId, name: "E2E Personalni trening", kind: "personal" },
      ])
      .select("id, kind")
      .returns<{ id: string; kind: string }[]>(),
    "Test programs",
  );
  await must(
    admin
      .from("trainer_programs")
      .insert(
        programs.flatMap((p) =>
          [trainer.tamara, trainer.julija].map((trainer_id) => ({
            gym_id: gymId,
            trainer_id,
            program_id: p.id,
          })),
        ),
      )
      .select("trainer_id"),
    "Test assignments",
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
        { ...base, name: "E2E G+T", kind: "combo", price: 99, covers_gym: true, covers_group: true, requires_trainer: true, sort_order: 3 },
        { ...base, name: "E2E Personalni", kind: "personal", price: null, covers_personal: true, requires_trainer: true, sort_order: 4 },
        { ...base, duration_value: null, duration_unit: null, name: "E2E Dnevna karta", kind: "day_pass", price: 10, covers_gym: true, sort_order: 5 },
      ])
      .select("id, name")
      .returns<{ id: string; name: string }[]>(),
    "Test plans",
  );
  const p = (name: string) => plans.find((row) => row.name === name)!.id;
  plan.mjesecna = p("E2E Mjesečna");
  plan.grupni = p("E2E Grupni");
  plan.gt = p("E2E G+T");
  plan.personalni = p("E2E Personalni");
  await must(
    admin
      .from("plan_finance")
      .insert(
        plans.map((row) => ({
          plan_id: row.id,
          gym_id: gymId,
          trainer_share_pct:
            row.name === "E2E Grupni" ? 70 : row.name === "E2E G+T" ? 100 : null,
          gym_fixed_amount: row.name === "E2E G+T" ? 40 : 0,
        })),
      )
      .select("plan_id"),
    "Test plan finance",
  );
  const names = ["Mjesečni", "Grupni", "Kombinovani", "Personalni", "Ističe", "Neplatiša", "Naknadni"];
  const created = await must(
    admin
      .from("members")
      .insert(
        names.map((name, index) => ({
          gym_id: gymId,
          member_number: index + 1,
          first_name: `E2E ${name}`,
          last_name: "Finansije",
          phone: `+3826780100${index}`,
          email: `visf-${index}@e2e.invalid`,
          date_of_birth: "1990-01-01",
          created_by: staff.owner.id,
        })),
      )
      .select("id, member_number")
      .returns<{ id: string; member_number: number }[]>(),
    "Test members",
  );
  names.forEach((name, index) => {
    member[name] = created.find((m) => m.member_number === index + 1)!.id;
  });
  await must(
    admin
      .from("member_counters")
      .insert({ gym_id: gymId, last_number: names.length })
      .select("gym_id"),
    "Test member counter",
  );
  // FIN-03: one membership ending in three days, one member with an unpaid visit.
  await must(
    admin
      .from("memberships")
      .insert({
        gym_id: gymId,
        member_id: member["Ističe"],
        plan_id: plan.mjesecna,
        start_date: gymDate(-27).iso,
        end_date: gymDate(3).iso,
        start_reason: "E2E",
        covers_gym: true,
        covers_group: false,
        covers_personal: false,
        is_backdated: true,
        created_by: staff.owner.id,
      })
      .select("id"),
    "Test expiring membership",
  );
  const twoDaysAgo = Date.now() - 2 * 86_400_000;
  await must(
    admin
      .from("visits")
      .insert({
        gym_id: gymId,
        member_id: member["Neplatiša"],
        visit_type: "gym",
        is_unpaid: true,
        is_backdated: true,
        checked_in_at: new Date(twoDaysAgo).toISOString(),
        checked_out_at: new Date(twoDaysAgo + 3_600_000).toISOString(),
        checked_in_by: staff.owner.id,
      })
      .select("id"),
    "Test unpaid visit",
  );
  const categories = await must(
    admin
      .from("expense_categories")
      .insert([
        { gym_id: gymId, name: "E2E Plate", is_salary: true },
        { gym_id: gymId, name: "E2E Kirija", is_salary: false },
      ])
      .select("id, name")
      .returns<{ id: string; name: string }[]>(),
    "Test categories",
  );
  category.plate = categories.find((c) => c.name === "E2E Plate")!.id;
  category.kirija = categories.find((c) => c.name === "E2E Kirija")!.id;
});

test.afterAll(async ({}, workerInfo) => {
  if (workerInfo.project.name === "desktop") await deleteTestGym(gymId);
});

async function signIn(page: Page, who: TestStaff) {
  await page.goto("/login");
  await page.getByLabel("Korisničko ime ili email").fill(who.identifier);
  await page.getByLabel("Lozinka", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** Clicks until a hydrated control reacts: a click before hydration does nothing. */
async function clickUntil(button: Locator, visible: Locator) {
  await expect(async () => {
    await button.click({ timeout: 2_000 });
    await expect(visible).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

async function sell(
  page: Page,
  memberId: string,
  planId: string,
  options: {
    trainer?: string;
    amount?: string;
    sessions?: string;
    method: "Gotovina" | "Platna kartica";
  },
) {
  await page.goto(`/members/${memberId}`);
  const dialog = page.getByRole("dialog");
  await clickUntil(
    page.getByRole("button", { name: "Nova članarina" }),
    dialog.getByLabel("Vrsta članarine"),
  );
  await dialog.getByLabel("Vrsta članarine").selectOption(planId);
  if (options.trainer)
    await dialog.getByLabel("Trener").selectOption(options.trainer);
  if (options.sessions)
    await dialog.getByLabel("Broj termina").fill(options.sessions);
  if (options.amount)
    await dialog.getByRole("textbox", { name: "Iznos (€)" }).fill(options.amount);
  await dialog.getByText(options.method, { exact: true }).click();
  await dialog.getByRole("button", { name: "Naplati i sačuvaj" }).click();
  await expect(page.getByText("Članarina sačuvana.").first()).toBeVisible();
}

/** A stat tile's value on S-16. */
async function tile(page: Page, label: string): Promise<string> {
  const box = page
    .locator("p", { hasText: new RegExp(`^${label}$`) })
    .first()
    .locator("xpath=..");
  return ((await box.textContent()) ?? "").replace(label, "").trim();
}

function section(page: Page, title: string): Locator {
  return page.locator("section", {
    has: page.getByRole("heading", { name: title, exact: true }),
  });
}

/** The open shift's expected cash on S-19. */
async function openExpected(page: Page): Promise<string> {
  await page.goto("/finance/shifts");
  const text = await page
    .getByText(/^Očekivano: /)
    .first()
    .innerText();
  return text.replace("Očekivano: ", "").trim();
}

test("the desk's day: four sales and a voided day pass (data for the owner's screens)", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page, staff.ana);
  await sell(page, member["Mjesečni"], plan.mjesecna, { method: "Gotovina" });
  await sell(page, member["Grupni"], plan.grupni, {
    trainer: trainer.tamara,
    method: "Platna kartica",
  });
  await sell(page, member["Kombinovani"], plan.gt, {
    trainer: trainer.tamara,
    method: "Platna kartica",
  });
  await sell(page, member["Personalni"], plan.personalni, {
    trainer: trainer.julija,
    sessions: "8",
    amount: "100",
    method: "Gotovina",
  });
  await page.goto("/reception");
  await page
    .getByRole("button", { name: "Počni rad" })
    .click({ timeout: 3_000 })
    .catch(() => {});
  const pass = page.getByRole("dialog");
  await clickUntil(
    page.getByRole("button", { name: "Dnevna karta" }),
    pass.getByRole("button", { name: "Naplati" }),
  );
  await pass.getByText("Gotovina", { exact: true }).click();
  await pass.getByRole("button", { name: "Naplati" }).click();
  await expect(pass).toBeHidden();
  await page.goto("/payments/today");
  const voiding = page.getByRole("dialog");
  await clickUntil(
    page.getByRole("button", { name: "Poništi Dnevna karta × 1" }),
    voiding.getByLabel("Razlog"),
  );
  await voiding.getByLabel("Razlog").fill("E2E greška");
  await voiding.getByRole("button", { name: "Poništi" }).click();
  await expect(page.getByText("Stavka je poništena.").first()).toBeVisible();
});

test("FIN-01 and FIN-03: periods in the address, tiles and breakdowns that add up", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page, staff.owner);
  const seen: Record<string, string> = {};
  await page.goto("/finance");
  for (const preset of ["today", "week", "month", "last_month", "year"]) {
    await expect(async () => {
      await page.getByLabel("Period").selectOption(preset);
      await expect(page).toHaveURL(new RegExp(`period=${preset}`), {
        timeout: 2_000,
      });
    }).toPass();
    // The address carries the period, so a reload shows the same one.
    await page.reload();
    await expect(page.getByLabel("Period")).toHaveValue(preset);
    seen[preset] = await tile(page, "Prihod");
  }
  await page.getByLabel("Period").selectOption("custom");
  await page.locator("#from").fill(gymDate(-1).iso);
  await page.locator("#to").fill(gymDate(0).iso);
  await page.getByRole("button", { name: "Prikaži" }).click();
  await expect(page).toHaveURL(
    new RegExp(`period=custom&from=${gymDate(-1).iso}&to=${gymDate(0).iso}`),
  );
  await page.reload();
  seen.custom = await tile(page, "Prihod");
  console.log(`[note] FIN-01 Prihod per period: ${JSON.stringify(seen)}`);
  // 79 + 69 + 99 + 100; the voided day pass is not counted.
  expect(seen.today).toBe("347,00 €");
  expect(seen.week).toBe("347,00 €");
  expect(seen.month).toBe("347,00 €");
  expect(seen.year).toBe("347,00 €");
  expect(seen.custom).toBe("347,00 €");
  expect(seen.last_month).toBe("0,00 €");
  for (const label of ["Troškovi", "Profit", "Zarada na magacinu", "Aktivni članovi"])
    await expect(
      page.locator("p", { hasText: new RegExp(`^${label}$`) }).first(),
      label,
    ).toBeVisible();

  // FIN-03, today.
  await page.goto("/finance?period=today");
  const byPlan = await section(page, "Prihod po vrsti članarine").innerText();
  const byMethod = await section(page, "Prihod po načinu plaćanja").innerText();
  const byCategory = await section(page, "Troškovi po kategoriji").innerText();
  console.log(
    `[note] FIN-03 by plan: ${byPlan.replace(/\s+/g, " ")} | by method: ${byMethod.replace(/\s+/g, " ")} | by category: ${byCategory.replace(/\s+/g, " ")}`,
  );
  for (const amount of ["79,00 €", "69,00 €", "99,00 €", "100,00 €"])
    expect(byPlan).toContain(amount);
  expect(byPlan).not.toContain("Dnevna karta");
  expect(byMethod).toContain("179,00 €");
  expect(byMethod).toContain("168,00 €");
  expect(byCategory).toContain("Nema podataka za izabrani period.");
  const expiring = section(page, "Ističe u narednih 7 dana");
  await expect(expiring).toContainText("E2E Ističe Finansije");
  await expect(expiring).toContainText(gymDate(3).display);
  const unpaid = section(page, "Članovi sa neplaćenim dolascima");
  await expect(unpaid).toContainText("E2E Neplatiša Finansije");
  await unpaid.getByRole("link", { name: /E2E Neplatiša/ }).click();
  await expect(page).toHaveURL(new RegExp(`/members/${member["Neplatiša"]}`));
  await page.goto("/finance");
  await expiring.getByRole("link", { name: /E2E Ističe/ }).click();
  await expect(page).toHaveURL(new RegExp(`/members/${member["Ističe"]}`));

  await page.goto("/finance?period=last_month");
  await expect(
    section(page, "Prihod po vrsti članarine"),
  ).toContainText("Nema podataka za izabrani period.");
  await expect(
    section(page, "Prihod po načinu plaćanja"),
  ).toContainText("Nema podataka za izabrani period.");
});

test("FIN-08 and FIN-07: the trainer field only for salaries; a till expense with a shift", async ({
  page,
}) => {
  await signIn(page, staff.owner);
  const before = await openExpected(page);
  await page.goto("/finance/expenses?period=month");
  const dialog = page.getByRole("dialog");
  await clickUntil(
    page.getByRole("button", { name: "Novi trošak" }),
    dialog.getByLabel("Kategorija", { exact: true }),
  );
  // FIN-08
  const kind = dialog.getByLabel("Kategorija", { exact: true });
  await kind.selectOption(category.plate);
  await expect(dialog.getByLabel("Trener")).toBeVisible();
  await kind.selectOption(category.kirija);
  await expect(dialog.getByLabel("Trener")).toHaveCount(0);
  // A trainer sent with Kirija anyway (a forged form) is refused (BR-133).
  await dialog.getByLabel("Opis").fill("E2E krivotvoren trener");
  await dialog.getByLabel("Iznos (€)").fill("5");
  await dialog.locator("form").evaluate((form, id) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "trainerId";
    input.value = id;
    form.appendChild(input);
  }, trainer.tamara);
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  const messages = page.locator("[data-sonner-toast], .text-danger");
  await expect.poll(async () => (await messages.allInnerTexts()).join(" / ")).not.toBe("");
  const refused = (await messages.allInnerTexts()).join(" / ");
  console.log(`[note] FIN-08 forged trainer with Kirija → ${refused}`);
  expect(refused).not.toContain("Trošak je sačuvan.");
  const { count } = await adminClient()
    .from("expenses")
    .select("id", { count: "exact", head: true })
    .eq("gym_id", gymId)
    .eq("description", "E2E krivotvoren trener");
  expect(count).toBe(0);

  // FIN-07, with Ana's shift open.
  await page.goto("/finance/expenses?period=month");
  await clickUntil(
    page.getByRole("button", { name: "Novi trošak" }),
    dialog.getByLabel("Kategorija", { exact: true }),
  );
  await dialog.getByLabel("Kategorija", { exact: true }).selectOption(category.kirija);
  await expect(dialog.locator("#expense-date")).toBeVisible();
  await expect(dialog.locator("#expense-method")).toBeVisible();
  await dialog.getByLabel("Iz kase").check();
  await expect(
    dialog.getByText(
      "Datum se postavlja na danas, način na gotovinu, i traži otvorenu smjenu.",
    ),
  ).toBeVisible();
  const dateGone = (await dialog.locator("#expense-date").count()) === 0;
  const dateLocked =
    !dateGone &&
    ((await dialog.locator("#expense-date").isDisabled()) ||
      (await dialog.locator("#expense-date").getAttribute("readonly")) !== null);
  console.log(
    `[note] FIN-07 with the box: date ${dateGone ? "hidden" : dateLocked ? "locked" : "EDITABLE"}`,
  );
  expect(dateGone || dateLocked).toBe(true);
  await expect(dialog.locator("#expense-date")).toHaveValue(gymDate(0).iso);
  await expect(dialog.locator("#expense-method")).toBeDisabled();
  await expect(dialog.locator("#expense-method")).toHaveValue("cash");
  await dialog.getByLabel("Opis").fill("E2E iz kase vlasnik");
  await dialog.getByLabel("Iznos (€)").fill("20");
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Trošak je sačuvan.").first()).toBeVisible();
  const { data } = await adminClient()
    .from("expenses")
    .select("method, paid_from_till, spent_on, shift_id")
    .eq("gym_id", gymId)
    .eq("description", "E2E iz kase vlasnik")
    .single<{
      method: string;
      paid_from_till: boolean;
      spent_on: string;
      shift_id: string | null;
    }>();
  expect(data?.method).toBe("cash");
  expect(data?.paid_from_till).toBe(true);
  expect(data?.spent_on).toBe(gymDate(0).iso);
  expect(data?.shift_id).not.toBeNull();
  const after = await openExpected(page);
  console.log(`[note] FIN-07 open shift expected: ${before} → ${after}`);
  expect(before).toBe("179,00 €");
  expect(after).toBe("159,00 €");
});

test("FIN-10: voiding the owner's expense needs a reason and leaves the totals", async ({
  page,
}) => {
  await signIn(page, staff.owner);
  await page.goto("/finance?period=month");
  expect(await tile(page, "Troškovi")).toBe("20,00 €");
  await page.goto("/finance/expenses?period=month");
  await expect(page.getByText("Ukupno: 20,00 €")).toBeVisible();
  const row = page.getByRole("row", { name: /E2E iz kase vlasnik/ });
  const dialog = page.getByRole("dialog");
  await clickUntil(
    row.getByRole("button", { name: "Poništi" }),
    dialog.getByLabel("Razlog"),
  );
  await dialog.getByLabel("Razlog").fill("ab");
  await dialog.getByRole("button", { name: "Poništi" }).click();
  await expect(
    dialog.getByText("Unesite razlog (3–200 znakova).").first(),
  ).toBeVisible();
  await dialog.getByLabel("Razlog").fill("Duplirana faktura");
  await dialog.getByRole("button", { name: "Poništi" }).click();
  await expect(dialog).toBeHidden();
  const toast = await page.locator("[data-sonner-toast]").allInnerTexts();
  console.log(`[note] FIN-10 after the void: toast ${JSON.stringify(toast)}`);
  await expect(row).toContainText("Poništeno: Duplirana faktura");
  // BR-095 (N-19): struck through, like every other voided record.
  await expect(row).toHaveClass(/line-through/);
  await expect(row.getByRole("button", { name: "Poništi" })).toHaveCount(0);
  await expect(page.getByText("Ukupno: 0,00 €")).toBeVisible();
  await expect(page.getByText("Poništeni troškovi nisu uračunati.")).toBeVisible();
  await page.goto("/finance?period=month");
  expect(await tile(page, "Troškovi")).toBe("0,00 €");
  expect(await openExpected(page)).toBe("179,00 €");
});

test("FIN-11: trainers — columns, undefined fee, detail, payout and an empty month", async ({
  page,
}) => {
  await signIn(page, staff.owner);
  await page.goto(`/finance/trainers?month=${gymDate(0).month}`);
  await expect(page.getByRole("columnheader").first()).toBeVisible();
  const headers = (await page.getByRole("columnheader").allInnerTexts()).map(
    (h) => h.trim(),
  );
  for (const column of [
    "Klijenti",
    "Održani grupni treninzi",
    "Personalni treninzi",
    "Prihod",
    "Za trenera (za isplatu)",
    "Za teretanu",
    "Isplaćeno",
    "Razlika",
  ])
    expect(headers, column).toContain(column);
  const tamara = page.getByRole("row", { name: /E2E Tamara/ });
  const julija = page.getByRole("row", { name: /E2E Julija/ });
  console.log(
    `[note] FIN-11 rows: ${(await tamara.innerText()).replace(/\s+/g, " ")} || ${(await julija.innerText()).replace(/\s+/g, " ")}`,
  );
  await expect(julija).toContainText("nije definisano");
  await page.getByRole("link", { name: "E2E Julija" }).click();
  const julijaDetail = section(page, "Uplate trenera — E2E Julija");
  await expect(julijaDetail).toContainText("E2E Personalni Finansije");
  await expect(julijaDetail).toContainText("nije definisano");
  await page.getByRole("link", { name: "E2E Tamara" }).click();
  await expect(section(page, "Uplate trenera — E2E Tamara")).toContainText(
    "E2E Kombinovani Finansije",
  );

  await tamara.getByRole("link", { name: "Evidentiraj isplatu" }).click();
  await expect(page).toHaveURL(/\/finance\/expenses\?payoutTrainer=/);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Kategorija", { exact: true })).toHaveValue(
    category.plate,
  );
  await expect(dialog.getByLabel("Trener")).toHaveValue(trainer.tamara);
  // N-20: the difference, with a decimal comma.
  await expect(dialog.getByLabel("Iznos (€)")).toHaveValue("107,30");
  await expect(dialog.getByLabel("Opis")).toHaveValue("Evidentiraj isplatu");

  await page.goto(
    `/finance/trainers?month=${gymDate(-400).month}&trainer=${trainer.tamara}`,
  );
  await expect(page.getByLabel("Mjesec")).toBeVisible();
  await expect(page.getByText("Učitavanje…")).toHaveCount(0);
  const empty = await page.locator("main").innerText();
  console.log(
    `[note] FIN-11 empty month: ${empty.includes("Nema uplata za izabrani mjesec.") ? "message shown" : "no message"} | ${empty.replace(/\s+/g, " ").slice(0, 400)}`,
  );
  expect(empty).toContain("Nema uplata za izabrani mjesec.");
});

test("FIN-12: shifts — the open one, closing it, columns, PDF, resending, an empty period", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page, staff.owner);
  await page.goto("/finance/shifts");
  await expect(page.getByText("Otvorena smjena").first()).toBeVisible();
  await expect(page.getByText(/E2E Ana F ·/)).toBeVisible();
  const dialog = page.getByRole("dialog");
  await clickUntil(
    page.getByRole("button", { name: "Zaključi smjenu" }),
    dialog.getByLabel("Prebrojana gotovina (€)"),
  );
  await expect(dialog.getByText("Ostavite prazno ako niste brojali.")).toBeVisible();
  await dialog.getByRole("button", { name: "Zaključi smjenu" }).click();
  await expect(page.getByText("Smjena je zaključena.").first()).toBeVisible();
  // The owner's own session goes on.
  await page.goto("/finance/shifts");
  await expect(page).toHaveURL(/\/finance\/shifts/);
  await expect(page.getByRole("columnheader").first()).toBeVisible();
  await expect(page.getByText("Otvorena smjena")).toHaveCount(0);
  const headers = (await page.getByRole("columnheader").allInnerTexts()).map(
    (h) => h.trim(),
  );
  console.log(`[note] FIN-12 columns: ${headers.join(" | ")}`);
  for (const column of [
    "Recepcioner",
    "Početak",
    "Kraj",
    "Način zaključenja",
    "Gotovina",
    "Kartica",
    "Očekivano",
    "Prebrojano",
    "Razlika",
    "Email",
  ])
    expect(headers, column).toContain(column);
  const row = page.getByRole("row", { name: /E2E Ana F/ });
  await expect(async () => {
    await page.reload();
    await expect(row.getByRole("link", { name: "PDF" })).toBeVisible({
      timeout: 2_000,
    });
    await expect(row).toContainText("neuspješno", { timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  console.log(`[note] FIN-12 row: ${(await row.innerText()).replace(/\s+/g, " ")}`);
  await expect(row).toContainText("Zaključio/la");
  const href = await row.getByRole("link", { name: "PDF" }).getAttribute("href");
  const response = await page.request.get(href!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/pdf");
  await row.getByRole("button", { name: "Pošalji ponovo" }).click();
  await expect(
    page.getByText("Slanje nije uspjelo. Pokušajte ponovo.").first(),
  ).toBeVisible({ timeout: 30_000 });
  await page.goto("/finance/shifts?period=last_month");
  await expect(page.getByText("Nema smjena u izabranom periodu.")).toBeVisible();
});

test("FIN-07 without a shift: a till expense is refused", async ({ page }) => {
  await signIn(page, staff.owner);
  await page.goto("/finance/expenses?period=month");
  const dialog = page.getByRole("dialog");
  await clickUntil(
    page.getByRole("button", { name: "Novi trošak" }),
    dialog.getByLabel("Kategorija", { exact: true }),
  );
  await dialog.getByLabel("Kategorija", { exact: true }).selectOption(category.kirija);
  await dialog.getByLabel("Iz kase").check();
  await dialog.getByLabel("Opis").fill("E2E iz kase bez smjene");
  await dialog.getByLabel("Iznos (€)").fill("20");
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(
    page.getByText("Nema otvorene smjene. Recepcioner mora biti prijavljen.").first(),
  ).toBeVisible();
  // With the box off, the same expense is an ordinary one, not paid from the till.
  await dialog.getByLabel("Iz kase").uncheck();
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Trošak je sačuvan.").first()).toBeVisible();
  const { data } = await adminClient()
    .from("expenses")
    .select("paid_from_till, shift_id")
    .eq("gym_id", gymId)
    .eq("description", "E2E iz kase bez smjene")
    .single<{ paid_from_till: boolean; shift_id: string | null }>();
  expect(data?.paid_from_till).toBe(false);
  expect(data?.shift_id).toBeNull();
});

test("FIN-14: the audit log — actions, changes, filters, the 200 cap, an empty period", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page, staff.owner);
  // An edit of a member, so the day has an "Izmjena" as well.
  await page.goto(`/members/${member["Mjesečni"]}`);
  const edit = page.getByRole("dialog");
  await clickUntil(
    page.getByRole("button", { name: "Uredi podatke" }),
    edit.getByLabel("Datum rođenja", { exact: true }),
  );
  await edit.getByLabel("Datum rođenja", { exact: true }).fill("15.03.1995");
  await edit.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(edit).toBeHidden();
  await page.goto("/finance/audit?period=today");
  const main = page.locator("main");
  await expect(main.locator("tbody tr").first()).toBeVisible({ timeout: 20_000 });
  const text = await main.innerText();
  const actions = ["Unos", "Izmjena", "Poništeno", "Anonimizacija"].filter((a) =>
    text.includes(a),
  );
  console.log(`[note] FIN-14 actions seen today: ${actions.join(", ")}`);
  expect(actions).toEqual(expect.arrayContaining(["Unos", "Izmjena", "Poništeno"]));
  expect(text).toContain("→");
  const change = main.locator("tbody tr", { hasText: "Izmjena" }).first();
  console.log(
    `[note] FIN-14 an edit: ${(await change.innerText()).replace(/\s+/g, " ")}`,
  );
  await expect(change).toContainText("1995");
  expect(text).toContain("E2E Ana F");
  expect(text).toContain("E2E Vlasnik F");

  const insert = main.locator("tbody tr", { hasText: "Unos" }).first();
  console.log(
    `[note] FIN-14 an insert: ${(await insert.innerText()).replace(/\s+/g, " ")}`,
  );

  // Filter by user, then by record type.
  await page.getByLabel("Korisnik").selectOption({ label: "E2E Ana F" });
  await page.getByRole("button", { name: "Prikaži" }).last().click();
  await expect(page).toHaveURL(/user=/);
  await expect(main.locator("tbody tr").first()).toBeVisible();
  const users = await main.locator("tbody tr td:nth-child(2)").allInnerTexts();
  expect(new Set(users.map((u) => u.trim()))).toEqual(new Set(["E2E Ana F"]));
  const tables = await page.getByLabel("Stavka").locator("option").allInnerTexts();
  console.log(`[note] FIN-14 record types: ${tables.join(", ")}`);
  await page.getByLabel("Stavka").selectOption({ label: "Troškovi" });
  await page.getByLabel("Korisnik").selectOption({ label: "Svi korisnici" });
  await page.getByRole("button", { name: "Prikaži" }).last().click();
  await expect(page).toHaveURL(/table=expenses/);
  await expect(main.locator("tbody tr").first()).toBeVisible();
  const kinds = await main.locator("tbody tr td:nth-child(4)").allInnerTexts();
  expect(new Set(kinds.map((k) => k.trim()))).toEqual(new Set(["Troškovi"]));
  const voidRow = main.locator("tbody tr", { hasText: "Poništeno" }).first();
  console.log(
    `[note] FIN-14 a void entry: ${(await voidRow.innerText()).replace(/\s+/g, " ")}`,
  );

  // More than 200 entries in one day: the first 200 and the note.
  const day = "2025-06-10";
  await must(
    adminClient()
      .from("audit_log")
      .insert(
        Array.from({ length: 205 }, (_, index) => ({
          gym_id: gymId,
          table_name: "expenses",
          row_id: `e2e-${index}`,
          action: "update",
          old_data: { description: "E2E staro" },
          new_data: { description: "E2E novo" },
          changed_by: staff.owner.id,
          changed_at: `${day}T10:${String(index % 60).padStart(2, "0")}:00Z`,
        })),
      )
      .select("id"),
    "Test audit entries",
  );
  await page.goto(`/finance/audit?period=custom&from=${day}&to=${day}`);
  await expect(main.locator("tbody tr")).toHaveCount(200);
  await expect(
    page.getByText("Prikazano je prvih 200 izmjena. Suzite period da vidite ostale."),
  ).toBeVisible();

  await page.goto("/finance/audit?period=last_month");
  await expect(page.getByText("Nema izmjena u izabranom periodu.")).toBeVisible();
});

test("FIN-14 (N-18): a winter day's audit entries are those of that local day", async ({
  page,
}) => {
  // 15.01.2026 is CET (UTC+1): its local day runs from 14.01 23:00 to 15.01 23:00 UTC.
  await must(
    adminClient()
      .from("audit_log")
      .insert(
        [
          "2026-01-14T22:30:00Z", // 14.01 23:30 local — the day before
          "2026-01-14T23:30:00Z", // 15.01 00:30 local
          "2026-01-15T22:30:00Z", // 15.01 23:30 local
        ].map((changed_at, index) => ({
          gym_id: gymId,
          table_name: "expenses",
          row_id: `e2e-winter-${index}`,
          action: "update",
          old_data: { description: "E2E zima staro" },
          new_data: { description: "E2E zima novo" },
          changed_by: staff.owner.id,
          changed_at,
        })),
      )
      .select("id"),
    "Winter audit entries",
  );
  await signIn(page, staff.owner);
  await page.goto("/finance/audit?period=custom&from=2026-01-15&to=2026-01-15");
  await expect(
    page.locator("main tbody tr").or(page.getByText("Nema izmjena u izabranom periodu.")).first(),
  ).toBeVisible();
  const times = (
    await page.locator("main tbody tr td:first-child").allInnerTexts()
  ).map((t) => t.trim());
  console.log(`[note] N-18 15.01.2026 shows: ${JSON.stringify(times)}`);
  expect(times).toEqual(["15.01.2026 23:30", "15.01.2026 00:30"]);
});

async function pickMember(page: Page, name: string) {
  await page.getByLabel("Član", { exact: true }).fill(name);
  await page.getByRole("button", { name: new RegExp(name) }).first().click();
}

/** "saved", or the messages the form shows. */
async function outcome(page: Page): Promise<string> {
  const main = page.locator("main");
  const saved = page.getByText("Naknadni unos je sačuvan.");
  await expect
    .poll(
      async () =>
        (await saved.count()) > 0 ||
        (await main.locator(".text-danger").count()) > 0 ||
        (await page.locator("[data-sonner-toast]").count()) > 0,
      { timeout: 15_000 },
    )
    .toBe(true);
  if ((await saved.count()) > 0) return "saved";
  return [
    ...(await main.locator(".text-danger").allInnerTexts()),
    ...(await page.locator("[data-sonner-toast]").allInnerTexts()),
  ].join(" / ");
}

test("FIN-15 and FIN-16: back-dated visit, membership, day passes and card fee", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signIn(page, staff.owner);
  const fresh = async (tab: string) => {
    await page.goto("/finance/backdated");
    await expect(page.getByText("Naknadni unos – ne ulazi u smjenu.")).toBeVisible();
    await expect(async () => {
      await page.getByRole("tab", { name: tab }).click({ timeout: 2_000 });
      await expect(page.getByRole("tab", { name: tab })).toHaveAttribute(
        "aria-selected",
        "true",
        { timeout: 1_000 },
      );
    }).toPass();
  };

  // FIN-15
  const visit = async (date: string, out: string) => {
    await fresh("Dolazak");
    await pickMember(page, "E2E Naknadni");
    await page.locator("#visit-date").fill(date);
    await page.getByLabel("Vrijeme ulaska").fill("18:00");
    await page.getByLabel("Vrijeme izlaska").fill(out);
    await expect(page.getByLabel("Vrsta dolaska")).toHaveValue("gym");
    await page.getByRole("button", { name: "Sačuvaj" }).click();
    return outcome(page);
  };
  expect(await visit(gymDate(-1).iso, "19:30")).toBe("saved");
  expect(await visit(gymDate(-1).iso, "17:00")).toContain(
    "Vrijeme izlaska mora biti poslije vremena ulaska.",
  );
  const future = await visit(gymDate(1).iso, "19:30");
  console.log(`[note] FIN-15 tomorrow → ${future}`);
  expect(future).not.toBe("saved");
  const { data: visits } = await adminClient()
    .from("visits")
    .select("checked_in_at, checked_out_at, is_backdated, shift_id, is_unpaid")
    .eq("member_id", member["Naknadni"]);
  console.log(`[note] FIN-15 visits: ${JSON.stringify(visits)}`);
  expect(visits).toHaveLength(1);
  expect(visits?.[0].is_backdated).toBe(true);
  expect(visits?.[0].shift_id).toBeNull();
  await page.goto(`/members/${member["Naknadni"]}?tab=dolasci`);
  await expect(page.locator("main")).toContainText(gymDate(-1).display);
  await expect(page.locator("main")).toContainText("18:00");

  // FIN-16.1: a membership paid last month, the start left empty.
  const lastMonth = `${gymDate(-40).month}-15`;
  await fresh("Članarina");
  await expect(
    page.getByText("Ostavite prazno da se izračuna po pravilima (BR-052)."),
  ).toBeVisible();
  await pickMember(page, "E2E Naknadni");
  await page.locator("#planId").selectOption(plan.mjesecna);
  await page.locator("#paidOn").fill(lastMonth);
  await page.locator("#method").selectOption("cash");
  await page.getByRole("button", { name: "Sačuvaj" }).click();
  expect(await outcome(page)).toBe("saved");

  // FIN-16.2: day passes, 0 and 21 refused, 2 saved.
  for (const quantity of ["0", "21"]) {
    await fresh("Dnevne karte");
    await page.locator("#quantity").fill(quantity);
    await page.locator("#dp-paidOn").fill(gymDate(-1).iso);
    await page.getByRole("button", { name: "Sačuvaj" }).click();
    expect(await outcome(page), quantity).toContain("Unesite broj između 1 i 20.");
  }
  await fresh("Dnevne karte");
  await page.locator("#quantity").fill("2");
  await page.locator("#dp-paidOn").fill(gymDate(-1).iso);
  await page.getByRole("button", { name: "Sačuvaj" }).click();
  expect(await outcome(page)).toBe("saved");

  // FIN-16.3: a replacement card fee, cash, yesterday.
  await fresh("Zamjenska kartica");
  await pickMember(page, "E2E Naknadni");
  await page.locator("#method").selectOption("cash");
  await page.locator("#cf-paidOn").fill(gymDate(-1).iso);
  await page.getByRole("button", { name: "Sačuvaj" }).click();
  expect(await outcome(page)).toBe("saved");

  // None of them belongs to a shift; the membership's start follows BR-052.
  const admin = adminClient();
  const { data: payments } = await admin
    .from("payments")
    .select("kind, quantity, amount, shift_id, paid_on")
    .eq("gym_id", gymId)
    .eq("is_backdated", true)
    .returns<
      {
        kind: string;
        quantity: number;
        amount: string;
        shift_id: string | null;
        paid_on: string;
      }[]
    >();
  const { data: membership } = await admin
    .from("memberships")
    .select("start_date, end_date, start_reason, shift_id")
    .eq("member_id", member["Naknadni"])
    .single<{
      start_date: string;
      end_date: string;
      start_reason: string;
      shift_id: string | null;
    }>();
  console.log(
    `[note] FIN-16 payments: ${JSON.stringify(payments)} | membership: ${JSON.stringify(membership)}`,
  );
  expect(payments?.map((p) => p.kind).sort()).toEqual([
    "card_replacement",
    "day_pass",
    "membership",
  ]);
  for (const row of payments ?? []) expect(row.shift_id).toBeNull();
  expect(membership?.shift_id).toBeNull();

  // Not among today's desk items; visible in finance, marked "Naknadno" on the profile.
  await page.goto("/payments/today");
  await expect(page.locator("main")).not.toContainText("E2E Naknadni");
  await page.goto(`/finance?period=custom&from=${lastMonth}&to=${lastMonth}`);
  expect(await tile(page, "Prihod")).toBe("79,00 €");
  await page.goto(`/members/${member["Naknadni"]}?tab=uplate`);
  await expect(
    page.locator("main tbody tr", { hasText: "Naknadno" }),
  ).toHaveCount(2);
  await page.goto(`/members/${member["Naknadni"]}?tab=clanarine`);
  await expect(page.locator("main").getByText("Naknadno")).toBeVisible();
});
