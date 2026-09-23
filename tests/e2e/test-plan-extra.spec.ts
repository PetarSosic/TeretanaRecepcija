import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// TEST_PLAN.md §3: the cases the 22.09.2026 pass left NIJE IZVRŠENO, run against one
// synthetic gym (D-56). Serial, because they share one open shift (BR-110).
test.describe.configure({ mode: "serial" });

const PASSWORD = "planlozinka1";
const ZONE = "Europe/Podgorica";

let gymId: string;
const staff = {} as Record<
  "admin" | "owner" | "manager" | "ana" | "bojana" | "cena",
  TestStaff
>;
const plan = { mjesecna: "", studentska: "", dnevna: "" };
let productId: string;
const member = { m1: "", m2: "", m3: "", m5: "", m6: "", student: "" };
const card = { m1: "", empty: "" };
const category = { struja: "", voda: "" };
let studentMembershipId: string;

function cardCode(): string {
  return `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
}

function gymToday(): string {
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
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftDate(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
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
  gymId = await createTestGym(`${workerInfo.project.name}-plan-${suffix()}`);
  const make = (
    role: "admin" | "owner" | "manager" | "receptionist",
    fullName: string,
  ) => createTestStaff(gymId, { role, fullName, password: PASSWORD });
  staff.admin = await make("admin", "E2E Admin plana");
  staff.owner = await make("owner", "E2E Vlasnik plana");
  staff.manager = await make("manager", "E2E Menadžer plana");
  staff.ana = await make("receptionist", "E2E Ana");
  staff.bojana = await make("receptionist", "E2E Bojana");
  staff.cena = await make("receptionist", "E2E Cena");

  const admin = adminClient();
  const today = gymToday();

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
          sort_order: 1,
        },
        {
          gym_id: gymId,
          name: "E2E Studentska",
          kind: "gym",
          duration_value: 1,
          duration_unit: "month",
          price: 39,
          covers_gym: true,
          sort_order: 2,
        },
        {
          gym_id: gymId,
          name: "E2E Dnevna karta",
          kind: "day_pass",
          duration_value: null,
          duration_unit: null,
          price: 5,
          covers_gym: true,
          sort_order: 3,
        },
      ])
      .select("id, name")
      .returns<{ id: string; name: string }[]>(),
    "Test plans",
  );
  const byName = (name: string) => plans.find((p) => p.name === name)!.id;
  plan.mjesecna = byName("E2E Mjesečna");
  plan.studentska = byName("E2E Studentska");
  plan.dnevna = byName("E2E Dnevna karta");
  await must(
    admin
      .from("plan_finance")
      .insert(plans.map((p) => ({ plan_id: p.id, gym_id: gymId })))
      .select("plan_id"),
    "Test plan finance",
  );

  productId = (
    await must(
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
      "Test product",
    )
  ).id;

  const names = [
    ["E2E Prvi", "Član"],
    ["E2E Drugi", "Član"],
    ["E2E Treći", "Član"],
    ["E2E Peti", "Član"],
    ["E2E Šesti", "Član"],
    ["E2E Studentkinja", "Članica"],
  ];
  const created = await must(
    admin
      .from("members")
      .insert(
        names.map(([first, last], index) => ({
          gym_id: gymId,
          member_number: index + 1,
          first_name: first,
          last_name: last,
          phone: `+3826710000${index}`,
          email: `plan-${index}@e2e.invalid`,
          date_of_birth: "1990-01-01",
          created_by: staff.owner.id,
        })),
      )
      .select("id, member_number")
      .returns<{ id: string; member_number: number }[]>(),
    "Test members",
  );
  const id = (n: number) => created.find((m) => m.member_number === n)!.id;
  member.m1 = id(1);
  member.m2 = id(2);
  member.m3 = id(3);
  member.m5 = id(4);
  member.m6 = id(5);
  member.student = id(6);
  await must(
    admin
      .from("member_counters")
      .insert({ gym_id: gymId, last_number: names.length })
      .select("gym_id"),
    "Test member counter",
  );

  const membership = (memberId: string, planId: string) => ({
    gym_id: gymId,
    member_id: memberId,
    plan_id: planId,
    start_date: shiftDate(today, -5),
    end_date: shiftDate(today, 25),
    start_reason: "E2E",
    covers_gym: true,
    covers_group: false,
    covers_personal: false,
    is_backdated: true,
    created_by: staff.owner.id,
  });
  const memberships = await must(
    admin
      .from("memberships")
      .insert([
        membership(member.m1, plan.mjesecna),
        membership(member.m2, plan.mjesecna),
        membership(member.student, plan.studentska),
      ])
      .select("id, member_id")
      .returns<{ id: string; member_id: string }[]>(),
    "Test memberships",
  );
  studentMembershipId = memberships.find(
    (m) => m.member_id === member.student,
  )!.id;

  // MEM-12: 45 finished visits, i.e. three pages of 20.
  await must(
    admin
      .from("visits")
      .insert(
        Array.from({ length: 45 }, (_, index) => {
          const at = new Date(Date.now() - (index + 1) * 86_400_000);
          return {
            gym_id: gymId,
            member_id: member.m3,
            visit_type: "gym",
            is_unpaid: true,
            is_backdated: true,
            checked_in_at: at.toISOString(),
            checked_out_at: new Date(at.getTime() + 3_600_000).toISOString(),
            checked_in_by: staff.owner.id,
          };
        }),
      )
      .select("id"),
    "Test visits",
  );

  const batch = await must(
    admin
      .from("card_batches")
      .insert({ gym_id: gymId, quantity: 2, created_by: staff.owner.id })
      .select("id")
      .single<{ id: string }>(),
    "Test card batch",
  );
  card.m1 = cardCode();
  card.empty = cardCode();
  await must(
    admin
      .from("cards")
      .insert([
        {
          gym_id: gymId,
          code: card.m1,
          batch_id: batch.id,
          status: "active",
          member_id: member.m1,
          assigned_at: new Date().toISOString(),
        },
        {
          gym_id: gymId,
          code: card.empty,
          batch_id: batch.id,
          status: "unassigned",
          member_id: null,
          assigned_at: null,
        },
      ])
      .select("id"),
    "Test cards",
  );

  const categories = await must(
    admin
      .from("expense_categories")
      .insert([
        { gym_id: gymId, name: "E2E Struja" },
        { gym_id: gymId, name: "E2E Vodovod" },
      ])
      .select("id, name")
      .returns<{ id: string; name: string }[]>(),
    "Test categories",
  );
  category.struja = categories.find((c) => c.name === "E2E Struja")!.id;
  category.voda = categories.find((c) => c.name === "E2E Vodovod")!.id;
  await must(
    admin
      .from("expenses")
      .insert([
        {
          gym_id: gymId,
          spent_on: today,
          category_id: category.struja,
          description: "E2E struja gotovina",
          amount: 10,
          method: "cash",
          created_by: staff.owner.id,
        },
        {
          gym_id: gymId,
          spent_on: today,
          category_id: category.voda,
          description: "E2E voda kartica",
          amount: 20,
          method: "card",
          created_by: staff.owner.id,
        },
        {
          gym_id: gymId,
          spent_on: today,
          category_id: category.struja,
          description: "E2E struja van kase",
          amount: 30,
          method: null,
          created_by: staff.manager.id,
        },
        // D-63: listed, but left out of Ukupno.
        {
          gym_id: gymId,
          spent_on: today,
          category_id: category.struja,
          description: "E2E struja poništena",
          amount: 40,
          method: "cash",
          created_by: staff.owner.id,
          voided_at: new Date().toISOString(),
          voided_by: staff.owner.id,
          void_reason: "E2E greška",
        },
      ])
      .select("id"),
    "Test expenses",
  );
});

test.afterAll(async () => {
  await deleteTestGym(gymId);
});

async function signIn(page: Page, who: TestStaff, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Korisničko ime ili email").fill(who.identifier);
  await page.getByLabel("Lozinka", { exact: true }).fill(password);
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

async function passAudioOverlay(page: Page) {
  await page.getByRole("button", { name: "Počni rad" }).click();
  await expect(
    page.getByRole("heading", { name: "Skenirajte karticu" }),
  ).toBeVisible();
}

async function scan(page: Page, code: string) {
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await page.keyboard.type(code);
  await page.keyboard.press("Enter");
}

async function shifts() {
  const { data } = await adminClient()
    .from("shifts")
    .select("id, staff_id, closed_at, report_path")
    .eq("gym_id", gymId)
    .returns<
      {
        id: string;
        staff_id: string;
        closed_at: string | null;
        report_path: string | null;
      }[]
    >();
  return data ?? [];
}

async function menuItems(page: Page) {
  const nav = page.getByRole("navigation", { name: "Meni" });
  const top = (await nav.locator(":scope > ul > li").allInnerTexts()).map(
    (text) => text.trim(),
  );
  let settings: string[] = [];
  if (top.includes("Podešavanja")) {
    await nav.getByRole("button", { name: "Podešavanja" }).click();
    settings = (await page.getByRole("menuitem").allInnerTexts()).map((text) =>
      text.trim(),
    );
    await page.keyboard.press("Escape");
  }
  return { top, settings };
}

test("PERM-04: each role's menu lists only what it may open", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the menu is md+ only");
  const desk = ["Recepcija", "Članovi", "Uplate danas", "Magacin"];

  const ana = await signedIn(browser, staff.ana);
  await expect(ana).toHaveURL(/\/reception/);
  expect(await menuItems(ana)).toEqual({
    top: [...desk, "Zaključi smjenu"],
    settings: [],
  });

  const manager = await signedIn(browser, staff.manager);
  expect(await menuItems(manager)).toEqual({
    top: [...desk, "Statistika dolazaka", "Podešavanja"],
    settings: ["Korisnici", "Treneri", "Kartice"],
  });

  for (const who of [staff.owner, staff.admin]) {
    const page = await signedIn(browser, who);
    expect(await menuItems(page)).toEqual({
      top: [...desk, "Statistika dolazaka", "Finansije", "Podešavanja"],
      settings: [
        "Korisnici",
        "Treneri",
        "Kartice",
        "Planovi",
        "Proizvodi",
        "Podešavanja teretane",
      ],
    });
  }
});

test("SHIFT-11: a huge counted amount on S-02 gets the field message", async ({
  page,
}) => {
  test.skip(test.info().project.name !== "desktop");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page, staff.bojana);
  await expect(page).toHaveURL(/\/shift\/gate/);
  await page
    .getByLabel("Prebrojana gotovina za prethodnu smjenu (€)")
    .fill("999999999999");
  await page.getByRole("button", { name: "Preuzmi smjenu" }).click();
  await expect(
    page.getByText("Unesite iznos ili ostavite prazno."),
  ).toBeVisible();
  await expect(
    page.getByText("Došlo je do greške. Pokušajte ponovo."),
  ).toHaveCount(0);
  await expect(page).toHaveURL(/\/shift\/gate/);
  expect(errors).toEqual([]);

  const open = (await shifts()).filter((s) => s.closed_at === null);
  expect(open.map((s) => s.staff_id)).toEqual([staff.ana.id]);
});

test("SHIFT-05: [Odjavi se] on S-02 leaves the other shift alone", async ({
  page,
}) => {
  test.skip(test.info().project.name !== "desktop");
  await signIn(page, staff.bojana);
  await expect(page).toHaveURL(/\/shift\/gate/);
  await page.getByRole("button", { name: "Odjavi se" }).click();
  await expect(page).toHaveURL(/\/login/);

  const open = (await shifts()).filter((s) => s.closed_at === null);
  expect(open.map((s) => s.staff_id)).toEqual([staff.ana.id]);

  await signIn(page, staff.ana);
  await expect(page).toHaveURL(/\/reception/);
});

test("SHIFT-09: taking over after the owner closed the shift opens a new one", async ({
  page,
  browser,
}) => {
  test.skip(test.info().project.name !== "desktop");
  await signIn(page, staff.bojana);
  await expect(page).toHaveURL(/\/shift\/gate/);

  const owner = await signedIn(browser, staff.owner);
  await owner.goto("/finance/shifts");
  await owner.getByRole("button", { name: "Zaključi smjenu" }).click();
  await owner
    .getByRole("dialog")
    .getByRole("button", { name: "Zaključi smjenu" })
    .click();
  await expect(owner.getByText("Smjena je zaključena.")).toBeVisible();
  expect((await shifts()).filter((s) => s.closed_at === null)).toEqual([]);

  await page.getByRole("button", { name: "Preuzmi smjenu" }).click();
  await expect(page).toHaveURL(/\/reception/);
  const open = (await shifts()).filter((s) => s.closed_at === null);
  expect(open.map((s) => s.staff_id)).toEqual([staff.bojana.id]);
});

test("REC-10: with the double-scan guard at 0 the second scan checks out at once", async ({
  page,
  browser,
}) => {
  test.skip(test.info().project.name !== "desktop");
  const owner = await signedIn(browser, staff.owner);
  await owner.goto("/settings/gym");
  await owner.getByLabel("Zaštita od duplog skeniranja (s)").fill("0");
  await owner.getByRole("button", { name: "Sačuvaj" }).first().click();
  await expect(owner.getByText("Sačuvano.").first()).toBeVisible();
  const { data } = await adminClient()
    .from("gym_settings")
    .select("double_scan_seconds")
    .eq("gym_id", gymId)
    .single<{ double_scan_seconds: number }>();
  expect(data?.double_scan_seconds).toBe(0);

  await signIn(page, staff.bojana);
  await passAudioOverlay(page);
  await scan(page, card.m1);
  await expect(page.locator("[data-result=covered]")).toBeVisible();
  await page.keyboard.press("Escape");
  await scan(page, card.m1);
  await expect(
    page.getByText(/^Odjavljen\/a: E2E Prvi Član – 0h 0min$/),
  ).toBeVisible();
  await expect(page.getByText(/Odjaviti\?$/)).toHaveCount(0);

  await adminClient()
    .from("gym_settings")
    .update({ double_scan_seconds: 120 })
    .eq("gym_id", gymId);
});

test("REC-20: [Ručna prijava] on the profile runs the scan flow and marks the visit manual", async ({
  page,
}) => {
  test.skip(test.info().project.name !== "desktop");
  await signIn(page, staff.bojana);
  await page.goto(`/members/${member.m2}`);
  await page.getByRole("button", { name: "Ručna prijava" }).click();
  await expect(page.locator("[data-result=covered]")).toBeVisible();

  const { data } = await adminClient()
    .from("visits")
    .select("is_manual, checked_out_at")
    .eq("member_id", member.m2)
    .returns<{ is_manual: boolean; checked_out_at: string | null }[]>();
  expect(data).toEqual([{ is_manual: true, checked_out_at: null }]);
});

test("MEM-12: visits page by 20, and a wild page number does not break the profile", async ({
  page,
}) => {
  test.skip(test.info().project.name !== "desktop");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page, staff.owner);
  await page.goto(`/members/${member.m3}?tab=dolasci`);
  const rows = page.locator("table tbody tr");
  await expect(page.getByText("Strana 1 od 3")).toBeVisible();
  await expect(rows).toHaveCount(20);

  await page.getByRole("link", { name: "Sljedeća" }).click();
  await expect(page.getByText("Strana 2 od 3")).toBeVisible();
  await expect(rows).toHaveCount(20);
  await page.getByRole("link", { name: "Sljedeća" }).click();
  await expect(page.getByText("Strana 3 od 3")).toBeVisible();
  await expect(rows).toHaveCount(5);
  await page.getByRole("link", { name: "Prethodna" }).click();
  await expect(page.getByText("Strana 2 od 3")).toBeVisible();

  for (const strana of ["999", "abc", "-4"]) {
    const response = await page.goto(
      `/members/${member.m3}?tab=dolasci&strana=${strana}`,
    );
    expect(response?.status(), strana).toBe(200);
    await expect(
      page.getByRole("heading", { name: /E2E Treći Član/ }),
    ).toBeVisible();
    const pager = page.getByText(/^Strana -?\d+ od \d+$/);
    const pagerText = (await pager.count())
      ? await pager.first().textContent()
      : "no pager";
    note(`strana=${strana}: ${pagerText}, rows ${await rows.count()}`);
  }
  expect(errors).toEqual([]);
});

const notes: string[] = [];
function note(text: string) {
  notes.push(text);
  console.log(`[note] ${text}`);
}

const XSS_FIRST = "<script>alert(1)</script>";
const XSS_LAST = `O'Brien";--`;

test("MEM-18: HTML and SQL characters in a member's name stay plain text", async ({
  page,
}) => {
  test.skip(test.info().project.name !== "desktop");
  const dialogs: string[] = [];
  const errors: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await signIn(page, staff.bojana);
  await passAudioOverlay(page);
  await scan(page, card.empty);
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Novi član" }),
  ).toBeVisible();
  await dialog.getByLabel("Ime", { exact: true }).fill(XSS_FIRST);
  await dialog.getByLabel("Prezime").fill(XSS_LAST);
  await dialog.getByLabel("Telefon").fill("069 333 444");
  await dialog.getByLabel("Email").fill("xss@e2e.invalid");
  await dialog.getByLabel("Datum rođenja", { exact: true }).fill("01.02.2000");
  await dialog.getByLabel("Vrsta članarine").selectOption(plan.mjesecna);
  await dialog.getByText("Gotovina", { exact: true }).click();
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(dialog.getByText(/^Član #\d+ je kreiran\./)).toBeVisible({
    timeout: 15_000,
  });
  await dialog.getByRole("button", { name: "Zatvori" }).first().click();
  const full = `${XSS_FIRST} ${XSS_LAST}`;
  await expect(page.getByText(full).first()).toBeVisible();

  const { data: stored } = await adminClient()
    .from("members")
    .select("id, first_name, last_name")
    .eq("gym_id", gymId)
    .eq("last_name", XSS_LAST)
    .single<{ id: string; first_name: string; last_name: string }>();
  expect(stored?.first_name).toBe(XSS_FIRST);

  await page.goto(`/members/${stored!.id}`);
  await expect(page.getByRole("heading", { name: full })).toBeVisible();
  await page.goto("/members");
  await expect(page.getByText(full).first()).toBeVisible();
  await page.goto("/payments/today");
  await expect(page.getByText(XSS_LAST).first()).toBeVisible();
  expect(await page.locator("script:text('alert(1)')").count()).toBe(0);

  expect(dialogs).toEqual([]);
  expect(errors).toEqual([]);
});

test("PAY-04 and SET-15: an inactive plan stays listed but is not sold", async ({
  page,
  browser,
}) => {
  test.skip(test.info().project.name !== "desktop");
  const owner = await signedIn(browser, staff.owner);
  await owner.goto("/settings/plans");
  for (const name of ["E2E Dnevna karta", "E2E Studentska"]) {
    await owner
      .getByRole("row", { name: new RegExp(name) })
      .getByRole("button", { name: "Uredi" })
      .click();
    const dialog = owner.getByRole("dialog");
    await dialog.getByLabel("Aktivan").uncheck();
    await dialog.getByRole("button", { name: "Sačuvaj" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      owner.getByRole("row", { name: new RegExp(name) }).getByRole("cell", {
        name: "Ne",
        exact: true,
      }),
    ).toBeVisible();
  }

  // PAY-04
  await signIn(page, staff.bojana);
  await passAudioOverlay(page);
  await page.getByRole("button", { name: "Dnevna karta" }).click();
  await expect(
    page.getByText(
      "Dnevna karta nije podešena. Vlasnik je dodaje u planovima.",
    ),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // SET-15: not offered for sale, and the member who holds it keeps it untouched.
  await page.goto(`/members/${member.m5}`);
  await page.getByRole("button", { name: "Nova članarina" }).click();
  const options = await page
    .getByRole("dialog")
    .getByLabel("Vrsta članarine")
    .locator("option")
    .allInnerTexts();
  expect(options.join("|")).toContain("E2E Mjesečna");
  expect(options.join("|")).not.toContain("E2E Studentska");
  expect(options.join("|")).not.toContain("E2E Dnevna karta");
  await page.keyboard.press("Escape");

  const { data: held } = await adminClient()
    .from("memberships")
    .select("id, plan_id, voided_at")
    .eq("id", studentMembershipId)
    .single<{ id: string; plan_id: string; voided_at: string | null }>();
  expect(held).toEqual({
    id: studentMembershipId,
    plan_id: plan.studentska,
    voided_at: null,
  });
  await page.goto(`/members/${member.student}`);
  await expect(
    page.getByRole("cell", { name: /^E2E Studentska/ }).first(),
  ).toBeVisible();
  // What [Produži] offers for a plan that is no longer sold.
  await page.getByRole("button", { name: "Produži E2E Studentska" }).click();
  const renew = page.getByRole("dialog");
  await expect(renew).toBeVisible();
  note(
    `renew inactive: selected="${await renew
      .getByLabel("Vrsta članarine")
      .locator("option:checked")
      .textContent()}" options=${(
      await renew
        .getByLabel("Vrsta članarine")
        .locator("option")
        .allInnerTexts()
    ).join("/")}`,
  );
  await page.keyboard.press("Escape");

  await adminClient()
    .from("plans")
    .update({ is_active: true })
    .in("id", [plan.dnevna, plan.studentska]);
});

async function dayPassPayments() {
  const { count } = await adminClient()
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("gym_id", gymId)
    .eq("kind", "day_pass");
  return count ?? 0;
}

test("PAY-16: a double click on [Naplati] records one payment", async ({
  page,
}) => {
  test.skip(test.info().project.name !== "desktop");
  await signIn(page, staff.bojana);
  await passAudioOverlay(page);

  const before = await dayPassPayments();
  await page.getByRole("button", { name: "Dnevna karta" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByText("Gotovina", { exact: true })
    .click()
    .catch(() => {});
  await dialog.getByRole("button", { name: "Naplati" }).dblclick();
  await expect(
    page.getByText(/^Prodato: 1 × dnevna karta = 5,00 €$/).first(),
  ).toBeVisible();
  await page.waitForTimeout(3_000);
  expect(await dayPassPayments()).toBe(before + 1);

  await page.goto(`/members/${member.m5}`);
  await page.getByRole("button", { name: "Nova članarina" }).click();
  const sell = page.getByRole("dialog");
  await sell.getByLabel("Vrsta članarine").selectOption(plan.mjesecna);
  await sell.getByText("Gotovina", { exact: true }).click();
  await sell.getByRole("button", { name: "Naplati i sačuvaj" }).dblclick();
  await expect(page.getByText("Članarina sačuvana.").first()).toBeVisible();
  await page.waitForTimeout(3_000);
  const { count } = await adminClient()
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("member_id", member.m5);
  expect(count).toBe(1);
});

test("STO-12: with every product inactive the storage screen says so", async ({
  page,
}) => {
  test.skip(test.info().project.name !== "desktop");
  await signIn(page, staff.owner);
  await page.goto("/settings/products");
  await page
    .getByRole("row", { name: /E2E Voda/ })
    .getByRole("button", { name: "Uredi" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Aktivan").uncheck();
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(dialog).toBeHidden();

  await page.goto("/storage");
  await expect(
    page.getByText("Nema proizvoda. Vlasnik dodaje proizvode u Podešavanjima."),
  ).toBeVisible();

  await adminClient()
    .from("products")
    .update({ is_active: true })
    .eq("id", productId);
});

test("SET-05 and SET-06: editing changes only the name; a new password forces S-01b", async ({
  page,
  browser,
}) => {
  test.skip(test.info().project.name !== "desktop");
  await signIn(page, staff.owner);
  await page.goto("/settings/users");

  // SET-05
  await page
    .getByRole("row", { name: /E2E Cena/ })
    .getByRole("button", { name: "Uredi" })
    .click();
  const edit = page.getByRole("dialog");
  await expect(edit.getByRole("textbox")).toHaveCount(1);
  await expect(edit.getByRole("combobox")).toHaveCount(0);
  await edit.getByLabel("Ime i prezime").fill("Marija Marić-Popović");
  await edit.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Podaci su sačuvani.")).toBeVisible();
  await expect(
    page.getByRole("row", { name: /Marija Marić-Popović/ }),
  ).toBeVisible();
  const { data: after } = await adminClient()
    .from("staff")
    .select("full_name, username, role")
    .eq("id", staff.cena.id)
    .single<{ full_name: string; username: string; role: string }>();
  expect(after).toEqual({
    full_name: "Marija Marić-Popović",
    username: staff.cena.identifier,
    role: "receptionist",
  });

  // SET-06
  await page
    .getByRole("row", { name: /Marija Marić-Popović/ })
    .getByRole("button", { name: "Nova lozinka" })
    .click();
  const reset = page.getByRole("dialog");
  await expect(
    reset.getByText(
      "Korisnik će morati da postavi svoju lozinku pri sljedećoj prijavi.",
    ),
  ).toBeVisible();
  await reset.getByLabel("Privremena lozinka").fill("NovaLoz123");
  await reset.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Nova lozinka je postavljena.")).toBeVisible();

  const admin = await signedIn(browser, staff.admin);
  await admin.goto("/settings/users");
  const row = admin.getByRole("row", { name: /Marija Marić-Popović/ });
  await row.getByRole("button", { name: "Prikaži" }).click();
  await expect(row.getByText("NovaLoz123")).toBeVisible();

  const fresh = await browser.newContext();
  const cena = await fresh.newPage();
  await signIn(cena, staff.cena, "NovaLoz123");
  await expect(cena).toHaveURL(/\/change-password/);
  await expect(
    cena.getByText(
      "Prijavili ste se privremenom lozinkom. Postavite novu lozinku da nastavite.",
    ),
  ).toBeVisible();
  await fresh.close();
});

test("FIN-02: malformed period parameters fall back to Ovaj mjesec", async ({
  page,
}) => {
  test.skip(test.info().project.name !== "desktop");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page, staff.owner);
  for (const query of [
    "period=custom&from=2026-09-30&to=2026-09-01",
    "period=custom&from=abc&to=xyz",
    "period=izmisljeno",
    "period=custom&from=2026-02-31&to=2026-03-01",
  ]) {
    const response = await page.goto(`/finance?${query}`);
    expect(response?.status(), query).toBe(200);
    await expect(
      page.getByText("Prihod", { exact: true }).first(),
    ).toBeVisible();
    const preset = await page.getByLabel("Period").inputValue();
    const range =
      preset === "custom"
        ? `${await page.locator("#from").inputValue()}..${await page.locator("#to").inputValue()}`
        : "";
    const failed = await page
      .getByText("Došlo je do greške. Pokušajte ponovo.")
      .count();
    note(`FIN-02 ${query}: preset=${preset} ${range} errorScreen=${failed}`);
    expect.soft(preset, query).toBe("month");
  }
  expect(errors).toEqual([]);
});

test("FIN-09 and D-63: the filters narrow the list and its total, and stay in the address", async ({
  page,
}) => {
  test.skip(test.info().project.name !== "desktop");
  await signIn(page, staff.owner);
  await page.goto("/finance/expenses?period=month");
  const rows = page.locator("table tbody tr");
  const total = (amount: string) =>
    expect(page.getByText(`Ukupno: ${amount}`, { exact: true })).toBeVisible();
  await expect(rows).toHaveCount(4);
  await total("60,00 €");
  await expect(
    page.getByText("Poništeni troškovi nisu uračunati."),
  ).toBeVisible();

  const apply = () => page.getByRole("button", { name: "Prikaži" }).click();

  await page
    .getByLabel("Kategorija", { exact: true })
    .selectOption(category.struja);
  await apply();
  await expect(page).toHaveURL(new RegExp(`categoryId=${category.struja}`));
  await expect(page).toHaveURL(/period=month/);
  await expect(rows).toHaveCount(3);
  await total("40,00 €");

  await page.getByLabel("Način", { exact: true }).selectOption("none");
  await apply();
  await expect(rows).toHaveCount(1);
  await expect(
    page.getByRole("cell", { name: "E2E struja van kase" }),
  ).toBeVisible();
  await total("30,00 €");
  await expect(
    page.getByText("Poništeni troškovi nisu uračunati."),
  ).toHaveCount(0);

  await page.getByLabel("Način", { exact: true }).selectOption("card");
  await apply();
  await expect(
    page.getByText("Nema troškova u izabranom periodu."),
  ).toBeVisible();
  await total("0,00 €");

  await page.getByLabel("Kategorija", { exact: true }).selectOption("");
  await page.getByLabel("Način", { exact: true }).selectOption("");
  await page.getByLabel("Unio/la").selectOption(staff.manager.id);
  await apply();
  await expect(rows).toHaveCount(1);
  await expect(page.getByRole("cell", { name: "30,00 €" })).toBeVisible();
  await total("30,00 €");

  await page.getByLabel("Period").selectOption("last_month");
  await expect(page).toHaveURL(/period=last_month/);
  await expect(page).toHaveURL(new RegExp(`createdBy=${staff.manager.id}`));
  await expect(
    page.getByText("Nema troškova u izabranom periodu."),
  ).toBeVisible();
});

test("FIN-17: a back-dated visit without a member says Izaberite člana.", async ({
  page,
}) => {
  test.skip(test.info().project.name !== "desktop");
  await signIn(page, staff.owner);
  await page.goto("/finance/backdated");
  await page.getByLabel("Vrijeme ulaska").fill("10:00");
  await page.getByLabel("Vrijeme izlaska").fill("11:00");
  await page.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Izaberite člana.")).toBeVisible();
  const { count } = await adminClient()
    .from("visits")
    .select("id", { count: "exact", head: true })
    .eq("gym_id", gymId)
    .eq("is_backdated", true)
    .neq("member_id", member.m3);
  expect(count).toBe(0);
});

test("UX-02: on a slow network the skeleton shows and a sale is not doubled", async ({
  page,
}) => {
  test.skip(test.info().project.name !== "desktop");
  test.setTimeout(180_000);
  await signIn(page, staff.bojana);
  await page.goto(`/members/${member.m1}`);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  // Chrome DevTools' "Slow 3G" preset, switched on only around the step under test:
  // under it the dev server's unminified bundles alone take minutes to arrive.
  const slow = (on: boolean) =>
    cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: on ? 2000 : 0,
      downloadThroughput: on ? (500 * 1024) / 8 : -1,
      uploadThroughput: on ? (500 * 1024) / 8 : -1,
    });

  await slow(true);
  await page
    .getByRole("navigation", { name: "Meni" })
    .getByRole("link", { name: "Članovi" })
    .click();
  await expect(page.locator("[aria-busy=true]")).toBeVisible();
  await expect(page).toHaveURL(/\/members$/, { timeout: 90_000 });
  await slow(false);

  await page.goto(`/members/${member.m6}`);
  const sell = page.getByRole("dialog");
  // A click before hydration opens nothing, so click until the dialog is there.
  await expect(async () => {
    await page
      .getByRole("button", { name: "Nova članarina" })
      .click({ timeout: 2_000 });
    await expect(sell.getByLabel("Vrsta članarine")).toBeVisible({
      timeout: 1_000,
    });
  }).toPass();
  await sell.getByLabel("Vrsta članarine").selectOption(plan.mjesecna);
  await sell.getByText("Gotovina", { exact: true }).click();
  const submit = sell.getByRole("button", { name: "Naplati i sačuvaj" });
  await slow(true);
  await submit.click();
  await expect(submit).toBeDisabled();
  await expect(submit.locator("svg.animate-spin")).toBeVisible();
  await submit.click({ force: true, timeout: 2_000 }).catch(() => {});
  await expect(page.getByText("Članarina sačuvana.").first()).toBeVisible({
    timeout: 90_000,
  });
  await slow(false);
  await page.waitForTimeout(3_000);
  const { count } = await adminClient()
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("member_id", member.m6);
  expect(count).toBe(1);
});

test("MEM-18 (PDF): the shift report with that member is generated normally", async ({
  page,
}) => {
  test.skip(test.info().project.name !== "desktop");
  test.setTimeout(90_000);
  await signIn(page, staff.owner);
  await page.goto("/finance/shifts");
  await page.getByRole("button", { name: "Zaključi smjenu" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Zaključi smjenu" })
    .click();
  await expect(page.getByText("Smjena je zaključena.")).toBeVisible();

  const closed = (await shifts()).find(
    (s) => s.staff_id === staff.bojana.id && s.closed_at !== null,
  );
  expect(closed?.report_path).toBeTruthy();
  const response = await page.request.get(`/api/pdf/shift/${closed!.id}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/pdf");
  const body = await response.body();
  expect(body.subarray(0, 5).toString()).toBe("%PDF-");
  console.log(`[note] notes: ${notes.join(" | ")}`);
});
