import {
  expect,
  test,
  type Browser,
  type BrowserContext,
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

// TEST_PLAN.md §3, priority Srednje, group A (shift, reception, membership, desk money,
// storage and the shift close): SHIFT-06, REC-18, REC-19, REC-21, MSHIP-04, PAY-13,
// STO-07, STO-10, CLOSE-02 and CLOSE-08. One synthetic gym (D-56), serial: one shift of
// the receptionist Ana runs through every case, and the owner closes it at the end.
test.describe.configure({ mode: "serial" });

const PASSWORD = "srednjeAlozinka1";
const ZONE = "Europe/Podgorica";

let gymId: string;
const staff = {} as Record<
  "admin" | "owner" | "manager" | "ana" | "bojan",
  TestStaff
>;
const plan = { nedeljna: "", mjesecna: "", dnevna: "" };
const member = { zvuk: "", trka: "", ponoc: "", dug: "" };
const card = { zvuk: "", trka: "", ponoc: "" };
const category = { potrosni: "" };

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
  return { iso, display: `${d}.${m}.${y}` };
}

/** A local wall-clock time of the gym, as an instant (BR-001). */
function gymInstant(date: string, time: string): Date {
  const offset =
    new Intl.DateTimeFormat("en-US", {
      timeZone: ZONE,
      timeZoneName: "longOffset",
    })
      .formatToParts(new Date(`${date}T12:00:00Z`))
      .find((part) => part.type === "timeZoneName")
      ?.value.slice(3) || "+00:00";
  return new Date(`${date}T${time}:00${offset}`);
}

function gymTime(at: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
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

const notes: string[] = [];
function note(text: string) {
  notes.push(text);
  console.log(`[note] ${text}`);
}

test.beforeAll(async ({}, workerInfo) => {
  test.skip(workerInfo.project.name !== "desktop");
  gymId = await createTestGym(`${workerInfo.project.name}-srda-${suffix()}`);
  for (const [key, role, name] of [
    ["admin", "admin", "E2E Admin SA"],
    ["owner", "owner", "E2E Vlasnik SA"],
    ["manager", "manager", "E2E Menadžer SA"],
    ["ana", "receptionist", "E2E Ana SA"],
    ["bojan", "receptionist", "E2E Bojan SA"],
  ] as const)
    staff[key] = await createTestStaff(gymId, {
      role,
      fullName: name,
      password: PASSWORD,
    });
  const admin = adminClient();
  const categories = await must(
    admin
      .from("expense_categories")
      .insert([
        // BR-130: every stock-in expense goes to this system category.
        { gym_id: gymId, name: "Roba za prodaju", is_system: true, is_salary: false },
        { gym_id: gymId, name: "E2E Potrošni", is_system: false, is_salary: false },
      ])
      .select("id, name")
      .returns<{ id: string; name: string }[]>(),
    "Test categories",
  );
  category.potrosni = categories.find((c) => c.name === "E2E Potrošni")!.id;
  const base = {
    gym_id: gymId,
    covers_gym: true,
    covers_group: false,
    covers_personal: false,
    requires_trainer: false,
  };
  const plans = await must(
    admin
      .from("plans")
      .insert([
        { ...base, name: "E2E Nedeljna", kind: "gym", price: 39, duration_value: 7, duration_unit: "day", sort_order: 1 },
        { ...base, name: "E2E Mjesečna", kind: "gym", price: 79, duration_value: 1, duration_unit: "month", sort_order: 2 },
        { ...base, name: "E2E Dnevna karta", kind: "day_pass", price: 10, duration_value: null, duration_unit: null, sort_order: 3 },
      ])
      .select("id, name")
      .returns<{ id: string; name: string }[]>(),
    "Test plans",
  );
  plan.nedeljna = plans.find((p) => p.name === "E2E Nedeljna")!.id;
  plan.mjesecna = plans.find((p) => p.name === "E2E Mjesečna")!.id;
  plan.dnevna = plans.find((p) => p.name === "E2E Dnevna karta")!.id;
  await must(
    admin
      .from("plan_finance")
      .insert(plans.map((p) => ({ plan_id: p.id, gym_id: gymId })))
      .select("plan_id"),
    "Test plan finance",
  );
  await must(
    admin
      .from("products")
      .insert([
        { gym_id: gymId, name: "E2E Voda", current_purchase_price: 0.3, sale_price: 1.5 },
        { gym_id: gymId, name: "E2E Prazno", current_purchase_price: 1, sale_price: 3 },
      ])
      .select("id"),
    "Test products",
  );
  const names = [
    ["zvuk", "Zvučni", "Član"],
    ["trka", "Trka", "Dvojica"],
    ["ponoc", "Ponoć", "Kasni"],
    ["dug", "Stari", "Dug"],
  ] as const;
  const created = await must(
    admin
      .from("members")
      .insert(
        names.map(([, first, last], index) => ({
          gym_id: gymId,
          member_number: index + 1,
          first_name: `E2E ${first}`,
          last_name: last,
          phone: `+3826790400${index}`,
          email: `srda-${index}@e2e.invalid`,
          date_of_birth: "1990-01-01",
          created_by: staff.owner.id,
        })),
      )
      .select("id, member_number")
      .returns<{ id: string; member_number: number }[]>(),
    "Test members",
  );
  for (const [index, [key]] of names.entries())
    member[key] = created.find((m) => m.member_number === index + 1)!.id;
  await must(
    admin
      .from("member_counters")
      .insert({ gym_id: gymId, last_number: names.length })
      .select("gym_id"),
    "Test member counter",
  );
  // Valid memberships for the three who are scanned; "Stari Dug" has none (MSHIP-04).
  await must(
    admin
      .from("memberships")
      .insert(
        [member.zvuk, member.trka, member.ponoc].map((memberId) => ({
          gym_id: gymId,
          member_id: memberId,
          plan_id: plan.mjesecna,
          start_date: gymDate(-5).iso,
          end_date: gymDate(25).iso,
          start_reason: "E2E",
          covers_gym: true,
          covers_group: false,
          covers_personal: false,
          is_backdated: true,
          created_by: staff.owner.id,
        })),
      )
      .select("id"),
    "Test memberships",
  );
  const batch = await must(
    admin
      .from("card_batches")
      .insert({ gym_id: gymId, quantity: 3, created_by: staff.owner.id })
      .select("id")
      .single<{ id: string }>(),
    "Test batch",
  );
  card.zvuk = code();
  card.trka = code();
  card.ponoc = code();
  await must(
    admin
      .from("cards")
      .insert(
        (["zvuk", "trka", "ponoc"] as const).map((key) => ({
          gym_id: gymId,
          code: card[key],
          batch_id: batch.id,
          status: "active",
          member_id: member[key],
          assigned_at: new Date().toISOString(),
        })),
      )
      .select("id"),
    "Test cards",
  );
});

test.afterAll(async ({}, workerInfo) => {
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

async function scan(page: Page, value: string) {
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await page.keyboard.type(value);
  await page.keyboard.press("Enter");
}

/** The browser as the page's own session: what a request "sent anyway" can do. */
async function sessionOf(who: TestStaff) {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const email = who.identifier.includes("@")
    ? who.identifier
    : `${who.identifier}@${process.env.STAFF_EMAIL_DOMAIN}`;
  const { error } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (error) throw new Error(`Session for ${who.fullName}: ${error.message}`);
  return client;
}

const badge = (page: Page) =>
  page.locator("header").getByText(/^(Smjena: .+ od \d\d:\d\d|Nema otvorene smjene)$/);

test("SHIFT-06 (1): with no shift open, the owner and the manager see „Nema otvorene smjene“", async ({
  browser,
}) => {
  for (const who of [staff.owner, staff.manager, staff.admin]) {
    const page = await signedIn(browser, who);
    await expect(badge(page).first()).toHaveText("Nema otvorene smjene");
    await page.context().close();
  }
});

test("REC-18: the [Počni rad] overlay — once, over S-03 only, and the sounds it unlocks", async ({
  browser,
}) => {
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });
  // Every play() and how the browser answered it (autoplay policy).
  await context.addInitScript(() => {
    const log: { src: string; outcome: string; muted: boolean }[] = [];
    (window as unknown as { __plays: typeof log }).__plays = log;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      const entry = { src: this.src, outcome: "pending", muted: this.muted };
      log.push(entry);
      const result = play.call(this);
      result.then(
        () => (entry.outcome = "played"),
        (error: Error) => (entry.outcome = error.name),
      );
      return result;
    };
  });
  const page = await context.newPage();
  await signIn(page, staff.ana);
  await expect(page).toHaveURL(/\/reception/);
  const hint = page.getByText("Uključuje zvuk za rezultate skeniranja.");
  await expect(hint).toBeVisible();
  await expect(page.getByRole("button", { name: "Počni rad" })).toBeFocused();

  // The header stays usable under the overlay: the menu leads away and back.
  await page
    .locator("header")
    .getByRole("link", { name: "Članovi", exact: true })
    .click();
  await expect(page).toHaveURL(/\/members$/);
  await page
    .locator("header")
    .getByRole("link", { name: "Recepcija", exact: true })
    .click();
  await expect(hint).toBeVisible();

  await page.getByRole("button", { name: "Počni rad" }).click();
  await expect(hint).toBeHidden();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Skenirajte karticu" }),
  ).toBeVisible();
  await expect(hint).toBeHidden();
  await page.locator("header").getByRole("link", { name: "Članovi", exact: true }).click();
  await page.locator("header").getByRole("link", { name: "Recepcija", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Skenirajte karticu" }),
  ).toBeVisible();
  await expect(hint).toBeHidden();

  // The three sound files exist and are served as audio.
  for (const name of ["ok", "warning", "alarm"]) {
    const response = await page.request.get(`/sounds/${name}.mp3`);
    const body = await response.body();
    note(
      `REC-18 /sounds/${name}.mp3 → ${response.status()} ${response.headers()["content-type"]} ${body.byteLength} B`,
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("audio");
    expect(body.byteLength).toBeGreaterThan(500);
  }

  // A scan after the unlock plays "ok", and the browser lets it.
  await scan(page, card.zvuk);
  await expect(page.locator("[data-result=covered]")).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() =>
        (window as unknown as { __plays: { src: string; outcome: string }[] }).__plays
          .filter((p) => p.src.endsWith("/ok.mp3"))
          .map((p) => p.outcome)
          .at(-1),
      ),
    )
    .toBe("played");
  const plays = await page.evaluate(
    () => (window as unknown as { __plays: unknown[] }).__plays,
  );
  note(`REC-18 play() after reload + scan: ${JSON.stringify(plays)}`);
  await page.keyboard.press("Escape");

  // A second tab of the same browser: sessionStorage is per tab.
  const second = await context.newPage();
  await second.goto("/reception");
  await expect(
    second.getByRole("heading", { name: "Skenirajte karticu" }),
  ).toBeVisible();
  const overlayInNewTab = await second
    .getByText("Uključuje zvuk za rezultate skeniranja.")
    .isVisible();
  note(`REC-18 overlay in a new tab of the same browser: ${overlayInNewTab}`);
  await context.close();

  // A fresh browser session (incognito) shows it again.
  const fresh = await signedIn(browser, staff.ana);
  await expect(
    fresh.getByText("Uključuje zvuk za rezultate skeniranja."),
  ).toBeVisible();
  await fresh.context().close();
  // Clean up: the sound check left "Zvučni" in the gym.
  await adminClient()
    .from("visits")
    .update({ checked_out_at: new Date().toISOString() })
    .eq("member_id", member.zvuk)
    .is("checked_out_at", null);
});

test("REC-21: two desks scan the same card at the same moment — one visit, never two", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const desks = [
    await signedIn(browser, staff.ana),
    await signedIn(browser, staff.ana),
  ];
  for (const desk of desks) {
    await startWork(desk);
    await expect(
      desk.getByRole("heading", { name: "Skenirajte karticu" }),
    ).toBeVisible();
  }
  const admin = adminClient();
  for (let round = 1; round <= 3; round++) {
    await Promise.all(
      desks.map((desk) =>
        desk.evaluate(() =>
          (document.activeElement as HTMLElement | null)?.blur(),
        ),
      ),
    );
    await Promise.all(desks.map((desk) => desk.keyboard.type(card.trka)));
    await Promise.all(desks.map((desk) => desk.keyboard.press("Enter")));
    const outcomes: string[] = [];
    for (const desk of desks) {
      const covered = desk.locator("[data-result=covered]");
      const already = desk.getByText("Član je već u teretani.");
      const question = desk.getByText(/prijavljen\/a prije \d+ s\. Odjaviti\?/);
      await expect(covered.or(already).or(question).first()).toBeVisible();
      outcomes.push(
        (await covered.isVisible())
          ? "prijavljen"
          : (await already.isVisible())
            ? "Član je već u teretani."
            : `pitanje: ${(await question.textContent())?.trim()}`,
      );
    }
    note(`REC-21 round ${round}: ${outcomes.join(" | ")}`);
    const { data: visits } = await admin
      .from("visits")
      .select("id, checked_out_at")
      .eq("member_id", member.trka)
      .returns<{ id: string; checked_out_at: string | null }[]>();
    expect(visits?.filter((v) => v.checked_out_at === null)).toHaveLength(1);
    expect(visits).toHaveLength(round);
    expect(outcomes.filter((o) => o === "prijavljen")).toHaveLength(1);
    // [Ne] or Escape: nobody is checked out by the loser's dialog.
    for (const desk of desks) {
      await desk.keyboard.press("Escape");
      await expect(desk.getByRole("dialog")).toHaveCount(0);
    }
    const { data: still } = await admin
      .from("visits")
      .select("id")
      .eq("member_id", member.trka)
      .is("checked_out_at", null);
    expect(still).toHaveLength(1);
    // Out again for the next round, back-dated past the double-scan guard.
    await admin
      .from("visits")
      .update({
        checked_in_at: new Date(Date.now() - 10 * 60_000).toISOString(),
        checked_out_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      })
      .eq("member_id", member.trka)
      .is("checked_out_at", null);
  }
  for (const desk of desks) await desk.context().close();
  const page = await signedIn(browser, staff.owner);
  await page.goto(`/members/${member.trka}?tab=dolasci`);
  await expect(page.locator("main tbody tr")).toHaveCount(3);
  await page.context().close();
});

test("REC-19: a visit that starts before midnight and ends after it", async ({
  browser,
}) => {
  const yesterday = gymDate(-1);
  const checkedIn = gymInstant(yesterday.iso, "23:10");
  await must(
    adminClient()
      .from("visits")
      .insert({
        gym_id: gymId,
        member_id: member.ponoc,
        visit_type: "gym",
        checked_in_at: checkedIn.toISOString(),
        checked_in_by: staff.ana.id,
      })
      .select("id"),
    "Open visit from last night",
  );
  const desk = await signedIn(browser, staff.ana);
  await startWork(desk);
  await scan(desk, card.ponoc);
  const line = desk.getByText(/^Odjavljen\/a: E2E Ponoć Kasni – \d+h \d+min$/);
  await expect(line).toBeVisible();
  const shown = (await line.textContent())!;
  const [, h, m] = shown.match(/(\d+)h (\d+)min/)!;
  const minutes = Number(h) * 60 + Number(m);
  const expected = Math.floor((Date.now() - checkedIn.getTime()) / 60_000);
  note(`REC-19 checkout at ${gymTime(new Date())}: „${shown}“ (expected ≈ ${expected} min)`);
  expect(Math.abs(minutes - expected)).toBeLessThanOrEqual(1);
  const outAt = gymTime(new Date());
  await desk.context().close();

  // The visit belongs to the day it began, on the profile and in the statistics.
  const owner = await signedIn(browser, staff.owner);
  await owner.goto(`/members/${member.ponoc}?tab=dolasci`);
  const row = owner.locator("main tbody tr").first();
  await expect(row).toContainText(yesterday.display);
  await expect(row).toContainText("23:10");
  const rowText = (await row.innerText()).replace(/\s+/g, " ");
  note(`REC-19 profile row: ${rowText}`);
  expect(rowText).toMatch(new RegExp(`${outAt.slice(0, 3)}\\d\\d`));

  await owner.goto(
    `/stats/visits?period=custom&from=${yesterday.iso}&to=${gymDate(0).iso}`,
  );
  const days = owner.locator("figure", { hasText: "Dolasci po danima" });
  const bars = days.locator("svg g:has(rect)");
  await expect(bars).toHaveCount(2);
  await bars.nth(0).locator("rect").first().hover();
  await expect(days).toContainText(`${yesterday.display} — 1 dolazaka`);
  await owner.context().close();
});

test("MSHIP-04 (E5): unpaid visits older than the plan stay unpaid, and the start is today", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  // The old unpaid visit, entered as the plan says: a back-dated visit (FIN-16).
  const owner = await signedIn(browser, staff.owner);
  await owner.goto("/finance/backdated");
  await expect(owner.getByText("Naknadni unos – ne ulazi u smjenu.")).toBeVisible();
  await owner.getByLabel("Član", { exact: true }).fill("E2E Stari");
  await owner.getByRole("button", { name: /E2E Stari Dug/ }).first().click();
  await owner.locator("#visit-date").fill(gymDate(-20).iso);
  await owner.getByLabel("Vrijeme ulaska").fill("18:00");
  await owner.getByLabel("Vrijeme izlaska").fill("19:00");
  await owner.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(owner.getByText("Naknadni unos je sačuvan.").first()).toBeVisible();
  await owner.context().close();
  const { data: before } = await adminClient()
    .from("visits")
    .select("id, is_unpaid, membership_id")
    .eq("member_id", member.dug)
    .single<{ id: string; is_unpaid: boolean; membership_id: string | null }>();
  expect(before).toMatchObject({ is_unpaid: true, membership_id: null });

  const desk = await signedIn(browser, staff.ana);
  await desk.goto(`/members/${member.dug}`);
  const dialog = desk.getByRole("dialog");
  await expect(async () => {
    await desk.getByRole("button", { name: "Nova članarina" }).click({ timeout: 2_000 });
    await expect(dialog.getByLabel("Vrsta članarine")).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await dialog.getByLabel("Vrsta članarine").selectOption(plan.nedeljna);
  const warning = dialog.getByRole("alert").filter({
    hasText:
      "Neplaćeni dolasci su stariji od trajanja ove članarine i ostaju neplaćeni.",
  });
  await expect(warning).toBeVisible();
  await expect(dialog.getByText("Počinje danas", { exact: true })).toBeVisible();
  await expect(dialog).toContainText(gymDate(0).display);
  // BR-051 and E5: seven days from D end on D + 7 (02.09 → 09.09).
  await expect(dialog).toContainText(gymDate(7).display);
  await dialog.getByText("Gotovina", { exact: true }).click();
  await dialog.getByRole("button", { name: "Naplati i sačuvaj" }).click();
  await expect(desk.getByText("Članarina sačuvana.").first()).toBeVisible();
  await desk.context().close();

  const admin = adminClient();
  const { data: membership } = await admin
    .from("memberships")
    .select("start_date, end_date, start_reason")
    .eq("member_id", member.dug)
    .single();
  note(`MSHIP-04 membership: ${JSON.stringify(membership)}`);
  expect(membership).toMatchObject({
    start_date: gymDate(0).iso,
    end_date: gymDate(7).iso,
    start_reason: "Počinje danas",
  });
  const { data: after } = await admin
    .from("visits")
    .select("is_unpaid, membership_id")
    .eq("id", before!.id)
    .single();
  expect(after).toEqual({ is_unpaid: true, membership_id: null });
});

test("PAY-13: a voided payment offers no actions, and a second void is refused, not duplicated", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const desk = await signedIn(browser, staff.ana);
  await startWork(desk);
  await desk.getByRole("button", { name: "Dnevna karta" }).click();
  const sale = desk.getByRole("dialog");
  await sale.getByText("Gotovina", { exact: true }).click();
  await sale.getByRole("button", { name: "Naplati" }).click();
  await expect(sale).toBeHidden();
  const { data: payment } = await adminClient()
    .from("payments")
    .select("id")
    .eq("gym_id", gymId)
    .eq("kind", "day_pass")
    .single<{ id: string }>();

  // A second desk has the void dialog open while the first voids it (PAY-11).
  const other = await signedIn(browser, staff.ana);
  await other.goto("/payments/today");
  await other.getByRole("button", { name: "Poništi Dnevna karta × 1" }).click();
  const late = other.getByRole("dialog");
  await late.getByLabel("Razlog").fill("E2E drugi pult");

  await desk.goto("/payments/today");
  await desk.getByRole("button", { name: "Poništi Dnevna karta × 1" }).click();
  const voiding = desk.getByRole("dialog");
  await voiding.getByLabel("Razlog").fill("E2E pogrešno naplaćeno");
  await voiding.getByRole("button", { name: "Poništi" }).click();
  await expect(desk.getByText("Stavka je poništena.").first()).toBeVisible();
  const row = desk.locator("tr[data-voided=true]", { hasText: "Dnevna karta × 1" });
  await expect(row).toHaveClass(/line-through/);
  await expect(row.getByRole("button")).toHaveCount(0);

  await late.getByRole("button", { name: "Poništi" }).click();
  const refusal = other
    .getByText("Ova stavka se ne može mijenjati (smjena je zaključena).")
    .first();
  await expect(refusal).toBeVisible();
  note("PAY-13 second desk's late void → „Ova stavka se ne može mijenjati (smjena je zaključena).“");
  await other.context().close();

  // The same requests, sent straight from the desk's own session.
  const session = await sessionOf(staff.ana);
  const again = await session.rpc("void_payment", {
    p_payment: payment!.id,
    p_reason: "E2E treći put",
  });
  const correct = await session.rpc("correct_payment", {
    p_payment: payment!.id,
    p_method: "card",
    p_note: "E2E",
  });
  note(`PAY-13 RPC void again → ${again.error?.message}; correct → ${correct.error?.message}`);
  expect(again.error?.message).toContain("E_RECORD_NOT_EDITABLE");
  expect(correct.error?.message).toContain("E_RECORD_NOT_EDITABLE");

  const admin = adminClient();
  const { data: stored } = await admin
    .from("payments")
    .select("void_reason, method")
    .eq("id", payment!.id)
    .single();
  expect(stored).toEqual({ void_reason: "E2E pogrešno naplaćeno", method: "cash" });
  const { data: audit } = await admin
    .from("audit_log")
    .select("action")
    .eq("row_id", payment!.id)
    .returns<{ action: string }[]>();
  note(`PAY-13 audit actions for the payment: ${audit?.map((a) => a.action).join(", ")}`);
  expect(audit?.filter((a) => a.action === "void")).toHaveLength(1);
  await desk.context().close();

  // S-21: exactly one "Poništeno" row for payments today.
  const owner = await signedIn(browser, staff.owner);
  await owner.goto("/finance/audit?period=today&table=payments");
  await expect(owner.locator("main tbody tr").first()).toBeVisible();
  await expect(
    owner.locator("main tbody tr").filter({ hasText: "Poništeno" }),
  ).toHaveCount(1);
  await owner.context().close();
});

test("STO-10: a stock-in expense is voided only with its stock-in", async ({
  browser,
}) => {
  const desk = await signedIn(browser, staff.ana);
  await desk.goto("/storage");
  await desk.getByRole("button", { name: "Nova roba E2E Voda" }).click();
  const dialog = desk.getByRole("dialog");
  await dialog.getByLabel("Količina").fill("10");
  await dialog.getByLabel("Nabavna cijena po komadu (sa fakture)").fill("0,30");
  await dialog.getByText("Iz kase", { exact: true }).click();
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(desk.getByText("Roba je evidentirana.").first()).toBeVisible();

  const label = /^Poništi Roba za prodaju: /;
  for (const who of [desk, await signedIn(browser, staff.owner)]) {
    await who.goto("/payments/today");
    const button = who.getByRole("button", { name: label });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute(
      "title",
      "Trošak nabavke poništava vlasnik zajedno sa nabavkom.",
    );
    if (who !== desk) {
      await who.goto("/finance/expenses?period=today");
      const row = who.getByRole("row", { name: /Roba za prodaju/ });
      await expect(row).toBeVisible();
      await expect(row.getByRole("button")).toHaveCount(0);
      note(
        `STO-10 /finance/expenses: the stock-in row has no [Poništi] and no explanation („${(await row.innerText()).replace(/\s+/g, " ")}“)`,
      );
      await who.context().close();
    }
  }
  await desk.context().close();

  const { data: expense } = await adminClient()
    .from("expenses")
    .select("id")
    .eq("gym_id", gymId)
    .not("stock_movement_id", "is", null)
    .single<{ id: string }>();
  const session = await sessionOf(staff.owner);
  const { error } = await session.rpc("void_expense", {
    p_expense: expense!.id,
    p_reason: "E2E zasebno",
  });
  note(`STO-10 owner's void_expense on it → ${error?.message}`);
  expect(error?.message).toContain("E_RECORD_NOT_EDITABLE");
});

test("STO-07: a product with stock 0 cannot be sold", async ({ browser }) => {
  const desk = await signedIn(browser, staff.ana);
  await desk.goto("/storage");
  await expect(desk.getByTestId("stock-E2E Prazno")).toHaveText("0");
  // N-22: MoneyButton used to drop the storage screen's own title.
  const sell = desk.getByRole("button", { name: "Prodaja E2E Prazno" });
  await expect(sell).toBeDisabled();
  await expect(sell).toHaveAttribute("title", "Nema na stanju.");
  await expect(sell).toHaveAccessibleName("Prodaja E2E Prazno Nema na stanju.");
  // A product in stock keeps its plain name and no tooltip.
  const inStock = desk.getByRole("button", { name: "Prodaja E2E Voda" });
  await expect(inStock).toBeEnabled();
  await expect(inStock).toHaveAccessibleName("Prodaja E2E Voda");
  await expect(inStock).not.toHaveAttribute("title");
  const visible = await desk.getByText("Nema na stanju.", { exact: true }).count();
  note(`STO-07 „Nema na stanju.“ as visible text: ${visible} (the button's title/tooltip carries it)`);
  await desk.context().close();
});

test("CLOSE-02: [Pregledaj stavke] lists the shift, and the desk sees only its own expenses", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  // One more of each kind: a card sale of water, the desk's own expense, the owner's.
  const desk = await signedIn(browser, staff.ana);
  await desk.goto("/storage");
  await desk.getByRole("button", { name: "Prodaja E2E Voda" }).click();
  const sale = desk.getByRole("dialog");
  await sale.getByLabel("Količina").fill("2");
  await sale.getByText("Platna kartica", { exact: true }).click();
  await sale.getByRole("button", { name: "Naplati" }).click();
  await expect(desk.getByText("Prodaja je sačuvana.").first()).toBeVisible();
  for (const [who, text, amount] of [
    [desk, "E2E krpe pulta", "4"],
    [await signedIn(browser, staff.owner), "E2E vlasnikov trošak", "7"],
  ] as const) {
    await who.goto("/reception");
    await startWork(who);
    await who.getByRole("button", { name: "Trošak" }).click();
    const dialog = who.getByRole("dialog");
    await dialog.getByLabel("Kategorija").selectOption(category.potrosni);
    await dialog.getByLabel("Opis").fill(text);
    await dialog.getByLabel("Iznos (€)").fill(amount);
    await dialog.getByRole("button", { name: "Sačuvaj" }).click();
    await expect(dialog).toBeHidden();
    if (who !== desk) await who.context().close();
  }

  await desk.goto("/shift/close");
  const review = desk.getByRole("button", { name: "Pregledaj stavke" });
  await expect(review).toHaveAttribute("aria-expanded", "false");
  await review.click();
  const list = desk.locator("#shift-items");
  await expect(list).toBeVisible();
  const items = (await list.locator("li").allInnerTexts()).map((t) =>
    t.replace(/\s+/g, " ").trim(),
  );
  note(`CLOSE-02 items: ${JSON.stringify(items)}`);
  const text = items.join("\n");
  expect(text).toMatch(/Članarina · #4 E2E Stari Dug · Gotovina 39,00 €/);
  expect(text).toContain("E2E Voda × 2 · Platna kartica");
  expect(text).toContain("E2E Potrošni: E2E krpe pulta");
  expect(text).toMatch(/Roba za prodaju: .*−3,00 €/);
  // BR-134: the owner's expense is in the till total, not in the desk's list.
  expect(text).not.toContain("E2E vlasnikov trošak");
  // The voided day pass is counted, not listed.
  expect(text).not.toContain("Dnevna karta");
  const tills = await desk
    .locator("dt", { hasText: "Troškovi iz kase" })
    .locator("xpath=following-sibling::dd")
    .textContent();
  note(`CLOSE-02 Troškovi iz kase: ${tills?.trim()}`);
  expect(tills?.trim()).toBe("14,00 €");
  await expect(desk.locator("main")).toContainText("Poništeno: 1");
  await desk.getByRole("button", { name: "Sakrij stavke" }).click();
  await expect(list).toBeHidden();
  await expect(review).toHaveAttribute("aria-expanded", "false");
  await desk.context().close();
});

test("CLOSE-08 and N-23: the second receptionist cannot close, or work in, the other's shift", async ({
  browser,
}) => {
  const b = await signedIn(browser, staff.bojan);
  await expect(b).toHaveURL(/\/shift\/gate/);
  const gate = b.getByRole("heading", { name: "Otvorena smjena" });
  await expect(badge(b).first()).toHaveText(/^Smjena: E2E Ana SA od \d\d:\d\d$/);

  // Before N-23 /shift/close answered „Nemate otvorenu smjenu.“ and /reception let B
  // sell a day pass into Ana's shift. Now every desk URL leads back to S-02.
  for (const path of ["/shift/close", "/reception", "/payments/today", "/storage", "/members"]) {
    await b.goto(path);
    await expect(b, path).toHaveURL(/\/shift\/gate$/);
    await expect(gate).toBeVisible();
  }
  await expect(b.getByLabel("Prebrojana gotovina (€)")).toHaveCount(0);
  await expect(b.getByRole("button", { name: /Zaključi smjenu/ })).toHaveCount(0);
  // The menu is a client navigation; the proxy sees it too.
  await b.locator("header").getByRole("link", { name: "Recepcija", exact: true }).click();
  await expect(b).toHaveURL(/\/shift\/gate$/);
  await expect(gate).toBeVisible();
  note("CLOSE-08/N-23 B on /shift/close, /reception, /payments/today, /storage, /members and the menu → /shift/gate");

  // The database still attaches a direct call to the open shift (not closed by N-23).
  const session = await sessionOf(staff.bojan);
  const direct = await session.rpc("sell_day_passes", {
    p_qty: 1,
    p_method: "cash",
  });
  note(
    `CLOSE-08/N-23 B calling sell_day_passes directly → ${direct.error ? direct.error.message : "accepted"}`,
  );
  if (!direct.error)
    await adminClient()
      .from("payments")
      .update({
        voided_at: new Date().toISOString(),
        voided_by: staff.owner.id,
        void_reason: "E2E N-23 direktan poziv",
      })
      .eq("gym_id", gymId)
      .eq("created_by", staff.bojan.id);
  await b.context().close();

  // Ana, who holds the shift, still works as before.
  const ana = await signedIn(browser, staff.ana);
  await expect(ana).toHaveURL(/\/reception$/);
  await ana.goto("/shift/close");
  await expect(ana.getByLabel("Prebrojana gotovina (€)")).toBeVisible();
  await ana.context().close();
});

test("SHIFT-06 (2): the badge names the open shift for every role, and goes when it closes", async ({
  browser,
}) => {
  const { data: shift } = await adminClient()
    .from("shifts")
    .select("started_at")
    .eq("gym_id", gymId)
    .is("closed_at", null)
    .single<{ started_at: string }>();
  const expected = `Smjena: E2E Ana SA od ${gymTime(new Date(shift!.started_at))}`;
  const pages: Page[] = [];
  for (const who of [staff.ana, staff.manager, staff.admin, staff.owner]) {
    const page = await signedIn(browser, who);
    await expect(badge(page).first()).toHaveText(expected);
    pages.push(page);
  }
  note(`SHIFT-06 badge for desk, manager, admin and owner: „${expected}“`);

  const owner = pages.at(-1)!;
  await owner.goto("/finance/shifts");
  await owner.getByRole("button", { name: "Zaključi smjenu" }).click();
  const dialog = owner.getByRole("dialog");
  await dialog.getByRole("button", { name: "Zaključi smjenu" }).click();
  await expect(owner.getByText("Smjena je zaključena.").first()).toBeVisible();
  await owner.reload();
  await expect(badge(owner).first()).toHaveText("Nema otvorene smjene");
  for (const page of pages.slice(1, 3)) {
    await page.reload();
    await expect(badge(page).first()).toHaveText("Nema otvorene smjene");
  }
  // The receptionist's next step ends her session (BR-116/BR-119, N-09).
  await pages[0].reload();
  await expect(pages[0]).toHaveURL(/\/login\?auto=1/);
  for (const page of pages) await page.context().close();
});
