import {
  expect,
  test,
  type Browser,
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

// TEST_PLAN.md §3, priority Visoko, group A: AUTH-21, PERM-07, PERM-10, SHIFT-04,
// REC-04, REC-05, REC-12, REC-13, REC-15, REC-17 (REC-09 is recorded from
// test-plan-reception.spec.ts). One synthetic gym (D-56), serial.
test.describe.configure({ mode: "serial" });

const PASSWORD = "visokoAlozinka1";
const ZONE = "Europe/Podgorica";

let gymId: string;
const staff = {} as Record<
  "admin" | "owner" | "manager" | "ana" | "bojana",
  TestStaff
>;
const trainer = { milena: "", julija: "", tatjana: "" };
const member = { combo: "", plain: "", history: "" };
const card = { combo: "", plain: "" };
let batchId: string;
let mjesecnaId: string;

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

function cardCode(): string {
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
  gymId = await createTestGym(`${workerInfo.project.name}-visa-${suffix()}`);
  for (const [key, role, name] of [
    ["admin", "admin", "E2E Admin A"],
    ["owner", "owner", "E2E Vlasnik A"],
    ["manager", "manager", "E2E Menadžer A"],
    ["ana", "receptionist", "E2E Ana A"],
    ["bojana", "receptionist", "E2E Bojana A"],
  ] as const)
    staff[key] = await createTestStaff(gymId, {
      role,
      fullName: name,
      password: PASSWORD,
    });
  const admin = adminClient();

  const trainers = await must(
    admin
      .from("trainers")
      .insert(
        ["E2E Milena", "E2E Julija", "E2E Tatjana"].map((full_name) => ({
          gym_id: gymId,
          full_name,
        })),
      )
      .select("id, full_name")
      .returns<{ id: string; full_name: string }[]>(),
    "Test trainers",
  );
  const t = (name: string) =>
    trainers.find((row) => row.full_name === name)!.id;
  trainer.milena = t("E2E Milena");
  trainer.julija = t("E2E Julija");
  trainer.tatjana = t("E2E Tatjana");
  await must(
    admin
      .from("trainer_finance")
      .insert(trainers.map((row) => ({ trainer_id: row.id, gym_id: gymId })))
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
  const group = programs.find((p) => p.kind === "group")!.id;
  const personal = programs.find((p) => p.kind === "personal")!.id;
  // BR-023: Milena group only, Tatjana personal only, Julija both.
  await must(
    admin
      .from("trainer_programs")
      .insert([
        { gym_id: gymId, trainer_id: trainer.milena, program_id: group },
        { gym_id: gymId, trainer_id: trainer.julija, program_id: group },
        { gym_id: gymId, trainer_id: trainer.julija, program_id: personal },
        { gym_id: gymId, trainer_id: trainer.tatjana, program_id: personal },
      ])
      .select("trainer_id"),
    "Test assignments",
  );

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
          covers_group: false,
          covers_personal: false,
          requires_trainer: false,
          sort_order: 1,
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
          sort_order: 2,
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
          sort_order: 3,
        },
      ])
      .select("id, name")
      .returns<{ id: string; name: string }[]>(),
    "Test plans",
  );
  const p = (name: string) => plans.find((row) => row.name === name)!.id;
  mjesecnaId = p("E2E Mjesečna");
  await must(
    admin
      .from("plan_finance")
      .insert(plans.map((row) => ({ plan_id: row.id, gym_id: gymId })))
      .select("plan_id"),
    "Test plan finance",
  );

  // REC-13: eleven members named Anić, so the list stops at eight.
  const rows = [
    ["Kombinovani", "Član", "+38269100001"],
    ["Obični", "Član", "+38269100002"],
    ["Istorija", "Uplata", "+38269100003"],
    ...Array.from({ length: 11 }, (_, i) => [
      `Ana${i}`,
      "Anić",
      `+3826711000${i}`,
    ]),
  ];
  const created = await must(
    admin
      .from("members")
      .insert(
        rows.map(([first, last, phone], index) => ({
          gym_id: gymId,
          member_number: index + 1,
          first_name: first.startsWith("Ana") ? first : `E2E ${first}`,
          last_name: last,
          phone,
          email: `visa-${index}@e2e.invalid`,
          date_of_birth: "1990-01-01",
          created_by: staff.owner.id,
        })),
      )
      .select("id, member_number")
      .returns<{ id: string; member_number: number }[]>(),
    "Test members",
  );
  const m = (n: number) => created.find((row) => row.member_number === n)!.id;
  member.combo = m(1);
  member.plain = m(2);
  member.history = m(3);
  await must(
    admin
      .from("member_counters")
      .insert({ gym_id: gymId, last_number: rows.length })
      .select("gym_id"),
    "Test member counter",
  );
  const membership = (
    memberId: string,
    planId: string,
    extra: Record<string, unknown>,
  ) => ({
    gym_id: gymId,
    member_id: memberId,
    plan_id: planId,
    start_date: gymDate(-3),
    end_date: gymDate(27),
    start_reason: "E2E",
    covers_gym: false,
    covers_group: false,
    covers_personal: false,
    group_session_limit: null,
    personal_session_limit: null,
    trainer_id: null,
    is_backdated: true,
    created_by: staff.owner.id,
    ...extra,
  });
  const memberships = await must(
    admin
      .from("memberships")
      .insert([
        membership(member.combo, p("E2E G+T"), {
          covers_gym: true,
          covers_group: true,
          group_session_limit: 12,
          trainer_id: trainer.milena,
        }),
        membership(member.combo, p("E2E Personalni"), {
          covers_personal: true,
          personal_session_limit: 8,
          trainer_id: trainer.julija,
        }),
        membership(member.plain, p("E2E Mjesečna"), { covers_gym: true }),
        membership(member.history, p("E2E Mjesečna"), { covers_gym: true }),
      ])
      .select("id, member_id")
      .returns<{ id: string; member_id: string }[]>(),
    "Test memberships",
  );
  // PERM-07: an old back-dated payment, a voided one from an earlier day, and the sale.
  const historyMembership = memberships.find(
    (row) => row.member_id === member.history,
  )!.id;
  await must(
    admin
      .from("payments")
      .insert([
        {
          gym_id: gymId,
          kind: "membership",
          membership_id: historyMembership,
          member_id: member.history,
          plan_id: p("E2E Mjesečna"),
          amount: 79,
          method: "cash",
          paid_on: gymDate(-3),
          is_backdated: true,
          created_by: staff.owner.id,
        },
        {
          gym_id: gymId,
          kind: "card_replacement",
          member_id: member.history,
          amount: 7,
          method: "card",
          paid_on: gymDate(-2),
          is_backdated: true,
          created_by: staff.owner.id,
          voided_at: new Date().toISOString(),
          voided_by: staff.owner.id,
          void_reason: "E2E greška",
        },
      ])
      .select("id"),
    "Test history payments",
  );

  const batch = await must(
    admin
      .from("card_batches")
      .insert({ gym_id: gymId, quantity: 2, created_by: staff.owner.id })
      .select("id")
      .single<{ id: string }>(),
    "Test batch",
  );
  batchId = batch.id;
  card.combo = cardCode();
  card.plain = cardCode();
  await must(
    admin
      .from("cards")
      .insert(
        [
          [card.combo, member.combo],
          [card.plain, member.plain],
        ].map(([code, memberId]) => ({
          gym_id: gymId,
          code,
          batch_id: batch.id,
          status: "active",
          member_id: memberId,
          assigned_at: new Date().toISOString(),
        })),
      )
      .select("id"),
    "Test cards",
  );
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

const notes: string[] = [];
function note(text: string) {
  notes.push(text);
  console.log(`[note] ${text}`);
}

async function shiftRows() {
  const { data } = await adminClient()
    .from("shifts")
    .select("staff_id, closed_at, counted_cash")
    .eq("gym_id", gymId)
    .order("started_at")
    .returns<
      {
        staff_id: string;
        closed_at: string | null;
        counted_cash: number | null;
      }[]
    >();
  return data ?? [];
}

test("SHIFT-04: counted cash on S-02 — empty, 0 and 1000 pass; abc, -5, 12,345 do not", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const first = await signedIn(browser, staff.ana);
  await expect(first).toHaveURL(/\/reception/);
  await first.context().close();

  // Each takeover hands the shift to the other receptionist, so three passing values
  // take three turns: B takes 1000, A takes 0, B takes it empty.
  const turns: [TestStaff, string, number | null][] = [
    [staff.bojana, "1000", 1000],
    [staff.ana, "0", 0],
    [staff.bojana, "", null],
  ];
  for (const [index, [who, value, stored]] of turns.entries()) {
    const page = await signedIn(browser, who);
    await expect(page).toHaveURL(/\/shift\/gate/);
    const field = page.getByLabel(
      "Prebrojana gotovina za prethodnu smjenu (€)",
    );
    if (index === 0)
      for (const bad of ["abc", "-5", "12,345"]) {
        const takeOver = page.getByRole("button", { name: "Preuzmi smjenu" });
        await field.fill(bad);
        await expect(field).toHaveValue(bad);
        await takeOver.click();
        await expect(
          page.getByText("Unesite iznos ili ostavite prazno."),
          bad,
        ).toBeVisible();
        // The form resets after every answer; the next value goes in only after it.
        await expect(takeOver).toBeEnabled();
        await expect(field).toHaveValue("");
        await expect(page).toHaveURL(/\/shift\/gate/);
      }
    await field.fill(value);
    await page.getByRole("button", { name: "Preuzmi smjenu" }).click();
    await expect(page, `value "${value}"`).toHaveURL(/\/reception/);
    const closed = (await shiftRows()).filter((row) => row.closed_at)[index];
    expect(
      closed.counted_cash === null ? null : Number(closed.counted_cash),
    ).toBe(stored);
    await page.context().close();
  }
  const open = (await shiftRows()).filter((row) => !row.closed_at);
  expect(open.map((row) => row.staff_id)).toEqual([staff.bojana.id]);
});

test("REC-05 and REC-04: only assigned trainers are offered, and a forged one is refused", async ({
  page,
}) => {
  await signIn(page, staff.bojana);
  await startWork(page);
  await scan(page, card.combo);
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: /^Prijava:/ }),
  ).toBeVisible();

  await dialog.getByText("Grupni", { exact: true }).click();
  const trainerSelect = dialog.getByLabel("Trener");
  const options = async () =>
    (
      await trainerSelect.locator("option:not([disabled])").allInnerTexts()
    ).sort();
  expect(await options()).toEqual(["E2E Julija", "E2E Milena"]);
  // REC-04: the placeholder cannot be chosen back, and [Prijavi] needs a trainer.
  await expect(trainerSelect.locator("option[value='']")).toBeDisabled();
  await dialog.getByText("Personalni", { exact: true }).click();
  expect(await options()).toEqual(["E2E Julija", "E2E Tatjana"]);
  await dialog.getByText("Grupni", { exact: true }).click();
  await trainerSelect.selectOption(trainer.milena);

  // Forged requests: the server action receives a trainer the form never offered.
  let replace: [string, string] = [
    `"${trainer.milena}"`,
    `"${trainer.tatjana}"`,
  ];
  await page.route("**/*", async (route: Route) => {
    const request = route.request();
    if (request.method() === "POST" && request.headers()["next-action"]) {
      const body = request.postData() ?? "";
      if (body.includes(replace[0]) && body.includes('"group"'))
        return route.continue({
          postData: body.split(replace[0]).join(replace[1]),
        });
    }
    return route.continue();
  });
  await dialog.getByRole("button", { name: "Prijavi" }).click();
  await expect(
    page.getByText("Trener nije dodijeljen ovom programu.").first(),
  ).toBeVisible();
  replace = [`"trainerId":"${trainer.milena}"`, `"trainerId":null`];
  await page.keyboard.press("Escape");
  await scan(page, card.combo);
  await dialog.getByText("Grupni", { exact: true }).click();
  await dialog.getByLabel("Trener").selectOption(trainer.milena);
  await dialog.getByRole("button", { name: "Prijavi" }).click();
  await expect(page.getByText("Izaberite trenera.").first()).toBeVisible();
  await page.unroute("**/*");

  const { count } = await adminClient()
    .from("visits")
    .select("id", { count: "exact", head: true })
    .eq("member_id", member.combo);
  expect(count).toBe(0);
});

test("REC-12, REC-13 and REC-15: reception search, and typing that is not a scan", async ({
  page,
}) => {
  await signIn(page, staff.bojana);
  await startWork(page);
  const search = page.getByLabel("Pretraga člana (ime, telefon, broj)");
  const results = page.locator("#reception-search-results > li");

  // REC-13: the list arrives about 250 ms after the last key and stops at eight.
  await search.fill("");
  const typed = Date.now();
  await search.pressSequentially("ani", { delay: 30 });
  const afterTyping = Date.now();
  await expect(results.first()).toBeVisible();
  note(
    `REC-13 results ${Date.now() - afterTyping} ms after the last key (typing took ${afterTyping - typed} ms)`,
  );
  await expect(results).toHaveCount(8);
  for (const row of await results.all())
    await expect(
      row.getByRole("link", { name: "Otvori profil" }),
    ).toBeVisible();
  for (const [query, expected] of [
    ["anic", /Anić/],
    ["ANIĆ", /Anić/],
    ["3", /E2E Istorija Uplata/],
    ["0691", /E2E Kombinovani Član/],
  ] as const) {
    await search.fill(query);
    await expect(results.first(), query).toContainText(expected);
  }
  // BR-044's phone match needs three digits once the leading 0 is dropped, so "069"
  // alone (digits "69") finds nobody by phone.
  await search.fill("069");
  await expect(
    page.getByText("Nema članova koji odgovaraju pretrazi."),
  ).toBeVisible();
  note('REC-13 "069" → no result; "0691" → found');
  await search.fill("zzzz");
  await expect(
    page.getByText("Nema članova koji odgovaraju pretrazi."),
  ).toBeVisible();

  // REC-15: ten digits and Enter in the search field are a search, not a scan.
  await search.fill("1234567890");
  await search.press("Enter");
  await page.waitForTimeout(800);
  expect((await page.getByRole("status").textContent())?.trim() ?? "").toBe("");
  await search.fill("");
  // With a dialog open the digits go to the dialog (into "Opis", or nowhere for the day
  // pass, whose quantity is a stepper), never to the scanner.
  for (const [button, field] of [
    ["Trošak", "Opis"],
    ["Dnevna karta", null],
    ["Novi član", "Ime"],
  ] as const) {
    await page.getByRole("button", { name: button }).click();
    const dialog = page.getByRole("dialog");
    if (field) await dialog.getByLabel(field, { exact: true }).click();
    else await dialog.getByRole("heading").click();
    await page.keyboard.type("1234567890");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(
      (await page.getByRole("status").textContent())?.trim() ?? "",
      button,
    ).toBe("");
  }
  const { count: dayPasses } = await adminClient()
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("gym_id", gymId)
    .eq("kind", "day_pass");
  expect(dayPasses).toBe(0);

  // REC-12: a member already inside, picked from the search, is not checked in again.
  await scan(page, card.plain);
  await expect(page.locator("[data-result=covered]")).toBeVisible();
  await page.keyboard.press("Escape");
  await search.fill("Obični");
  await results
    .filter({ hasText: "E2E Obični Član" })
    .getByRole("button")
    .click();
  await expect(page.getByText("Član je već u teretani.").first()).toBeVisible();
  const { count } = await adminClient()
    .from("visits")
    .select("id", { count: "exact", head: true })
    .eq("member_id", member.plain);
  expect(count).toBe(1);
});

test("REC-17: the in-gym list, its counters and the minute-by-minute duration", async ({
  page,
}) => {
  test.setTimeout(120_000);
  // The plain member is in since REC-12; the combo member checks in to the gym now.
  await signIn(page, staff.bojana);
  await startWork(page);
  await scan(page, card.combo);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Prijavi" }).click();
  await expect(page.locator("[data-result=covered]")).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(
    page.getByText(/^U teretani: 2 · Danas dolazaka: 2$/),
  ).toBeVisible();
  const row = page.locator("li", { hasText: "E2E Kombinovani Član" }).last();
  await expect(row).toContainText("#1");
  await expect(row).toContainText("Teretana");
  // The ticker counts from page load, so a visit is moved 110 s back and the page
  // reloaded: it shows 1 min, and the next tick (60 s later) shows 2 min.
  await adminClient()
    .from("visits")
    .update({ checked_in_at: new Date(Date.now() - 110_000).toISOString() })
    .eq("member_id", member.combo)
    .is("checked_out_at", null);
  await page.reload();
  await startWork(page);
  await expect(row).toContainText("0h 1min");
  const before = (await row.innerText()).replace(/\s+/g, " ");
  await page.waitForTimeout(62_000);
  const after = (await row.innerText()).replace(/\s+/g, " ");
  note(`REC-17 row: "${before}" → after a minute "${after}"`);
  await expect(row).toContainText("0h 2min");

  await page.getByRole("button", { name: "Odjavi E2E Obični Član" }).click();
  await expect(
    page.getByText(/^U teretani: 1 · Danas dolazaka: 2$/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Odjavi E2E Kombinovani Član" })
    .click();
  await expect(
    page.getByText("Trenutno nema nikoga u teretani."),
  ).toBeVisible();
});

test("AUTH-21: reload, back and forward, two tabs, and signing out in one of them", async ({
  browser,
}) => {
  const page = await signedIn(browser, staff.bojana);
  const badge = /^Smjena: E2E Bojana A od \d{2}:\d{2}$/;
  await expect(page.getByText(badge)).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/reception/);
  await expect(page.getByText(badge)).toBeVisible();
  await page.goto("/members");
  await page.goBack();
  await expect(page).toHaveURL(/\/reception/);
  await page.goForward();
  await expect(page).toHaveURL(/\/members/);
  await expect(page.getByText(badge)).toBeVisible();

  const second = await page.context().newPage();
  await second.goto("/payments/today");
  await expect(second.getByText(badge)).toBeVisible();

  await page.getByRole("button", { name: "Nalog" }).click();
  await page.getByRole("menuitem", { name: "Odjava" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Odjavi se" })
    .click();
  await expect(page).toHaveURL(/\/login/);

  await second
    .getByRole("navigation", { name: "Meni" })
    .getByRole("link", { name: "Članovi" })
    .click();
  await expect(second).toHaveURL(/\/login/);
  await page.context().close();
});

test("PERM-07: payment history on the profile — the desk sees today, the owner everything", async ({
  browser,
}) => {
  // Today's sale for the history member, at the desk.
  const desk = await signedIn(browser, staff.bojana);
  await desk.goto(`/members/${member.history}`);
  await desk.getByRole("button", { name: "Nova članarina" }).click();
  const sell = desk.getByRole("dialog");
  await sell.getByLabel("Vrsta članarine").selectOption(mjesecnaId);
  await sell.getByText("Gotovina", { exact: true }).click();
  await sell.getByRole("button", { name: "Naplati i sačuvaj" }).click();
  await expect(desk.getByText("Članarina sačuvana.").first()).toBeVisible();

  await desk.goto(`/members/${member.history}?tab=uplate`);
  const deskRows = desk.locator("table tbody tr");
  await expect(deskRows).toHaveCount(1);
  await expect(deskRows.first()).not.toContainText("Naknadno");
  await desk.context().close();

  const owner = await signedIn(browser, staff.owner);
  await owner.goto(`/members/${member.history}?tab=uplate`);
  const ownerRows = owner.locator("table tbody tr");
  await expect(ownerRows).toHaveCount(3);
  await expect(ownerRows.filter({ hasText: "Naknadno" })).toHaveCount(2);
  const voided = ownerRows.filter({ hasText: "Poništeno" });
  await expect(voided).toHaveCount(1);
  await expect(voided).toHaveClass(/line-through/);
  await owner.context().close();
});

test("PERM-10: the card sheet PDF opens for owner, admin and manager, 404 for the desk", async ({
  browser,
}) => {
  for (const [who, allowed] of [
    [staff.owner, true],
    [staff.admin, true],
    [staff.manager, true],
    [staff.ana, false],
  ] as const) {
    const page = await signedIn(browser, who);
    const response = await page.request.get(`/api/pdf/cards/${batchId}`);
    const body = await response.body();
    if (allowed) {
      expect(response.status(), who.fullName).toBe(200);
      expect(body.subarray(0, 5).toString(), who.fullName).toBe("%PDF-");
    } else {
      expect(response.status(), who.fullName).toBe(404);
      expect(body.includes(Buffer.from("%PDF-"))).toBe(false);
    }
    await page.context().close();
  }
  console.log(`[note] all: ${notes.join(" | ")}`);
});
