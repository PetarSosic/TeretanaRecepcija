import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// TEST_PLAN.md §3, priority Visoko, group C (memberships and desk money): MSHIP-05,
// MSHIP-09, MSHIP-10, MSHIP-12, MSHIP-13, MSHIP-14, MSHIP-17, PAY-02, PAY-03, PAY-06,
// PAY-07, PAY-14. One synthetic gym (D-56), serial, one receptionist shift throughout.
test.describe.configure({ mode: "serial" });

const PASSWORD = "visokoClozinka1";
const ZONE = "Europe/Podgorica";

let gymId: string;
const staff = {} as Record<"owner" | "ana", TestStaff>;
const plan = { mjesecna: "", personalni: "", dvanaest: "" };
const member = { buyer: "", counted: "" };
let countedCard: string;
let julija: string;
const category = { potrosni: "", plate: "" };

function gymDate(days: number): string {
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
  test.skip(workerInfo.project.name !== "desktop");
  gymId = await createTestGym(`${workerInfo.project.name}-visc-${suffix()}`);
  staff.owner = await createTestStaff(gymId, {
    role: "owner",
    fullName: "E2E Vlasnik C",
    password: PASSWORD,
  });
  staff.ana = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Ana C",
    password: PASSWORD,
  });
  const admin = adminClient();
  julija = (
    await must(
      admin
        .from("trainers")
        .insert({ gym_id: gymId, full_name: "E2E Julija" })
        .select("id")
        .single<{ id: string }>(),
      "Test trainer",
    )
  ).id;
  await must(
    admin
      .from("trainer_finance")
      .insert({ trainer_id: julija, gym_id: gymId, personal_gym_fee: 80 })
      .select("trainer_id"),
    "Test trainer finance",
  );
  const program = await must(
    admin
      .from("programs")
      .insert({ gym_id: gymId, name: "E2E Personalni", kind: "personal" })
      .select("id")
      .single<{ id: string }>(),
    "Test program",
  );
  await must(
    admin
      .from("trainer_programs")
      .insert({ gym_id: gymId, trainer_id: julija, program_id: program.id })
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
    gym_visit_limit: null,
    requires_trainer: false,
  };
  const plans = await must(
    admin
      .from("plans")
      .insert([
        {
          ...base,
          name: "E2E Mjesečna",
          kind: "gym",
          price: 79,
          covers_gym: true,
          sort_order: 1,
        },
        {
          ...base,
          name: "E2E Personalni",
          kind: "personal",
          price: null,
          covers_personal: true,
          requires_trainer: true,
          sort_order: 2,
        },
        {
          ...base,
          name: "E2E Mjesečna 12 termina",
          kind: "gym",
          price: 49,
          covers_gym: true,
          gym_visit_limit: 12,
          sort_order: 3,
        },
        {
          ...base,
          duration_value: null,
          duration_unit: null,
          name: "E2E Dnevna karta",
          kind: "day_pass",
          price: 10,
          covers_gym: true,
          sort_order: 4,
        },
      ])
      .select("id, name")
      .returns<{ id: string; name: string }[]>(),
    "Test plans",
  );
  const p = (name: string) => plans.find((row) => row.name === name)!.id;
  plan.mjesecna = p("E2E Mjesečna");
  plan.personalni = p("E2E Personalni");
  plan.dvanaest = p("E2E Mjesečna 12 termina");
  await must(
    admin
      .from("plan_finance")
      .insert(plans.map((row) => ({ plan_id: row.id, gym_id: gymId })))
      .select("plan_id"),
    "Test plan finance",
  );
  const members = await must(
    admin
      .from("members")
      .insert(
        [
          ["E2E Kupac", "Prodaje"],
          ["E2E Brojani", "Dolasci"],
        ].map(([first, last], index) => ({
          gym_id: gymId,
          member_number: index + 1,
          first_name: first,
          last_name: last,
          phone: `+3826790000${index}`,
          email: `visc-${index}@e2e.invalid`,
          date_of_birth: "1990-01-01",
          created_by: staff.owner.id,
        })),
      )
      .select("id, member_number")
      .returns<{ id: string; member_number: number }[]>(),
    "Test members",
  );
  member.buyer = members.find((m) => m.member_number === 1)!.id;
  member.counted = members.find((m) => m.member_number === 2)!.id;
  await must(
    admin
      .from("member_counters")
      .insert({ gym_id: gymId, last_number: 2 })
      .select("gym_id"),
    "Test member counter",
  );
  // MSHIP-14: a 12-visit membership with 10 visits already used.
  const counted = await must(
    admin
      .from("memberships")
      .insert({
        gym_id: gymId,
        member_id: member.counted,
        plan_id: plan.dvanaest,
        start_date: gymDate(-15),
        end_date: gymDate(15),
        start_reason: "E2E",
        covers_gym: true,
        covers_group: false,
        covers_personal: false,
        gym_visit_limit: 12,
        is_backdated: true,
        created_by: staff.owner.id,
      })
      .select("id")
      .single<{ id: string }>(),
    "Test counted membership",
  );
  await must(
    admin
      .from("visits")
      .insert(
        Array.from({ length: 10 }, (_, index) => {
          const at = new Date(Date.now() - (index + 2) * 86_400_000);
          return {
            gym_id: gymId,
            member_id: member.counted,
            membership_id: counted.id,
            visit_type: "gym",
            is_backdated: true,
            checked_in_at: at.toISOString(),
            checked_out_at: new Date(at.getTime() + 3_600_000).toISOString(),
            checked_in_by: staff.owner.id,
          };
        }),
      )
      .select("id"),
    "Test used visits",
  );
  const batch = await must(
    admin
      .from("card_batches")
      .insert({ gym_id: gymId, quantity: 1, created_by: staff.owner.id })
      .select("id")
      .single<{ id: string }>(),
    "Test batch",
  );
  countedCard = `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
  await must(
    admin
      .from("cards")
      .insert({
        gym_id: gymId,
        code: countedCard,
        batch_id: batch.id,
        status: "active",
        member_id: member.counted,
        assigned_at: new Date().toISOString(),
      })
      .select("id"),
    "Test card",
  );
  const categories = await must(
    admin
      .from("expense_categories")
      .insert([
        { gym_id: gymId, name: "E2E Potrošni", is_salary: false },
        { gym_id: gymId, name: "E2E Plate", is_salary: true },
      ])
      .select("id, name")
      .returns<{ id: string; name: string }[]>(),
    "Test categories",
  );
  category.potrosni = categories.find((c) => c.name === "E2E Potrošni")!.id;
  category.plate = categories.find((c) => c.name === "E2E Plate")!.id;
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

async function signedIn(browser: Browser, who: TestStaff): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });
  const page = await context.newPage();
  await signIn(page, who);
  return page;
}

async function openSale(page: Page, planId: string): Promise<Locator> {
  await page.goto(`/members/${member.buyer}`);
  await page.getByRole("button", { name: "Nova članarina" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Vrsta članarine").selectOption(planId);
  return dialog;
}

async function membershipCount(memberId: string) {
  const { count } = await adminClient()
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("member_id", memberId)
    .eq("is_backdated", false);
  return count ?? 0;
}

const notes: string[] = [];
function note(text: string) {
  notes.push(text);
  console.log(`[note] ${text}`);
}

test("MSHIP-05 and MSHIP-13: only the owner moves the start, and month ends are right", async ({
  browser,
}) => {
  const desk = await signedIn(browser, staff.ana);
  const deskSale = await openSale(desk, plan.mjesecna);
  await expect(deskSale.getByLabel("Važi do")).not.toHaveText("—");
  await expect(
    deskSale.getByRole("button", { name: "Promijeni početak" }),
  ).toHaveCount(0);
  await desk.context().close();

  const owner = await signedIn(browser, staff.owner);
  const sale = await openSale(owner, plan.mjesecna);
  await sale.getByRole("button", { name: "Promijeni početak" }).click();
  const start = sale.getByLabel("Početak");
  const until = sale.getByLabel("Važi do");
  // BR-051 and E14: end = start + N calendar months (Postgres), both days included.
  // TEST_PLAN's MSHIP-13 figures (27.02.2027 and so on) disagree with the spec.
  for (const [from, to] of [
    ["01.01.2026", "01.02.2026"],
    ["31.01.2027", "28.02.2027"],
    ["31.01.2028", "29.02.2028"],
    ["31.12.2026", "31.01.2027"],
  ]) {
    await start.fill(from);
    await expect(until, from).toHaveText(to);
    await expect(sale.getByText("Početak je odredio vlasnik.")).toBeVisible();
  }
  await start.fill("32.13.2026");
  await sale.getByText("Gotovina", { exact: true }).click();
  await sale.getByRole("button", { name: "Naplati i sačuvaj" }).click();
  await expect(
    sale.getByText("Unesite datum u formatu dd.mm.gggg.").first(),
  ).toBeVisible();
  expect(await membershipCount(member.buyer)).toBe(0);
  await owner.context().close();
});

test("MSHIP-12: the payment method is required", async ({ page }) => {
  await signIn(page, staff.ana);
  const sale = await openSale(page, plan.mjesecna);
  await sale.getByRole("button", { name: "Naplati i sačuvaj" }).click();
  await expect(
    sale.getByText("Izaberite način plaćanja.").first(),
  ).toBeVisible();
  expect(await membershipCount(member.buyer)).toBe(0);
});

test("MSHIP-09 and MSHIP-10: personal sessions and amount bounds", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signIn(page, staff.ana);
  const SESSIONS = "Unesite broj termina od 1 do 50.";
  const AMOUNT = "Unesite iznos, na primjer 79 ili 79,50.";
  async function attempt(sessions: string, amount: string) {
    const sale = await openSale(page, plan.personalni);
    await sale.getByLabel("Trener").selectOption(julija);
    await sale.getByLabel("Broj termina").fill(sessions);
    await sale.getByRole("textbox", { name: "Iznos (€)" }).fill(amount);
    await sale.getByText("Gotovina", { exact: true }).click();
    const before = await membershipCount(member.buyer);
    await sale.getByRole("button", { name: "Naplati i sačuvaj" }).click();
    await expect
      .poll(
        async () =>
          (await sale.count()) === 0 ||
          (await sale.locator(".text-danger").count()) > 0,
        { timeout: 15_000 },
      )
      .toBe(true);
    const saved = (await membershipCount(member.buyer)) > before;
    const shown = (
      await sale
        .locator(".text-danger")
        .allInnerTexts()
        .catch(() => [])
    ).join(" / ");
    if (await sale.count()) await page.keyboard.press("Escape");
    return { saved, shown };
  }

  for (const sessions of ["0", "51", "2.5", "-3", "abc"]) {
    const result = await attempt(sessions, "100");
    expect(result.saved, sessions).toBe(false);
    expect(result.shown, sessions).toContain(SESSIONS);
  }
  for (const sessions of ["1", "50"])
    expect((await attempt(sessions, "100")).saved, sessions).toBe(true);

  for (const amount of ["100,50", "100.50"])
    expect((await attempt("8", amount)).saved, amount).toBe(true);
  for (const amount of ["100,555", "-100", "abc", ""]) {
    const result = await attempt("8", amount);
    expect(result.saved, amount).toBe(false);
    expect(result.shown, amount).toContain(AMOUNT);
  }
  const zero = await attempt("8", "0");
  note(`MSHIP-10 "0" → ${zero.shown}`);
  expect(zero.saved).toBe(false);
  expect(zero.shown).toContain("Iznos ne može biti manji od 80,00 €.");
  const huge = await attempt("8", "999999999");
  note(`MSHIP-10 "999999999" → ${huge.shown}`);
  expect(huge.saved).toBe(false);
  expect(huge.shown).not.toBe("");
  expect(huge.shown).not.toContain("Došlo je do greške");
});

test("MSHIP-14: the visit counter runs down, then Iskorištena and an unpaid visit", async ({
  page,
}) => {
  await signIn(page, staff.ana);
  await page.goto("/reception");
  await page
    .getByRole("button", { name: "Počni rad" })
    .click({ timeout: 3_000 })
    .catch(() => {});
  const scan = async () => {
    await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur(),
    );
    await page.keyboard.type(countedCard);
    await page.keyboard.press("Enter");
  };
  const leave = async () => {
    await adminClient()
      .from("visits")
      .update({
        checked_in_at: new Date(Date.now() - 30 * 60_000).toISOString(),
      })
      .eq("member_id", member.counted)
      .is("checked_out_at", null);
    await page.reload();
    await page
      .getByRole("button", { name: "Počni rad" })
      .click({ timeout: 3_000 })
      .catch(() => {});
    await scan();
    await expect(
      page.getByText(/^Odjavljen\/a: E2E Brojani Dolasci/),
    ).toBeVisible();
  };
  for (const left of [1, 0]) {
    await scan();
    const green = page.locator("[data-result=covered]");
    await expect(green).toBeVisible();
    await expect(green).toContainText(`Teretana: ${left} preostalo`);
    await page.keyboard.press("Escape");
    await leave();
  }
  await page.goto(`/members/${member.counted}`);
  await expect(
    page.getByRole("row", { name: /E2E Mjesečna 12 termina/ }),
  ).toContainText("Iskorištena");
  await page.goto("/reception");
  await page
    .getByRole("button", { name: "Počni rad" })
    .click({ timeout: 3_000 })
    .catch(() => {});
  await scan();
  await expect(page.locator("[data-result=yellow]")).toBeVisible();
});

test("MSHIP-17: a new plan price leaves earlier sales alone", async ({
  page,
}) => {
  await signIn(page, staff.owner);
  let sale = await openSale(page, plan.mjesecna);
  await sale.getByText("Gotovina", { exact: true }).click();
  await sale.getByRole("button", { name: "Naplati i sačuvaj" }).click();
  await expect(page.getByText("Članarina sačuvana.").first()).toBeVisible();

  await page.goto("/settings/plans");
  await expect(
    page.getByText("Promjena cijene važi samo za nove prodaje.").first(),
  ).toBeVisible();
  await page
    .getByRole("row", { name: /^E2E Mjesečna Teretana/ })
    .getByRole("button", { name: "Uredi" })
    .click();
  await page.getByRole("dialog").getByLabel("Cijena (€)").fill("89");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sačuvaj" })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();

  sale = await openSale(page, plan.mjesecna);
  await sale.getByText("Gotovina", { exact: true }).click();
  await sale.getByRole("button", { name: "Naplati i sačuvaj" }).click();
  await expect(page.getByText("Članarina sačuvana.").first()).toBeVisible();
  const { data } = await adminClient()
    .from("payments")
    .select("amount")
    .eq("member_id", member.buyer)
    .eq("plan_id", plan.mjesecna)
    .order("created_at")
    .returns<{ amount: number }[]>();
  expect(data?.map((row) => row.amount)).toEqual([79, 89]);
  await page.goto("/payments/today");
  await expect(
    page.getByRole("cell", { name: "79,00 €" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "89,00 €" }).first(),
  ).toBeVisible();
  await adminClient()
    .from("plans")
    .update({ price: 79 })
    .eq("id", plan.mjesecna);
});

test("PAY-02 and PAY-03: day pass quantity stays in 1–20; a method is required", async ({
  page,
}) => {
  await signIn(page, staff.ana);
  await page.goto("/reception");
  await page
    .getByRole("button", { name: "Počni rad" })
    .click({ timeout: 3_000 })
    .catch(() => {});
  await page.getByRole("button", { name: "Dnevna karta" }).click();
  const dialog = page.getByRole("dialog");
  const quantity = dialog.getByLabel("Broj karata");
  await expect(
    dialog.getByRole("button", { name: "Jedna manje" }),
  ).toBeDisabled();
  const seen: string[] = [];
  for (const typed of ["0", "-1", "21", "abc", "2.5"]) {
    await quantity.fill(typed);
    seen.push(`${typed}→${await quantity.inputValue()}`);
  }
  note(`PAY-02 typed → field: ${seen.join(", ")}`);
  await quantity.fill("21");
  await expect(quantity).toHaveValue("20");
  await expect(
    dialog.getByRole("button", { name: "Jedna više" }),
  ).toBeDisabled();
  await expect(dialog.getByText("Ukupno: 200,00 €")).toBeVisible();
  await quantity.fill("0");
  await expect(quantity).toHaveValue("1");

  // PAY-03
  await dialog.getByRole("button", { name: "Naplati" }).click();
  await expect(
    dialog.getByText("Izaberite način plaćanja.").first(),
  ).toBeVisible();
  const { count } = await adminClient()
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("gym_id", gymId)
    .eq("kind", "day_pass");
  expect(count).toBe(0);
});

test("PAY-06, PAY-07 and PAY-14: desk expense bounds, no salary category, a void", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signIn(page, staff.ana);
  await page.goto("/reception");
  await page
    .getByRole("button", { name: "Počni rad" })
    .click({ timeout: 3_000 })
    .catch(() => {});
  const count = async () =>
    (
      await adminClient()
        .from("expenses")
        .select("id", { count: "exact", head: true })
        .eq("gym_id", gymId)
    ).count ?? 0;
  async function attempt(values: {
    category?: string | null;
    description?: string;
    amount?: string;
  }) {
    await page.getByRole("button", { name: "Trošak" }).click();
    const dialog = page.getByRole("dialog");
    if (values.category !== null)
      await dialog
        .getByLabel("Kategorija")
        .selectOption(values.category ?? category.potrosni);
    await dialog.getByLabel("Opis").fill(values.description ?? "E2E krpe");
    await dialog.getByLabel("Iznos (€)").fill(values.amount ?? "5");
    const before = await count();
    await dialog.getByRole("button", { name: "Sačuvaj" }).click();
    await expect
      .poll(
        async () =>
          (await dialog.count()) === 0 ||
          (await dialog.locator(".text-danger").count()) > 0,
        { timeout: 15_000 },
      )
      .toBe(true);
    const saved = (await count()) > before;
    const shown = (
      await dialog
        .locator(".text-danger")
        .allInnerTexts()
        .catch(() => [])
    ).join(" / ");
    if (await dialog.count()) await page.keyboard.press("Escape");
    return { saved, shown };
  }
  const AMOUNT = "Unesite iznos od 0,01 do 10.000,00 €.";
  const cases: [string, Parameters<typeof attempt>[0], string | "saved"][] = [
    ["bez kategorije", { category: null }, "Izaberite kategoriju."],
    ["opis 1", { description: "a" }, "Unesite opis (2–200 znakova)."],
    [
      "opis 201",
      { description: "o".repeat(201) },
      "Unesite opis (2–200 znakova).",
    ],
    ["iznos 0", { amount: "0" }, AMOUNT],
    ["iznos 0,01", { amount: "0,01" }, "saved"],
    ["iznos 10000", { amount: "10000" }, "saved"],
    ["iznos 10000,01", { amount: "10000,01" }, AMOUNT],
    ["iznos -5", { amount: "-5" }, AMOUNT],
    ["iznos 12,345", { amount: "12,345" }, AMOUNT],
    ["iznos abc", { amount: "abc" }, AMOUNT],
  ];
  for (const [label, values, expected] of cases) {
    const result = await attempt(values);
    if (expected === "saved") expect(result.saved, label).toBe(true);
    else {
      expect(result.saved, label).toBe(false);
      expect(result.shown, label).toContain(expected);
    }
  }

  // PAY-07: no salary category at the desk, and a forged one is refused.
  await page.getByRole("button", { name: "Trošak" }).click();
  const dialog = page.getByRole("dialog");
  const offered = await dialog
    .getByLabel("Kategorija")
    .locator("option")
    .allInnerTexts();
  expect(offered.join("|")).toContain("E2E Potrošni");
  expect(offered.join("|")).not.toContain("E2E Plate");
  await page.route("**/*", async (route: Route) => {
    const request = route.request();
    const body = request.postData() ?? "";
    if (
      request.method() === "POST" &&
      request.headers()["next-action"] &&
      body.includes(category.potrosni)
    )
      return route.continue({
        postData: body.split(category.potrosni).join(category.plate),
      });
    return route.continue();
  });
  await dialog.getByLabel("Kategorija").selectOption(category.potrosni);
  await dialog.getByLabel("Opis").fill("E2E plata na pultu");
  await dialog.getByLabel("Iznos (€)").fill("5");
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(
    page.getByText("Ova kategorija nije dozvoljena.").first(),
  ).toBeVisible();
  await page.unroute("**/*");
  await page.keyboard.press("Escape");

  // PAY-14: the 0,01 € expense is voided and leaves the till expenses.
  await page.goto("/shift/close");
  const till = async () =>
    (
      (await page
        .locator("dt", { hasText: "Troškovi iz kase" })
        .locator("xpath=following-sibling::dd")
        .textContent()) ?? ""
    ).trim();
  expect(await till()).toBe("10.000,01 €");
  await page.goto("/payments/today");
  const row = page.locator("tr", { hasText: "0,01 €" });
  await row.getByRole("button", { name: /^Poništi / }).click();
  const voiding = page.getByRole("dialog");
  await voiding.getByLabel("Razlog").fill("Pogrešan iznos");
  await voiding.getByRole("button", { name: "Poništi" }).click();
  await expect(page.getByText("Stavka je poništena.").first()).toBeVisible();
  await expect(
    page.locator("tr[data-voided=true]", { hasText: "0,01 €" }),
  ).toHaveClass(/line-through/);
  await page.goto("/shift/close");
  expect(await till()).toBe("10.000,00 €");
  console.log(`[note] all: ${notes.join(" | ")}`);
});
