import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// TEST_PLAN.md §3–4, priority Srednje and Nisko, group B: SET-17, UX-05, CARD-04,
// E2E-08, FIN-13, FIN-04, STAT-01, STAT-04, UX-06 and UX-04. One synthetic gym (D-56)
// with a large data set — 230 members and 300 visits this month — so the statistics,
// the member list and the audit log are read with more than a handful of rows. Serial:
// the card of CARD-04 sells the "old price" membership that E2E-08 compares against.
test.describe.configure({ mode: "serial" });

const PASSWORD = "srednjeBlozinka1";
const ZONE = "Europe/Podgorica";
const BULK_MEMBERS = 230;
const BULK_VISITS = 300;

let gymId: string;
const staff = {} as Record<"owner" | "manager" | "ana", TestStaff>;
const plan = { mjesecna: "" };
const member = { stari: "", novi: "" };
let trainerId: string;
let bulk: { id: string; number: number }[] = [];

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
  return { iso, display: `${d}.${m}.${y}`, month: iso.slice(0, 7), day: Number(d) };
}

function gymInstant(date: string, time: string): Date {
  const offset =
    new Intl.DateTimeFormat("en-US", { timeZone: ZONE, timeZoneName: "longOffset" })
      .formatToParts(new Date(`${date}T12:00:00Z`))
      .find((part) => part.type === "timeZoneName")
      ?.value.slice(3) || "+00:00";
  return new Date(`${date}T${time}:00${offset}`);
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

const notes: string[] = [];
function note(text: string) {
  notes.push(text);
  console.log(`[note] ${text}`);
}

test.beforeAll(async ({}, workerInfo) => {
  test.setTimeout(180_000);
  test.skip(workerInfo.project.name !== "desktop");
  gymId = await createTestGym(`${workerInfo.project.name}-srdb-${suffix()}`);
  for (const [key, role, name] of [
    ["owner", "owner", "E2E Vlasnik SB"],
    ["manager", "manager", "E2E Menadžer SB"],
    ["ana", "receptionist", "E2E Ana SB"],
  ] as const)
    staff[key] = await createTestStaff(gymId, {
      role,
      fullName: name,
      password: PASSWORD,
    });
  const admin = adminClient();
  await must(
    admin
      .from("expense_categories")
      .insert([
        { gym_id: gymId, name: "Roba za prodaju", is_system: true, is_salary: false },
        { gym_id: gymId, name: "E2E Potrošni", is_system: false, is_salary: false },
      ])
      .select("id"),
    "Test categories",
  );
  const mjesecna = await must(
    admin
      .from("plans")
      .insert({
        gym_id: gymId,
        name: "E2E Mjesečna",
        kind: "gym",
        price: 79,
        duration_value: 1,
        duration_unit: "month",
        covers_gym: true,
        covers_group: false,
        covers_personal: false,
        requires_trainer: false,
        sort_order: 1,
      })
      .select("id")
      .single<{ id: string }>(),
    "Test plan",
  );
  plan.mjesecna = mjesecna.id;
  await must(
    admin.from("plan_finance").insert({ plan_id: plan.mjesecna, gym_id: gymId }).select("plan_id"),
    "Test plan finance",
  );
  trainerId = (
    await must(
      admin
        .from("trainers")
        .insert({ gym_id: gymId, full_name: "E2E Trener SB" })
        .select("id")
        .single<{ id: string }>(),
      "Test trainer",
    )
  ).id;

  // UX-06: many members (and so many audit entries today), then two named ones.
  const rows = Array.from({ length: BULK_MEMBERS }, (_, index) => ({
    gym_id: gymId,
    member_number: index + 1,
    first_name: "E2E Masovni",
    last_name: `Član${String(index + 1).padStart(3, "0")}`,
    phone: `+382679${String(10_000 + index).padStart(6, "0")}`,
    email: `srdb-${index}@e2e.invalid`,
    date_of_birth: "1990-01-01",
    created_by: staff.owner.id,
  }));
  bulk = await must(
    admin
      .from("members")
      .insert(rows)
      .select("id, member_number")
      .returns<{ id: string; member_number: number }[]>(),
    "Bulk members",
  ).then((list) =>
    list.map((m) => ({ id: m.id, number: m.member_number })).sort((a, b) => a.number - b.number),
  );
  // BR-096 audits members on update only: one change each gives S-21 over 200 entries.
  await must(
    admin
      .from("members")
      .update({ date_of_birth: "1991-01-01" })
      .eq("gym_id", gymId)
      .eq("first_name", "E2E Masovni")
      .select("id"),
    "Bulk member update",
  );
  const named = await must(
    admin
      .from("members")
      .insert(
        [
          ["Stara", "Cijena"],
          ["Novi", "Cjenovnik"],
        ].map(([first, last], index) => ({
          gym_id: gymId,
          member_number: BULK_MEMBERS + index + 1,
          first_name: `E2E ${first}`,
          last_name: last,
          phone: `+38267905${index}00`,
          email: `srdb-named-${index}@e2e.invalid`,
          date_of_birth: "1990-01-01",
          created_by: staff.owner.id,
        })),
      )
      .select("id, member_number")
      .returns<{ id: string; member_number: number }[]>(),
    "Named members",
  );
  member.novi = named.find((m) => m.member_number === BULK_MEMBERS + 2)!.id;
  await must(
    admin
      .from("member_counters")
      .insert({ gym_id: gymId, last_number: BULK_MEMBERS + 2 })
      .select("gym_id"),
    "Test member counter",
  );

  // STAT-01, STAT-04 and UX-06: 300 closed visits this month, before today; every 25th
  // closed by the nightly job (BR-082), a mix of types, 06:00–22:59, a skewed spread of
  // members so the top-ten list has more than ten candidates.
  const today = gymDate(0);
  const days = today.day - 1;
  test.skip(days < 3, "needs a few days of this month behind today");
  const visits = Array.from({ length: BULK_VISITS }, (_, i) => {
    const day = `${today.month}-${String(1 + (i % days)).padStart(2, "0")}`;
    const hour = 6 + ((i * 7) % 17);
    const minute = (i * 13) % 60;
    const start = gymInstant(day, `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    const auto = i % 25 === 0;
    const end = auto
      ? gymInstant(day, "23:00")
      : new Date(start.getTime() + (30 + ((i * 17) % 90)) * 60_000);
    const type = i % 10 === 0 ? "group" : i % 15 === 1 ? "personal" : "gym";
    return {
      gym_id: gymId,
      member_id: bulk[(i * i + 3 * i) % 40].id,
      visit_type: type,
      trainer_id: type === "gym" ? null : trainerId,
      is_backdated: true,
      checked_in_at: start.toISOString(),
      checked_out_at: end.toISOString(),
      auto_checkout: auto,
      checked_in_by: staff.owner.id,
    };
  });
  await must(admin.from("visits").insert(visits).select("id"), "Bulk visits");
});

test.afterAll(async ({}, workerInfo) => {
  // 233 members, 300 visits and their audit rows take a while to remove under load.
  test.setTimeout(120_000);
  if (workerInfo.project.name !== "desktop") return;
  console.log(`[notes]\n${notes.join("\n")}`);
  await deleteTestGym(gymId);
});

async function signIn(page: Page, who: TestStaff) {
  await page.goto("/login");
  await page.getByLabel("Korisničko ime ili email").fill(who.identifier);
  await page.getByLabel("Lozinka", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function signedIn(
  browser: Browser,
  who: TestStaff,
  options: Parameters<Browser["newContext"]>[0] = {},
): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    ...options,
  });
  const page = await context.newPage();
  await signIn(page, who);
  return page;
}

async function startWork(page: Page) {
  await page
    .getByRole("button", { name: "Počni rad" })
    .click({ timeout: 3_000 })
    .catch(() => {});
}

async function clickUntil(button: Locator, visible: Locator) {
  await expect(async () => {
    await button.click({ timeout: 2_000 });
    await expect(visible).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

/** "1.234,56 €" → 123456 cents. */
function cents(text: string): number {
  const clean = text.replace(/[^\d,-]/g, "");
  const [whole, fraction = "0"] = clean.split(",");
  const sign = whole.startsWith("-") ? -1 : 1;
  return sign * (Math.abs(Number(whole)) * 100 + Number(fraction.padEnd(2, "0")));
}

async function tile(page: Page, label: string): Promise<string> {
  const box = page
    .locator("p", { hasText: new RegExp(`^${label}$`) })
    .first()
    .locator("xpath=..");
  await expect(box).toBeVisible();
  return ((await box.textContent()) ?? "").replace(label, "").trim();
}

async function noSideScroll(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test("SET-17 and UX-05: a new expense category, the system one, and the toast that goes", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const owner = await signedIn(browser, staff.owner);
  await owner.goto("/settings/gym");
  const section = owner.locator("section", { hasText: "Kategorije troškova" }).last();
  await section.getByRole("button", { name: "Dodaj kategoriju" }).click();
  const dialog = owner.getByRole("dialog");
  await dialog.getByLabel("Naziv").fill("E2E Čišćenje");
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();

  // UX-05: the confirmation appears, lets clicks through, and leaves by itself.
  const toast = owner.locator("[aria-live=polite] > div", { hasText: "Sačuvano." });
  await expect(toast).toBeVisible();
  const shownAt = Date.now();
  const box = (await toast.boundingBox())!;
  const underneath = await owner.evaluate(
    ([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      return hit?.closest("[aria-live=polite]") ? "toast" : (hit?.tagName ?? "none");
    },
    [box.x + box.width / 2, box.y + box.height / 2],
  );
  await expect(toast).toBeHidden({ timeout: 10_000 });
  const lasted = Date.now() - shownAt;
  note(`UX-05 „Sačuvano.“ visible ≈ ${(lasted / 1000).toFixed(1)} s; a click at its centre reaches: ${underneath}`);
  expect(lasted).toBeGreaterThan(4_000);
  expect(lasted).toBeLessThan(8_000);
  expect(underneath).not.toBe("toast");

  const row = section.getByRole("row", { name: /E2E Čišćenje/ });
  await expect(row).toContainText("Da");
  // BR-131: never deleted — the rows offer [Uredi] only.
  const actions = (await section.locator("tbody button").allInnerTexts()).map((t) => t.trim());
  note(`SET-17 category row actions: ${[...new Set(actions)].join(", ")}`);
  expect(new Set(actions)).toEqual(new Set(["Uredi"]));
  const system = section.getByRole("row", { name: /Roba za prodaju/ });
  await expect(system).toContainText("Sistemska");
  await system.getByRole("button", { name: "Uredi" }).click();
  const active = owner.getByRole("dialog").getByRole("checkbox", { name: "Aktivan" });
  await expect(active).toBeChecked();
  await expect(active).toBeDisabled();
  await owner.keyboard.press("Escape");

  // Offered at once in the owner's expense dialog…
  await owner.goto("/finance/expenses?period=month");
  await clickUntil(
    owner.getByRole("button", { name: "Novi trošak" }),
    owner.getByRole("dialog").getByLabel("Kategorija", { exact: true }),
  );
  const ownerOptions = await owner
    .getByRole("dialog")
    .getByLabel("Kategorija", { exact: true })
    .locator("option")
    .allInnerTexts();
  expect(ownerOptions).toContain("E2E Čišćenje");
  await owner.context().close();

  // …and at the desk.
  const desk = await signedIn(browser, staff.ana);
  await startWork(desk);
  await desk.getByRole("button", { name: "Trošak" }).click();
  const deskOptions = await desk
    .getByRole("dialog")
    .getByLabel("Kategorija")
    .locator("option")
    .allInnerTexts();
  note(`SET-17 desk categories: ${deskOptions.join(", ")}`);
  expect(deskOptions).toContain("E2E Čišćenje");
  await desk.context().close();

  // The system category stays active even if the request is sent anyway.
  const session = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  await session.auth.signInWithPassword({
    email: `${staff.owner.identifier}@${process.env.STAFF_EMAIL_DOMAIN}`,
    password: PASSWORD,
  });
  const { data: sys } = await adminClient()
    .from("expense_categories")
    .select("id")
    .eq("gym_id", gymId)
    .eq("is_system", true)
    .single<{ id: string }>();
  const forced = await session.rpc("upsert_expense_category", {
    p_id: sys!.id,
    p_name: "Roba za prodaju",
    p_is_active: false,
  });
  const { data: after } = await adminClient()
    .from("expense_categories")
    .select("is_active")
    .eq("id", sys!.id)
    .single<{ is_active: boolean }>();
  note(`SET-17 forced deactivation of the system category → ${forced.error?.message ?? "no error"}; active: ${after?.is_active}`);
  expect(after?.is_active).toBe(true);
});

test("CARD-04: registering a member takes one card, and „Prazne“ drops from 10 to 9", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const owner = await signedIn(browser, staff.owner);
  await owner.goto("/settings/cards");
  await owner.getByLabel("Broj kartica (1–100)").fill("10");
  await owner.getByRole("button", { name: "Generiši" }).click();
  await expect(owner.getByText("Kartice su generisane.").first()).toBeVisible();
  const batchRow = owner.locator("main tbody tr").first();
  await expect(batchRow).toContainText(/10\s*10/);
  const { data: cards } = await adminClient()
    .from("cards")
    .select("code")
    .eq("gym_id", gymId)
    .eq("status", "unassigned")
    .returns<{ code: string }[]>();
  expect(cards).toHaveLength(10);

  const desk = await signedIn(browser, staff.ana);
  await desk.goto("/members");
  await desk.getByRole("button", { name: "Novi član" }).click();
  const dialog = desk.getByRole("dialog");
  const field = dialog.getByLabel("Skenirajte praznu karticu");
  await field.fill(cards![0].code);
  await field.press("Enter");
  await expect(dialog.getByText("Kartica je prazna i spremna.")).toBeVisible();
  await dialog.getByLabel("Ime", { exact: true }).fill("E2E Kartica");
  await dialog.getByLabel("Prezime").fill("Brojač");
  await dialog.getByLabel("Telefon").fill("+38267905900");
  await dialog.getByLabel("Email").fill("srdb-card@e2e.invalid");
  await dialog.getByLabel("Datum rođenja", { exact: true }).fill("01.02.2000");
  await dialog.getByLabel("Vrsta članarine").selectOption(plan.mjesecna);
  await dialog.getByText("Gotovina", { exact: true }).click();
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  const created = dialog.getByText(/^Član #\d+ je kreiran\./);
  const anyway = dialog.getByRole("button", { name: "Ipak sačuvaj" });
  await expect(created.or(anyway)).toBeVisible({ timeout: 15_000 });
  if (await anyway.isVisible()) await anyway.click();
  await expect(created).toBeVisible({ timeout: 15_000 });
  await desk.context().close();
  const { data: registered } = await adminClient()
    .from("members")
    .select("id")
    .eq("gym_id", gymId)
    .eq("last_name", "Brojač")
    .single<{ id: string }>();
  member.stari = registered!.id;

  await owner.reload();
  await expect(owner.locator("main tbody tr").first()).toContainText(/10\s*9/);
  note(`CARD-04 batch row after the registration: ${(await owner.locator("main tbody tr").first().innerText()).replace(/\s+/g, " ")}`);
  await owner.context().close();
});

test("E2E-08: a new price, a new product — old sales keep 79 €, the new one is 89 €, 1,40 € a bottle", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const owner = await signedIn(browser, staff.owner);
  // 1. Mjesečna from 79 to 89.
  await owner.goto("/settings/plans");
  await owner
    .getByRole("row", { name: /^E2E Mjesečna Teretana/ })
    .getByRole("button", { name: "Uredi" })
    .click();
  await owner.getByRole("dialog").getByLabel("Cijena (€)").fill("89");
  await owner.getByRole("dialog").getByRole("button", { name: "Sačuvaj" }).click();
  await expect(owner.getByRole("dialog")).toBeHidden();
  await expect(owner.getByRole("row", { name: /^E2E Mjesečna Teretana/ })).toContainText("89,00 €");
  // 2. Izotonik 0,60 / 2,00 and twelve of them in storage.
  await owner.goto("/settings/products");
  await owner.getByRole("button", { name: "Dodaj proizvod" }).click();
  await owner.getByLabel("Naziv").fill("E2E Izotonik");
  await owner.getByLabel("Nabavna cijena (€)").fill("0,60");
  await owner.getByLabel("Prodajna cijena (€)").fill("2,00");
  await owner.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(owner.getByText("Sačuvano.").first()).toBeVisible();
  await owner.goto("/storage");
  await owner.getByRole("button", { name: "Nova roba E2E Izotonik" }).click();
  const stockIn = owner.getByRole("dialog");
  await stockIn.getByLabel("Količina").fill("12");
  await stockIn.getByLabel("Nabavna cijena po komadu (sa fakture)").fill("0,60");
  await stockIn.getByText("Van kase", { exact: true }).click();
  await stockIn.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(owner.getByText("Roba je evidentirana.").first()).toBeVisible();
  await expect(owner.getByTestId("stock-E2E Izotonik")).toHaveText("12");

  // 3. The desk sells a monthly membership and one Izotonik.
  const desk = await signedIn(browser, staff.ana);
  await desk.goto(`/members/${member.novi}`);
  const sale = desk.getByRole("dialog");
  await clickUntil(
    desk.getByRole("button", { name: "Nova članarina" }),
    sale.getByLabel("Vrsta članarine"),
  );
  await sale.getByLabel("Vrsta članarine").selectOption(plan.mjesecna);
  await expect(sale).toContainText("89,00 €");
  await sale.getByText("Gotovina", { exact: true }).click();
  await sale.getByRole("button", { name: "Naplati i sačuvaj" }).click();
  await expect(desk.getByText("Članarina sačuvana.").first()).toBeVisible();
  await desk.goto("/storage");
  await desk.getByRole("button", { name: "Prodaja E2E Izotonik" }).click();
  const bottle = desk.getByRole("dialog");
  await bottle.getByLabel("Količina").fill("1");
  await bottle.getByText("Gotovina", { exact: true }).click();
  await expect(bottle.getByText("Ukupno: 2,00 €")).toBeVisible();
  await bottle.getByRole("button", { name: "Naplati" }).click();
  await expect(desk.getByText("Prodaja je sačuvana.").first()).toBeVisible();
  await desk.context().close();

  // 4. The owner: the old payment, the new one, and the storage profit.
  for (const [id, amount] of [
    [member.stari, "79,00 €"],
    [member.novi, "89,00 €"],
  ] as const) {
    await owner.goto(`/members/${id}?tab=uplate`);
    await expect(owner.locator("main tbody")).toContainText(amount);
  }
  await owner.goto("/finance/storage?period=month");
  const izotonik = owner
    .locator("section", { has: owner.getByRole("heading", { name: "Magacin", exact: true }) })
    .getByRole("row", { name: /^E2E Izotonik/ });
  await expect(izotonik.getByRole("cell")).toHaveText([
    "E2E Izotonik",
    "11",
    "6,60 €",
    "1",
    "2,00 €",
    "0,60 €",
    "1,40 €",
  ]);
  note(`E2E-08 /finance/storage Izotonik: ${(await izotonik.innerText()).replace(/\s+/g, " ")}`);
  await owner.context().close();
});

test("FIN-13: S-20 for the owner, and the profit it shows is the overview's", async ({
  page,
}) => {
  await signIn(page, staff.owner);
  await page.goto("/finance/storage?period=month");
  for (const heading of ["Magacin", "Dnevna prodaja", "Ulazi robe"])
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  for (const column of ["Vrijednost zalihe", "Prodato kom", "Nabavna vrijednost prodatog"])
    await expect(page.getByRole("columnheader", { name: column }).first()).toBeVisible();
  const daily = page.locator("section", { has: page.getByRole("heading", { name: "Dnevna prodaja" }) });
  await expect(daily.locator("tbody tr")).toHaveCount(1);
  await expect(daily.locator("tbody tr")).toContainText(/E2E Izotonik\s*1\s*2,00 €/);
  const ins = page.locator("section", { has: page.getByRole("heading", { name: "Ulazi robe" }) });
  await expect(ins.locator("tbody tr", { hasText: "E2E Izotonik" })).toContainText(/12\s*0,60 €\s*7,20 €\s*Ne/);
  const profits = await page
    .locator("section", { has: page.getByRole("heading", { name: "Magacin", exact: true }) })
    .locator("tbody tr td:last-child")
    .allInnerTexts();
  const total = profits.reduce((sum, text) => sum + cents(text), 0);

  await page.goto("/finance?period=month");
  const card = await tile(page, "Zarada na magacinu");
  note(`FIN-13 S-20 profit sum ${total / 100} € vs overview „Zarada na magacinu“ ${card}`);
  expect(cents(card)).toBe(total);
  expect(total).toBe(140);

  await page.goto("/finance/storage?period=custom&from=2020-01-01&to=2020-01-31");
  await expect(page.getByText("Nema prometa u izabranom periodu.")).toHaveCount(2);
});

test("FIN-04: the monthly chart — hint, hover amounts, 375 px and touch", async ({
  browser,
}) => {
  const page = await signedIn(browser, staff.owner);
  await page.goto("/finance?period=month");
  const income = await tile(page, "Prihod");
  const expenses = await tile(page, "Troškovi");
  const chart = page.locator("figure", { hasText: "Prihod i troškovi po mjesecima (€)" });
  await expect(chart).toContainText("Pređite mišem preko mjeseca za iznose.");
  // D-68: the chart spans January to December of this year, and only the months up to
  // this one have columns to hover; the last of them is the current month.
  const months = chart.locator("svg g:has(rect)");
  await expect(months).toHaveCount(Number(gymDate(0).month.slice(5, 7)));
  await months.last().locator("rect").first().hover();
  const caption = chart.locator("p[aria-live=polite]");
  const hovered = (await caption.innerText()).replace(/\s+/g, " ");
  note(`FIN-04 hover on the current month: „${hovered}“ (tiles: Prihod ${income}, Troškovi ${expenses})`);
  expect(hovered).toContain(`Prihod: ${income}`);
  expect(hovered).toContain(`Troškovi: ${expenses}`);
  await page.mouse.move(5, 5);
  await expect(caption).toHaveText("Pređite mišem preko mjeseca za iznose.");
  await page.screenshot({ path: "test-results/test-plan-medium/fin-04-desktop.png", fullPage: true });
  await page.context().close();

  // A phone: 375 px and touch instead of a mouse.
  const phone = await signedIn(browser, staff.owner, {
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
  });
  await phone.goto("/finance?period=month");
  const small = phone.locator("figure", { hasText: "Prihod i troškovi po mjesecima (€)" });
  await expect(small).toBeVisible();
  expect(await noSideScroll(phone)).toBeLessThanOrEqual(0);
  const frame = small.locator("div.overflow-x-auto");
  const scroll = await frame.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  note(`FIN-04 375 px: page side-scroll 0; chart frame ${scroll.client} px showing ${scroll.scroll} px (scrolls inside)`);
  await small.locator("svg g:has(rect)").last().scrollIntoViewIfNeeded();
  await small.locator("svg g:has(rect)").last().locator("rect").first().tap();
  const tapped = (await small.locator("p[aria-live=polite]").innerText()).replace(/\s+/g, " ");
  note(`FIN-04 tap on the current month: „${tapped}“`);
  expect(tapped).toContain("Prihod:");
  await phone.screenshot({ path: "test-results/test-plan-medium/fin-04-375.png", fullPage: true });
  await phone.context().close();
});

test("STAT-01 and STAT-04: the month's statistics over 300 visits", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const today = gymDate(0);
  const monthStart = gymInstant(`${today.month}-01`, "00:00");
  const { data: visits } = await adminClient()
    .from("visits")
    .select("member_id, visit_type, checked_in_at, checked_out_at, auto_checkout")
    .eq("gym_id", gymId)
    .gte("checked_in_at", monthStart.toISOString())
    .returns<
      {
        member_id: string;
        visit_type: string;
        checked_in_at: string;
        checked_out_at: string | null;
        auto_checkout: boolean;
      }[]
    >();
  const total = visits!.length;
  const auto = visits!.filter((v) => v.auto_checkout).length;
  const open = visits!.filter((v) => !v.checked_out_at).length;
  const measured = total - auto - open;
  const byType = (type: string) => visits!.filter((v) => v.visit_type === type).length;
  const daysInMonth = new Date(
    Date.UTC(Number(today.month.slice(0, 4)), Number(today.month.slice(5)), 0),
  ).getUTCDate();

  for (const who of [staff.owner, staff.manager]) {
    const page = await signedIn(browser, who);
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    const started = Date.now();
    await page.goto("/stats/visits?period=month");
    await expect(page.getByText("Ukupno dolazaka")).toBeVisible();
    const loaded = Date.now() - started;
    const totalShown = page.getByText("Ukupno dolazaka").locator("xpath=following-sibling::p");
    await expect(totalShown).toHaveText(String(total));
    await expect(
      page.getByText(`Bez automatskih odjava (${measured} mjerenih dolazaka).`),
    ).toBeVisible();
    const perDay = page.locator("figure", { hasText: "Dolasci po danima" });
    const perHour = page.locator("figure", { hasText: "Dolasci po satima (06–23)" });
    await expect(perDay.locator("svg g:has(rect)")).toHaveCount(daysInMonth);
    await expect(perHour.locator("svg g:has(rect)")).toHaveCount(18);
    // Hover the 1st of the month and compare with the database.
    const first = visits!.filter((v) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(new Date(v.checked_in_at)) ===
      `${today.month}-01`,
    ).length;
    await perDay.locator("svg g:has(rect)").first().locator("rect").first().hover();
    await expect(perDay).toContainText(`01.${today.month.slice(5)}.${today.month.slice(0, 4)} — ${first} dolazaka`);
    const types = page.locator("section", { has: page.getByRole("heading", { name: "Dolasci po vrsti" }) });
    for (const [label, type] of [["Teretana", "gym"], ["Grupni", "group"], ["Personalni", "personal"]])
      await expect(types.getByRole("row", { name: new RegExp(`^${label}`) })).toContainText(String(byType(type)));
    // N-25: the bars follow the counts (a CSP-blocked style drew them all full width).
    const widths = await types
      .locator("tbody svg rect")
      .evaluateAll((rects) => rects.map((r) => Math.round(r.getBoundingClientRect().width)));
    const counts = [byType("gym"), byType("group"), byType("personal")];
    expect(widths[0]).toBeGreaterThan(widths[1]);
    expect(widths[1]).toBeGreaterThan(widths[2]);
    expect(Math.abs(widths[1] / widths[0] - counts[1] / counts[0])).toBeLessThan(0.02);
    const top = page.locator("section", { has: page.getByRole("heading", { name: "Najčešći članovi" }) });
    const rows = top.locator("tbody tr");
    const count = await rows.count();
    expect(count).toBeLessThanOrEqual(10);
    expect(count).toBe(10);
    note(
      `STAT-01 ${who.fullName}: total ${total}, auto ${auto}, measured ${measured}; ${daysInMonth} day bars, 18 hour bars; top ${count}; type bar widths ${widths.join("/")} px; loaded in ${loaded} ms; console errors: ${errors.length ? errors.join(" | ").slice(0, 300) : "none"}`,
    );
    if (who === staff.owner) {
      await page.screenshot({ path: "test-results/test-plan-medium/stat-01-desktop.png", fullPage: true });
      const link = rows.first().getByRole("link");
      const name = (await link.innerText()).replace(/^#\d+\s*/, "").trim();
      await link.click();
      await expect(page).toHaveURL(/\/members\/[0-9a-f-]{36}/);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto("/stats/visits?period=month");
      await expect(page.getByText("Ukupno dolazaka")).toBeVisible();
      expect(await noSideScroll(page)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: "test-results/test-plan-medium/stat-01-375.png", fullPage: true });
    }
    expect(errors.filter((e) => e.includes("Content Security Policy"))).toEqual([]);
    // STAT-04 (BR-082): the auto-closed visits count, but not in the average.
    expect(total - measured).toBe(auto + open);
    expect(auto).toBe(12);
    await page.context().close();
  }
});

test("UX-06: the member list, the statistics and the audit log with many rows", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page, staff.owner);
  const timed = async (url: string, ready: Locator) => {
    const started = Date.now();
    await page.goto(url);
    await expect(ready).toBeVisible();
    return Date.now() - started;
  };
  const { count: members } = await adminClient()
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("gym_id", gymId);
  const pages = Math.ceil(members! / 25);
  const list = await timed("/members", page.getByText(`Strana 1 od ${pages}`));
  await expect(page.locator("main tbody tr")).toHaveCount(25);
  const started = Date.now();
  await page.getByRole("button", { name: "Sljedeća" }).click();
  await expect(page.getByText(`Strana 2 od ${pages}`)).toBeVisible();
  const next = Date.now() - started;
  await expect(page.locator("main tbody tr")).toHaveCount(25);
  const searchStart = Date.now();
  await page.getByLabel("Pretraga člana (ime, telefon, broj)").fill("Član217");
  await expect(page.locator("main tbody tr")).not.toHaveCount(25);
  await expect(page.locator("main tbody")).toContainText("E2E Masovni Član217");
  const search = Date.now() - searchStart;
  const found = (await page.locator("main tbody tr").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
  note(`UX-06 search „Član217“ → ${found.length} row(s): ${found.join(" | ")}`);
  const stats = await timed("/stats/visits?period=month", page.getByText("Ukupno dolazaka"));
  const audit = await timed(
    "/finance/audit?period=today",
    page.getByText("Prikazano je prvih 200 izmjena. Suzite period da vidite ostale."),
  );
  await expect(page.locator("main tbody tr")).toHaveCount(200);
  note(
    `UX-06 ${members} members (${pages} pages): /members ${list} ms, next page ${next} ms, search „Član217“ ${search} ms; /stats/visits (300+ visits) ${stats} ms; /finance/audit today ${audit} ms, 200 rows and the limit notice`,
  );
  for (const ms of [list, next, search, stats, audit]) expect(ms).toBeLessThan(5_000);
});

test("UX-04: the keyboard — Tab through reception, a trapped dialog, Esc, and the menus", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const desk = await signedIn(browser, staff.ana);
  const csp: string[] = [];
  desk.on("console", (msg) => {
    if (msg.type() === "error" && msg.text().includes("Content Security Policy"))
      csp.push(msg.text().slice(0, 80));
  });
  await startWork(desk);
  await expect(desk.getByRole("heading", { name: "Skenirajte karticu" })).toBeVisible();
  await desk.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const stops: string[] = [];
  const unnamed: string[] = [];
  const unmarked: string[] = [];
  for (let i = 0; i < 20; i++) {
    await desk.keyboard.press("Tab");
    const info = await desk.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const labelledBy = el.getAttribute("aria-labelledby");
      const label =
        el.getAttribute("aria-label") ||
        (labelledBy ? document.getElementById(labelledBy)?.textContent : "") ||
        (el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent : "") ||
        el.getAttribute("placeholder") ||
        el.textContent ||
        "";
      return {
        tag: el.tagName.toLowerCase(),
        name: label.replace(/\s+/g, " ").trim(),
        focusVisible: el.matches(":focus-visible"),
        marked:
          (style.outlineStyle !== "none" && style.outlineWidth !== "0px") ||
          style.boxShadow !== "none",
      };
    });
    if (!info) continue;
    stops.push(`${info.tag}:${info.name}`);
    if (!info.name) unnamed.push(info.tag);
    if (!info.marked) unmarked.push(`${info.tag}:${info.name}`);
  }
  note(`UX-04 reception Tab order: ${stops.join(" → ")}`);
  note(`UX-04 unnamed: ${unnamed.join(", ") || "none"}; no visible focus mark: ${unmarked.join(", ") || "none"}`);
  expect(unnamed).toEqual([]);
  expect(unmarked).toEqual([]);

  // N-26: closing a desk dialog puts focus back on its button, and a scan still works.
  const dayPass = desk.getByRole("button", { name: "Dnevna karta" });
  await dayPass.focus();
  await desk.keyboard.press("Enter");
  await expect(desk.getByRole("dialog")).toBeVisible();
  await desk.keyboard.press("Escape");
  await expect(desk.getByRole("dialog")).toBeHidden();
  await expect(dayPass).toBeFocused();
  await desk.keyboard.type("1234567890");
  await desk.keyboard.press("Enter");
  await expect(desk.getByRole("status").getByText("Nepoznata kartica.")).toBeVisible();
  await expect(desk.getByRole("dialog")).toHaveCount(0);

  // The membership dialog keeps focus inside, and Esc returns it to its button.
  await desk.goto(`/members/${member.stari}`);
  const opener = desk.getByRole("button", { name: "Nova članarina" });
  await expect(opener).toBeVisible();
  await opener.focus();
  await desk.keyboard.press("Enter");
  const dialog = desk.getByRole("dialog");
  await expect(dialog.getByLabel("Vrsta članarine")).toBeVisible();
  // N-27: the scroll lock Radix injects carries the nonce, so the policy lets it apply.
  const locked = await desk.evaluate(() => getComputedStyle(document.body).overflow);
  note(`UX-04/N-27 page behind the open dialog: overflow ${locked}; CSP errors so far: ${csp.length}`);
  expect(locked).toBe("hidden");
  expect(csp).toEqual([]);
  let escaped = 0;
  for (let i = 0; i < 25; i++) {
    await desk.keyboard.press(i < 20 ? "Tab" : "Shift+Tab");
    const inside = await dialog.evaluate((el) => el.contains(document.activeElement));
    if (!inside) escaped++;
  }
  note(`UX-04 membership dialog: 20 Tab + 5 Shift+Tab, focus left the dialog ${escaped} times`);
  expect(escaped).toBe(0);
  await desk.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await desk.waitForTimeout(300);
  const back = await desk.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el ? `${el.tagName.toLowerCase()} „${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}“` : "none";
  });
  note(`UX-04 after Esc the focus is on: ${back}`);
  await expect(opener).toBeFocused();

  // The account menu by keyboard.
  const account = desk.getByRole("button", { name: "Nalog" });
  await account.focus();
  await desk.keyboard.press("Enter");
  const menu = desk.getByRole("menu");
  await expect(menu).toBeVisible();
  await desk.keyboard.press("ArrowDown");
  const focused = await desk.evaluate(() => document.activeElement?.textContent?.trim());
  await desk.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(account).toBeFocused();
  note(`UX-04 account menu: Enter opens, ArrowDown → „${focused}“, Esc closes back to the trigger (visible text is the user's name, accessible name „Nalog“)`);
  await desk.context().close();

  // The phone menu by keyboard.
  const phone = await signedIn(browser, staff.ana, { viewport: { width: 375, height: 812 } });
  await startWork(phone);
  const open = phone.getByRole("button", { name: "Otvori meni" });
  await open.focus();
  await phone.keyboard.press("Enter");
  const nav = phone.getByRole("menu");
  await expect(nav.getByRole("menuitem", { name: "Članovi" })).toBeVisible();
  await phone.keyboard.press("Escape");
  await expect(nav).toBeHidden();
  await expect(open).toBeFocused();
  await phone.context().close();
});

test("§5.2 and N-24: every screen at 375 px with a full month of data — no sideways page", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const owner = await signedIn(browser, staff.owner, { viewport: { width: 375, height: 812 } });
  const csp: string[] = [];
  owner.on("console", (msg) => {
    if (msg.type() === "error" && msg.text().includes("Content Security Policy"))
      csp.push(owner.url());
  });
  const paths = [
    "/reception",
    "/members",
    `/members/${bulk[0].id}?tab=dolasci`,
    `/members/${member.stari}?tab=uplate`,
    "/payments/today",
    "/storage",
    "/stats/visits?period=month",
    "/finance?period=month",
    "/finance/expenses?period=month",
    "/finance/trainers",
    "/finance/shifts?period=month",
    "/finance/storage?period=month",
    "/finance/audit?period=today",
    "/finance/backdated",
    "/settings/users",
    "/settings/trainers",
    "/settings/cards",
    "/settings/plans",
    "/settings/products",
    "/settings/gym",
  ];
  const wide: string[] = [];
  for (const path of paths) {
    await owner.goto(path);
    await owner.waitForLoadState("networkidle");
    await owner.waitForTimeout(500);
    const extra = await noSideScroll(owner);
    if (extra > 0) wide.push(`${path} +${extra} px`);
  }
  note(`§5.2 375 px with data, ${paths.length} screens: sideways ${wide.join(", ") || "none"}; CSP errors on ${[...new Set(csp)].join(", ") || "none"}`);
  expect(wide).toEqual([]);
  expect(csp).toEqual([]);
  await owner.context().close();
});
