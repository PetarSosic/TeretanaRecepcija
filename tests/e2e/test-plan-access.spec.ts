import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// TEST_PLAN.md §3: the remaining steps of Kritično cases left DJELOMIČNO on 22.09.2026
// for sign-in, the route matrix, S-12 visibility and the settings forms (AUTH-01,
// AUTH-02, PERM-01/02/03, PERM-06, SET-01, SET-11, SET-14), against one synthetic gym
// (D-56). AUTH-01 alone signs in to the real seeded owner, read-only.
test.describe.configure({ mode: "serial" });

const PASSWORD = "pristuplozinka1";
const ZONE = "Europe/Podgorica";

let gymId: string;
const staff = {} as Record<"admin" | "owner" | "manager" | "ana", TestStaff>;
let memberId: string;
let trainerId: string;

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
  gymId = await createTestGym(`${workerInfo.project.name}-access-${suffix()}`);
  for (const [key, role, name] of [
    ["admin", "admin", "E2E Admin pristupa"],
    ["owner", "owner", "E2E Vlasnik pristupa"],
    ["manager", "manager", "E2E Menadžer pristupa"],
    ["ana", "receptionist", "E2E Ana pristup"],
  ] as const)
    staff[key] = await createTestStaff(gymId, {
      role,
      fullName: name,
      password: PASSWORD,
    });
  const admin = adminClient();
  memberId = (
    await must(
      admin
        .from("members")
        .insert({
          gym_id: gymId,
          member_number: 1,
          first_name: "E2E Pristup",
          last_name: "Član",
          phone: "+38267600001",
          email: "pristup@e2e.invalid",
          date_of_birth: "1990-01-01",
          created_by: staff.owner.id,
        })
        .select("id")
        .single<{ id: string }>(),
      "Test member",
    )
  ).id;
  await must(
    admin
      .from("member_counters")
      .insert({ gym_id: gymId, last_number: 1 })
      .select("gym_id"),
    "Test member counter",
  );
  trainerId = (
    await must(
      admin
        .from("trainers")
        .insert({ gym_id: gymId, full_name: "E2E Tamara" })
        .select("id")
        .single<{ id: string }>(),
      "Test trainer",
    )
  ).id;
  await must(
    admin
      .from("trainer_finance")
      .insert({ trainer_id: trainerId, gym_id: gymId, personal_gym_fee: 80 })
      .select("trainer_id"),
    "Test trainer finance",
  );
  const dayPass = await must(
    admin
      .from("plans")
      .insert({
        gym_id: gymId,
        name: "E2E Dnevna karta",
        kind: "day_pass",
        price: 10,
        covers_gym: true,
      })
      .select("id")
      .single<{ id: string }>(),
    "Test day pass",
  );
  await must(
    admin
      .from("plan_finance")
      .insert({ plan_id: dayPass.id, gym_id: gymId })
      .select("plan_id"),
    "Test plan finance",
  );
  // PERM-06: yesterday's payment and a back-dated one today, neither for the desk.
  await must(
    admin
      .from("payments")
      .insert([
        {
          gym_id: gymId,
          kind: "day_pass",
          plan_id: dayPass.id,
          quantity: 1,
          amount: 11,
          method: "cash",
          paid_on: gymDate(-1),
          is_backdated: true,
          created_by: staff.owner.id,
        },
        {
          gym_id: gymId,
          kind: "day_pass",
          plan_id: dayPass.id,
          quantity: 2,
          amount: 22,
          method: "card",
          paid_on: gymDate(0),
          is_backdated: true,
          created_by: staff.owner.id,
        },
      ])
      .select("id"),
    "Test payments",
  );
  const category = await must(
    admin
      .from("expense_categories")
      .insert({ gym_id: gymId, name: "E2E Struja" })
      .select("id")
      .single<{ id: string }>(),
    "Test category",
  );
  await must(
    admin
      .from("expenses")
      .insert({
        gym_id: gymId,
        spent_on: gymDate(0),
        category_id: category.id,
        description: "E2E vlasnikov račun",
        amount: 33,
        method: "card",
        created_by: staff.owner.id,
      })
      .select("id"),
    "Test expense",
  );
});

test.afterAll(async ({}, workerInfo) => {
  if (workerInfo.project.name === "desktop") await deleteTestGym(gymId);
});

async function signIn(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Korisničko ime ili email").fill(identifier);
  await page.getByLabel("Lozinka", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function signedIn(browser: Browser, who: TestStaff): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });
  const page = await context.newPage();
  await signIn(page, who.identifier, PASSWORD);
  return page;
}

async function menu(page: Page): Promise<string[]> {
  return (
    await page
      .getByRole("navigation", { name: "Meni" })
      .locator(":scope > ul > li")
      .allInnerTexts()
  ).map((text) => text.trim());
}

const notes: string[] = [];
function note(text: string) {
  notes.push(text);
  console.log(`[note] ${text}`);
}

test("AUTH-01: the seeded owner signs in with the email and lands on Finansije", async ({
  page,
}) => {
  const password = process.env.SEED_OWNER_PASSWORD;
  test.skip(!password, "SEED_OWNER_PASSWORD is not set");
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await page
    .getByLabel("Korisničko ime ili email")
    .fill("matija.vojinovic@eurotehnikamn.me");
  await page.getByLabel("Lozinka", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await page.waitForURL(
    (url) => !url.pathname.startsWith("/login") || url.search !== "",
    { timeout: 20_000 },
  );
  note(`AUTH-01 landed on ${new URL(page.url()).pathname}`);
  test.skip(
    page.url().includes("/change-password") || page.url().includes("/login"),
    "the seeded owner no longer uses the seed password",
  );
  await expect(page).toHaveURL(/\/finance/);
  await expect(page.locator("header")).toContainText("KP Fitness");
  await page.getByRole("button", { name: "Nalog" }).click();
  await expect(page.getByRole("menu")).toContainText("Vlasnik");
  await page.keyboard.press("Escape");
  expect(await menu(page)).toEqual([
    "Recepcija",
    "Članovi",
    "Uplate danas",
    "Magacin",
    "Statistika dolazaka",
    "Finansije",
    "Podešavanja",
  ]);
  // Leave the real account signed out again.
  await page.getByRole("button", { name: "Nalog" }).click();
  await page.getByRole("menuitem", { name: "Odjava" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("AUTH-02: a username login opens the receptionist's shift and desk menu", async ({
  page,
}) => {
  await signIn(page, staff.ana.identifier, PASSWORD);
  await expect(page).toHaveURL(/\/reception/);
  await expect(
    page.getByText(/^Smjena: E2E Ana pristup od \d{2}:\d{2}$/),
  ).toBeVisible();
  const items = await menu(page);
  expect(items).toContain("Zaključi smjenu");
  expect(items).not.toContain("Finansije");
  expect(items).not.toContain("Statistika dolazaka");
  const { data } = await adminClient()
    .from("shifts")
    .select("staff_id, closed_at")
    .eq("gym_id", gymId)
    .returns<{ staff_id: string; closed_at: string | null }[]>();
  expect(data).toEqual([{ staff_id: staff.ana.id, closed_at: null }]);
});

const FINANCE = [
  "/finance",
  "/finance/expenses",
  "/finance/trainers",
  "/finance/shifts",
  "/finance/storage",
  "/finance/audit",
  "/finance/backdated",
];
const DESK = ["/reception", "/members", "/payments/today", "/storage"];

/** Next streams its 404 into the layout, so the answer is awaited, not sampled. */
async function expectRoute(
  page: Page,
  path: string,
  open: boolean,
  who: string,
) {
  await page.goto(path);
  const notFound = page.getByRole("heading", { name: "404" });
  if (!open) {
    await expect(notFound, `${who} ${path}`).toBeVisible();
    return;
  }
  await page.waitForLoadState("networkidle");
  await expect(notFound, `${who} ${path}`).toHaveCount(0);
  await expect(page.locator("main"), `${who} ${path}`).not.toBeEmpty();
}

test("PERM-01/02/03: the route matrix, member profile and shift screens included", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const profile = `/members/${memberId}`;
  const matrix: [TestStaff, string[], string[]][] = [
    [
      staff.ana,
      [...DESK, profile, "/shift/close"],
      [
        ...FINANCE,
        "/settings/users",
        "/settings/trainers",
        "/settings/cards",
        "/settings/plans",
        "/settings/products",
        "/settings/gym",
        "/stats/visits",
      ],
    ],
    [
      staff.manager,
      [
        ...DESK,
        profile,
        "/stats/visits",
        "/settings/users",
        "/settings/trainers",
        "/settings/cards",
      ],
      [
        ...FINANCE,
        "/settings/plans",
        "/settings/products",
        "/settings/gym",
        "/shift/close",
        "/shift/gate",
      ],
    ],
    ...[staff.owner, staff.admin].map(
      (who): [TestStaff, string[], string[]] => [
        who,
        [
          ...DESK,
          profile,
          ...FINANCE,
          "/stats/visits",
          "/settings/users",
          "/settings/trainers",
          "/settings/cards",
          "/settings/plans",
          "/settings/products",
          "/settings/gym",
        ],
        ["/shift/close", "/shift/gate"],
      ],
    ),
  ];
  for (const [who, allowed, forbidden] of matrix) {
    const page = await signedIn(browser, who);
    for (const path of allowed)
      await expectRoute(page, path, true, who.fullName);
    for (const path of forbidden)
      await expectRoute(page, path, false, who.fullName);
    await page.context().close();
  }

  // The receptionist's own S-02: with her own shift open, the gate sends her on.
  const ana = await signedIn(browser, staff.ana);
  await ana.goto("/shift/gate");
  note(
    `PERM-01 receptionist with her own shift on /shift/gate → ${new URL(ana.url()).pathname}`,
  );
  await ana.context().close();
});

test("PERM-06: the desk sees today's non-back-dated payments and only its own expenses", async ({
  browser,
}) => {
  const desk = await signedIn(browser, staff.ana);
  await desk.goto("/reception");
  await desk
    .getByRole("button", { name: "Počni rad" })
    .click({ timeout: 3_000 })
    .catch(() => {});
  await desk.getByRole("button", { name: "Trošak" }).click();
  const dialog = desk.getByRole("dialog");
  await dialog.getByLabel("Kategorija").selectOption({ label: "E2E Struja" });
  await dialog.getByLabel("Opis").fill("E2E recepcijski trošak");
  await dialog.getByLabel("Iznos (€)").fill("4");
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(desk.getByText("Trošak je sačuvan.").first()).toBeVisible();

  await desk.goto("/payments/today");
  await expect(
    desk.getByRole("heading", { name: "Moji troškovi danas" }),
  ).toBeVisible();
  await expect(
    desk.getByRole("heading", { name: "Troškovi danas", exact: true }),
  ).toHaveCount(0);
  const deskText = (await desk.locator("main").innerText()) ?? "";
  expect(deskText).toContain("E2E recepcijski trošak");
  expect(deskText).not.toContain("E2E vlasnikov račun");
  expect(deskText).not.toContain("11,00 €");
  expect(deskText).not.toContain("22,00 €");
  await desk.context().close();

  const boss = await signedIn(browser, staff.owner);
  await boss.goto("/payments/today");
  await expect(
    boss.getByRole("heading", { name: "Troškovi danas", exact: true }),
  ).toBeVisible();
  const bossText = (await boss.locator("main").innerText()) ?? "";
  expect(bossText).toContain("E2E vlasnikov račun");
  expect(bossText).toContain("E2E recepcijski trošak");
  note(
    `PERM-06 owner S-12 shows back-dated today=${bossText.includes("22,00 €")} yesterday=${bossText.includes("11,00 €")}`,
  );
  await boss.context().close();
});

test("SET-01: a manager creates a receptionist; no email field; S-01b on first login", async ({
  browser,
}) => {
  const page = await signedIn(browser, staff.manager);
  await page.goto("/settings/users");
  await page.getByRole("button", { name: "Novi korisnik" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Uloga").selectOption("receptionist");
  await expect(dialog.getByLabel("Email")).toHaveCount(0);
  const username = `marija.m${suffix().slice(0, 4)}`;
  await dialog.getByLabel("Ime i prezime").fill("Marija Marić");
  await dialog.getByLabel("Korisničko ime").fill(username);
  await dialog.getByLabel("Privremena lozinka").fill("Lozinka1234");
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Korisnik je kreiran.").first()).toBeVisible();
  const headers = (await page.getByRole("columnheader").allInnerTexts()).map(
    (text) => text.trim(),
  );
  for (const column of [
    "Ime",
    "Korisničko ime/Email",
    "Uloga",
    "Aktivan",
    "Kreiran",
  ])
    expect(headers).toContain(column);
  const row = page.getByRole("row", { name: /Marija Marić/ });
  await expect(row).toContainText(username);
  await expect(row).toContainText("Recepcioner");
  await page.context().close();

  const fresh = await browser.newContext();
  const first = await fresh.newPage();
  await signIn(first, username, "Lozinka1234");
  await expect(first).toHaveURL(/\/change-password/);
  await fresh.close();
});

test("SET-11: the trainer fee and group share are the owner's, with their bounds", async ({
  browser,
}) => {
  const manager = await signedIn(browser, staff.manager);
  await manager.goto("/settings/trainers");
  await expect(
    manager.getByRole("cell", { name: "E2E Tamara" }).first(),
  ).toBeVisible();
  await expect(
    manager.getByLabel("Naknada teretani po personalnom klijentu (€)"),
  ).toHaveCount(0);
  await expect(manager.getByLabel("Udio za grupne (%)")).toHaveCount(0);
  await manager.context().close();

  const page = await signedIn(browser, staff.owner);
  await page.goto("/settings/trainers");
  const row = page.getByRole("row", { name: /E2E Tamara/ });
  const fee = row.getByLabel("Naknada teretani po personalnom klijentu (€)");
  const share = row.getByLabel("Udio za grupne (%)");
  const save = row.getByRole("button", { name: "Sačuvaj" });
  const stored = async () =>
    (
      await adminClient()
        .from("trainer_finance")
        .select("personal_gym_fee, group_share_pct")
        .eq("trainer_id", trainerId)
        .single<{
          personal_gym_fee: number | null;
          group_share_pct: number | null;
        }>()
    ).data;

  note(`SET-11 fee field shows "${await fee.inputValue()}"`);
  // Only the share changes; the fee keeps whatever the field shows.
  await share.fill("70");
  await save.click();
  await page.waitForTimeout(2_000);
  const afterShare = await stored();
  note(
    `SET-11 after share 70 with the fee untouched: ${JSON.stringify(afterShare)}; page says ${(await page.getByRole("status").allInnerTexts()).join(" / ")}`,
  );
  expect(afterShare).toEqual({ personal_gym_fee: 80, group_share_pct: 70 });

  await fee.fill("");
  await share.fill("");
  await save.click();
  await expect.poll(stored).toEqual({
    personal_gym_fee: null,
    group_share_pct: null,
  });
  await page.reload();
  await expect(
    row.getByLabel("Naknada teretani po personalnom klijentu (€)"),
  ).toHaveAttribute("placeholder", "nije definisano");
  await expect(row.getByLabel("Udio za grupne (%)")).toHaveAttribute(
    "placeholder",
    "sa plana",
  );

  for (const value of ["101", "-5"]) {
    await row.getByLabel("Udio za grupne (%)").fill(value);
    await row.getByRole("button", { name: "Sačuvaj" }).click();
    await expect(
      page.getByText("Udio mora biti između 0 i 100, ili prazno.").first(),
      value,
    ).toBeVisible();
  }
  expect((await stored())?.group_share_pct).toBeNull();
  await page.context().close();
});

const SAVED_PLAN = (name: string) =>
  adminClient()
    .from("plans")
    .select("id, duration_value, duration_unit, price")
    .eq("gym_id", gymId)
    .eq("name", name);

test("SET-14: plan duration, price, name, limit, share and order rules", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const page = await signedIn(browser, staff.owner);
  await page.goto("/settings/plans");

  async function attempt(values: {
    name: string;
    kind?: string;
    duration?: string;
    unit?: string;
    price?: string;
    gymLimit?: string;
    share?: string;
    sort?: string;
  }) {
    await page.getByRole("button", { name: "Dodaj plan" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Vrsta").selectOption(values.kind ?? "gym");
    await dialog.getByLabel("Naziv").fill(values.name);
    await dialog.locator("#plan-duration").fill(values.duration ?? "1");
    if (values.unit !== undefined)
      await dialog.locator("#plan-unit").selectOption(values.unit);
    await dialog.getByLabel("Cijena (€)").fill(values.price ?? "50");
    if (values.gymLimit !== undefined)
      await dialog.getByLabel("Dolazaka u teretanu").fill(values.gymLimit);
    if (values.share !== undefined)
      await dialog.getByLabel("Udio trenera (%)").fill(values.share);
    if (values.sort !== undefined)
      await dialog.getByLabel("Redoslijed").fill(values.sort);
    await dialog.getByRole("button", { name: "Sačuvaj" }).click();
    return dialog;
  }
  async function outcome(dialog: ReturnType<Page["getByRole"]>, name: string) {
    await expect
      .poll(
        async () =>
          (await dialog.count()) === 0 ||
          (await dialog.locator(".text-danger").count()) > 0 ||
          ((await SAVED_PLAN(name)).data?.length ?? 0) > 0,
        { timeout: 15_000 },
      )
      .toBe(true);
    await page.waitForTimeout(500);
    const saved = (await SAVED_PLAN(name)).data ?? [];
    const shown = (
      await dialog
        .locator(".text-danger")
        .allInnerTexts()
        .catch(() => [])
    ).join(" / ");
    if (await dialog.count()) {
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
    }
    return { saved: saved.length > 0, row: saved[0], shown };
  }

  const tag = suffix().slice(0, 4);
  const DURATION =
    "Dnevna karta nema trajanje; svi ostali planovi ga moraju imati.";
  const PRICE_KIND =
    "Personalni nema unaprijed određenu cijenu; svi ostali planovi je moraju imati.";
  const cases: [string, Parameters<typeof attempt>[0], string | "saved"][] = [
    [
      "dnevna sa trajanjem",
      { name: `E2E D ${tag}`, kind: "day_pass", duration: "1", unit: "day" },
      DURATION,
    ],
    ["teretana bez trajanja", { name: `E2E T ${tag}`, duration: "" }, DURATION],
    [
      "personalni sa cijenom",
      { name: `E2E P ${tag}`, kind: "personal", price: "80" },
      PRICE_KIND,
    ],
    ["teretana bez cijene", { name: `E2E C ${tag}`, price: "" }, PRICE_KIND],
    ["naziv a", { name: "a" }, "Unesite naziv plana (2–50 znakova)."],
    [
      "naziv 51",
      { name: "N".repeat(51) },
      "Unesite naziv plana (2–50 znakova).",
    ],
    ["cijena 79,50", { name: `E2E Z ${tag}`, price: "79,50" }, "saved"],
    ["cijena 79.50", { name: `E2E Y ${tag}`, price: "79.50" }, "saved"],
    [
      "cijena -5",
      { name: `E2E M ${tag}`, price: "-5" },
      "Unesite iznos, na primjer 79 ili 79,50.",
    ],
    [
      "cijena abc",
      { name: `E2E A ${tag}`, price: "abc" },
      "Unesite iznos, na primjer 79 ili 79,50.",
    ],
    [
      "limit 0",
      { name: `E2E L0 ${tag}`, gymLimit: "0" },
      "Unesite cijeli broj veći od 0 ili ostavite prazno.",
    ],
    [
      "limit -1",
      { name: `E2E L1 ${tag}`, gymLimit: "-1" },
      "Unesite cijeli broj veći od 0 ili ostavite prazno.",
    ],
    [
      "udio 101",
      { name: `E2E U ${tag}`, share: "101" },
      "Udio mora biti između 0 i 100.",
    ],
    [
      "redoslijed 1000",
      { name: `E2E R ${tag}`, sort: "1000" },
      "Unesite cijeli broj od 0 do 999.",
    ],
  ];
  const failures: string[] = [];
  for (const [label, values, expected] of cases) {
    const result = await outcome(await attempt(values), values.name);
    note(
      `SET-14 ${label}: saved=${result.saved}${result.row ? ` ${JSON.stringify(result.row)}` : ""} shown="${result.shown}"`,
    );
    const ok =
      expected === "saved"
        ? result.saved
        : expected === "refused"
          ? !result.saved && result.shown !== ""
          : !result.saved && result.shown.includes(expected);
    if (!ok) failures.push(label);
  }
  await page.context().close();
  expect(failures).toEqual([]);
  console.log(`[note] all: ${notes.join(" | ")}`);
});
