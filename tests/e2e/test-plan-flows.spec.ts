import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";
import { pdfText } from "./pdf-text";

// TEST_PLAN.md §4: the whole-day flows E2E-01 to E2E-03, and CLOSE-05's report, as
// one connected history in one synthetic gym (D-56). The test server's Resend key is
// invalid on purpose (N-05), so every report email ends "neuspješno"; real delivery
// was confirmed separately on 22.09.2026 (§9.3).
test.describe.configure({ mode: "serial" });

const PASSWORD = "tokovilozinka1";
const ZONE = "Europe/Podgorica";

let gymId: string;
const staff = {} as Record<"owner" | "ana" | "bojana", TestStaff>;
const plan = { mjesecna: "" };
const member = { stalni: "", bozo: "", drugi: "" };
const card = { empty: "", stalni: "", bozo: "" };

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
  gymId = await createTestGym(`${workerInfo.project.name}-flows-${suffix()}`);
  for (const [key, role, name] of [
    ["owner", "owner", "E2E Vlasnik tokova"],
    ["ana", "receptionist", "E2E Ana tok"],
    ["bojana", "receptionist", "E2E Bojana tok"],
  ] as const)
    staff[key] = await createTestStaff(gymId, {
      role,
      fullName: name,
      password: PASSWORD,
    });
  const admin = adminClient();
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
          name: "E2E Dnevna karta",
          kind: "day_pass",
          duration_value: null,
          duration_unit: null,
          price: 10,
          covers_gym: true,
          sort_order: 2,
        },
      ])
      .select("id, name")
      .returns<{ id: string; name: string }[]>(),
    "Test plans",
  );
  plan.mjesecna = plans.find((p) => p.name === "E2E Mjesečna")!.id;
  await must(
    admin
      .from("plan_finance")
      .insert(plans.map((p) => ({ plan_id: p.id, gym_id: gymId })))
      .select("plan_id"),
    "Test plan finance",
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
    "Test product",
  );
  await must(
    admin
      .from("stock_movements")
      .insert({
        gym_id: gymId,
        product_id: product.id,
        type: "in",
        quantity: 20,
        unit_cost: 0.3,
        created_by: staff.owner.id,
      })
      .select("id"),
    "Test stock",
  );
  await must(
    admin
      .from("expense_categories")
      .insert({ gym_id: gymId, name: "Potrošni materijal" })
      .select("id"),
    "Test category",
  );
  const created = await must(
    admin
      .from("members")
      .insert(
        [
          ["Stalni", "Član"],
          ["Božo", "Božović"],
          ["Drugi", "Kupac"],
        ].map(([first, last], index) => ({
          gym_id: gymId,
          member_number: index + 1,
          first_name: `E2E ${first}`,
          last_name: last,
          phone: `+3826780000${index}`,
          email: `tok-${index}@e2e.invalid`,
          date_of_birth: "1990-01-01",
          created_by: staff.owner.id,
        })),
      )
      .select("id, member_number")
      .returns<{ id: string; member_number: number }[]>(),
    "Test members",
  );
  const byNumber = (n: number) =>
    created.find((m) => m.member_number === n)!.id;
  member.stalni = byNumber(1);
  member.bozo = byNumber(2);
  member.drugi = byNumber(3);
  await must(
    admin
      .from("member_counters")
      .insert({ gym_id: gymId, last_number: 3 })
      .select("gym_id"),
    "Test member counter",
  );
  await must(
    admin
      .from("memberships")
      .insert({
        gym_id: gymId,
        member_id: member.stalni,
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
      .insert({ gym_id: gymId, quantity: 3, created_by: staff.owner.id })
      .select("id")
      .single<{ id: string }>(),
    "Test batch",
  );
  card.empty = code();
  card.stalni = code();
  card.bozo = code();
  const row = (value: string, memberId: string | null) => ({
    gym_id: gymId,
    code: value,
    batch_id: batch.id,
    status: memberId ? "active" : "unassigned",
    member_id: memberId,
    assigned_at: memberId ? new Date().toISOString() : null,
  });
  await must(
    admin
      .from("cards")
      .insert([
        row(card.empty, null),
        row(card.stalni, member.stalni),
        row(card.bozo, member.bozo),
      ])
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

async function dayPass(
  page: Page,
  method: "Gotovina" | "Platna kartica",
  more = 0,
) {
  await page.getByRole("button", { name: "Dnevna karta" }).click();
  const dialog = page.getByRole("dialog");
  for (let i = 0; i < more; i++)
    await dialog.getByRole("button", { name: "Jedna više" }).click();
  await dialog.getByText(method, { exact: true }).click();
  await dialog.getByRole("button", { name: "Naplati" }).click();
  await expect(dialog).toBeHidden();
}

async function closeValue(page: Page, label: string) {
  return (
    (await page
      .locator("dt", { hasText: label })
      .locator("xpath=following-sibling::dd")
      .textContent()) ?? ""
  ).trim();
}

async function closeShift(page: Page, counted: string) {
  await page.goto("/shift/close");
  await page.getByLabel("Prebrojana gotovina (€)").fill(counted);
  await page
    .getByRole("button", { name: "Zaključi smjenu i odjavi me" })
    .click();
  await page.getByRole("button", { name: "Zaključi", exact: true }).click();
  await expect(page.getByText("Smjena je zaključena.")).toBeVisible({
    timeout: 30_000,
  });
}

type ShiftRow = {
  id: string;
  staff_id: string;
  close_type: string | null;
  counted_cash: number | null;
  report_path: string | null;
  email_status: string;
  closed_by: string | null;
};
async function shifts(): Promise<ShiftRow[]> {
  const { data } = await adminClient()
    .from("shifts")
    .select(
      "id, staff_id, close_type, counted_cash, report_path, email_status, closed_by",
    )
    .eq("gym_id", gymId)
    .order("started_at")
    .returns<ShiftRow[]>();
  return data ?? [];
}

const notes: string[] = [];
function note(text: string) {
  notes.push(text);
  console.log(`[note] ${text}`);
}

test("E2E-01 and CLOSE-05: a receptionist's whole day, closed to the cent, reported", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  // 1. The shift opens at login.
  await signIn(page, staff.ana);
  await expect(page).toHaveURL(/\/reception/);
  await startWork(page);

  // 2. A new member on an empty card, Mjesečna in cash, checked in at once.
  await scan(page, card.empty);
  const register = page.getByRole("dialog");
  await register.getByLabel("Ime", { exact: true }).fill("Ana");
  await register.getByLabel("Prezime").fill("Anić");
  await register.getByLabel("Telefon").fill("069 800 100");
  await register.getByLabel("Email").fill("ana.anic@e2e.invalid");
  await register
    .getByLabel("Datum rođenja", { exact: true })
    .fill("05.05.1995");
  await register.getByLabel("Vrsta članarine").selectOption(plan.mjesecna);
  await expect(register.getByLabel("Prijavi odmah")).toBeChecked();
  await register.getByText("Gotovina", { exact: true }).click();
  await register.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(register.getByText(/^Član #4 je kreiran\./)).toBeVisible({
    timeout: 15_000,
  });
  await register.getByRole("button", { name: "Zatvori" }).first().click();
  await expect(page.locator("[data-result=covered]")).toBeVisible();
  await page.keyboard.press("Escape");

  // 3. An existing member: green.
  await scan(page, card.stalni);
  await expect(page.locator("[data-result=covered]")).toBeVisible();
  await page.keyboard.press("Escape");

  // 4. Two day passes by card; 5. one water in cash; 6. a till expense.
  await dayPass(page, "Platna kartica", 1);
  await page.getByRole("button", { name: "Trošak" }).click();
  const expense = page.getByRole("dialog");
  await expense
    .getByLabel("Kategorija")
    .selectOption({ label: "Potrošni materijal" });
  await expense.getByLabel("Opis").fill("Krpe");
  await expense.getByLabel("Iznos (€)").fill("6,00");
  await expense.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Trošak je sačuvan.").first()).toBeVisible();
  await page.goto("/storage");
  await page.getByRole("button", { name: "Prodaja E2E Voda" }).click();
  const sale = page.getByRole("dialog");
  await sale.getByText("Gotovina", { exact: true }).click();
  await sale.getByRole("button", { name: "Naplati" }).click();
  await expect(page.getByText("Prodaja je sačuvana.").first()).toBeVisible();

  // 7. More than two minutes later the same card checks out with the duration.
  await adminClient()
    .from("visits")
    .update({ checked_in_at: new Date(Date.now() - 3 * 60_000).toISOString() })
    .eq("member_id", member.stalni)
    .is("checked_out_at", null);
  await page.goto("/reception");
  await startWork(page);
  await scan(page, card.stalni);
  await expect(
    page.getByText(/^Odjavljen\/a: E2E Stalni Član – 0h 3min$/),
  ).toBeVisible();

  // 8. Expected cash = (79 + 1,50) − 6 = 74,50; the day passes are card income.
  await page.goto("/shift/close");
  expect(await closeValue(page, "Gotovina (prihod)")).toBe("80,50 €");
  expect(await closeValue(page, "Platna kartica (prihod)")).toBe("20,00 €");
  expect(await closeValue(page, "Troškovi iz kase")).toBe("6,00 €");
  expect(await closeValue(page, "Očekivana gotovina")).toBe("74,50 €");
  await page.getByLabel("Prebrojana gotovina (€)").fill("74,50");
  await expect(page.getByText(/^Razlika: 0,00 €$/)).toBeVisible();
  await closeShift(page, "74,50");
  await expect(page).toHaveURL(/\/login/);

  // 9. The owner downloads the PDF and sees the email status.
  const closed = (await shifts())[0];
  expect(closed.close_type).toBe("manual");
  await expect.poll(async () => (await shifts())[0].report_path).not.toBeNull();
  const owner = await signedIn(browser, staff.owner);
  await owner.goto("/finance/shifts?period=today");
  const row = owner.getByRole("row", { name: /E2E Ana tok/ });
  await expect(row).toContainText("74,50 €");
  note(
    `E2E-01 S-19 email column: ${(await row.textContent())?.match(/poslato|neuspješno|nije slato|u toku/)?.[0]}`,
  );
  const response = await owner.request.get(`/api/pdf/shift/${closed.id}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toBe(
    `attachment; filename="smjena-${gymDate(0).iso}.pdf"`,
  );
  const text = pdfText(await response.body());
  for (const expected of [
    "E2E Ana tok",
    "Zaključio/la E2E Ana tok",
    "Ana Anić",
    "E2E Mjesečna",
    "79,00 €",
    "Dnevne karte",
    "20,00 €",
    "E2E Voda",
    "1,50 €",
    "Krpe",
    "6,00 €",
    "80,50 €",
    "74,50 €",
    "U teretani pri zaključenju: 1",
  ])
    expect(text, expected).toContain(expected);
  expect(text).toMatch(/Razlika\s*0,00 €/);
  await owner.context().close();
});

test("E2E-02: a handover — A's shift is taken over by B, each keeps its own records", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  // 1. A sells a membership and a day pass, both cash (79 + 10).
  await signIn(page, staff.ana);
  await page.goto(`/members/${member.drugi}`);
  await page.getByRole("button", { name: "Nova članarina" }).click();
  const sell = page.getByRole("dialog");
  await sell.getByLabel("Vrsta članarine").selectOption(plan.mjesecna);
  await sell.getByText("Gotovina", { exact: true }).click();
  await sell.getByRole("button", { name: "Naplati i sačuvaj" }).click();
  await expect(page.getByText("Članarina sačuvana.").first()).toBeVisible();
  await page.goto("/reception");
  await startWork(page);
  await dayPass(page, "Gotovina");

  // 2. A signs out, confirming the shift stays open (BR-113).
  await page.getByRole("button", { name: "Nalog" }).click();
  await page.getByRole("menuitem", { name: "Odjava" }).click();
  const confirm = page.getByRole("dialog");
  await expect(
    confirm.getByText("Smjena ostaje otvorena. Odjaviti se?"),
  ).toBeVisible();
  await confirm.getByRole("button", { name: "Odjavi se" }).click();
  await expect(page).toHaveURL(/\/login/);

  // 3. B meets S-02, counts 89 and takes over; 4. B sells one day pass.
  const b = await signedIn(browser, staff.bojana);
  await expect(b).toHaveURL(/\/shift\/gate/);
  await b.getByLabel("Prebrojana gotovina za prethodnu smjenu (€)").fill("89");
  await b.getByRole("button", { name: "Preuzmi smjenu" }).click();
  await expect(b).toHaveURL(/\/reception/);
  await startWork(b);
  await dayPass(b, "Gotovina");

  // B cannot touch A's records.
  await b.goto("/payments/today");
  await expect(b.getByRole("heading", { name: "Uplate danas" })).toBeVisible();
  const ownIds = (await shifts()).filter((s) => s.staff_id === staff.bojana.id);
  const aRows = b
    .locator("tr", { hasText: "E2E Mjesečna" })
    .getByRole("button", {
      name: /^Ispravi /,
    });
  for (const button of await aRows.all()) await expect(button).toBeDisabled();
  expect(ownIds).toHaveLength(1);

  // 5. B closes her own shift, 10 € in cash.
  await closeShift(b, "10");
  await b.context().close();

  // 6. The owner sees both shifts.
  const all = await shifts();
  const aShift = all.filter((s) => s.staff_id === staff.ana.id).at(-1)!;
  const bShift = all.find((s) => s.staff_id === staff.bojana.id)!;
  expect(aShift.close_type).toBe("takeover");
  expect(aShift.closed_by).toBe(staff.bojana.id);
  expect(Number(aShift.counted_cash)).toBe(89);
  expect(bShift.close_type).toBe("manual");
  await expect
    .poll(async () =>
      (await shifts())
        .filter((s) => s.id === aShift.id || s.id === bShift.id)
        .every((s) => s.report_path),
    )
    .toBe(true);

  const owner = await signedIn(browser, staff.owner);
  await owner.goto("/finance/shifts?period=today");
  const aRow = owner.getByRole("row", { name: /E2E Ana tok/ }).filter({
    hasText: "Preuzeo/la",
  });
  await expect(aRow).toContainText("E2E Bojana tok");
  await expect(aRow).toContainText("89,00 €");
  const bRow = owner.getByRole("row", { name: /E2E Bojana tok/ }).filter({
    hasText: "Zaključio/la",
  });
  await expect(bRow).toContainText("10,00 €");
  const bPdf = pdfText(
    await (await owner.request.get(`/api/pdf/shift/${bShift.id}`)).body(),
  );
  expect(bPdf).toContain("Dnevne karte");
  expect(bPdf).not.toContain("E2E Mjesečna");
  const aPdf = pdfText(
    await (await owner.request.get(`/api/pdf/shift/${aShift.id}`)).body(),
  );
  expect(aPdf).toContain("Preuzeo/la E2E Bojana tok");
  expect(aPdf).toContain("E2E Mjesečna");
  expect(aPdf).toContain("89,00 €");
  await owner.context().close();
});

test("E2E-03: a lapsed member — two back-dated visits, a red third, renewal links all", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  // 1. The owner enters two visits, three and two days ago, through S-22.
  const owner = await signedIn(browser, staff.owner);
  for (const days of [-3, -2]) {
    await owner.goto("/finance/backdated");
    await owner.getByLabel("Član").fill("Božović");
    await owner.getByRole("button", { name: /#2 E2E Božo Božović/ }).click();
    await owner.locator("#visit-date").fill(gymDate(days).iso);
    await owner.getByLabel("Vrijeme ulaska").fill("18:00");
    await owner.getByLabel("Vrijeme izlaska").fill("19:00");
    await owner.getByRole("button", { name: "Sačuvaj" }).click();
    await expect(
      owner.getByText("Naknadni unos je sačuvan.").first(),
    ).toBeVisible();
  }
  await owner.context().close();

  // 2. Today's scan is the third unpaid visit: red.
  await signIn(page, staff.bojana);
  await startWork(page);
  await scan(page, card.bozo);
  const red = page.locator("[data-result=red]");
  await expect(red).toBeVisible();
  await expect(red).toContainText("PAŽNJA: 3. neplaćeni dolazak!");

  // 3. [Produži članarinu] from the red screen, Mjesečna, cash.
  await red.getByRole("button", { name: "Produži članarinu" }).click();
  const sell = page.getByRole("dialog");
  await sell.getByLabel("Vrsta članarine").selectOption(plan.mjesecna);
  await expect(
    sell.getByText(
      `Počinje od prvog neplaćenog dolaska ${gymDate(-3).display}`,
    ),
  ).toBeVisible();
  await sell.getByText("Gotovina", { exact: true }).click();
  await sell.getByRole("button", { name: "Naplati i sačuvaj" }).click();
  await expect(page.getByText("Članarina sačuvana.").first()).toBeVisible();

  // 4. The profile: no badge, all three visits linked, the start at the first one.
  const admin = adminClient();
  const { data: membership } = await admin
    .from("memberships")
    .select("id, start_date")
    .eq("member_id", member.bozo)
    .single<{ id: string; start_date: string }>();
  expect(membership?.start_date).toBe(gymDate(-3).iso);
  const { data: visits } = await admin
    .from("visits")
    .select("membership_id")
    .eq("member_id", member.bozo)
    .returns<{ membership_id: string | null }[]>();
  expect(visits).toHaveLength(3);
  for (const visit of visits ?? [])
    expect(visit.membership_id).toBe(membership?.id);
  await page.goto(`/members/${member.bozo}`);
  await expect(
    page.getByRole("heading", { name: /E2E Božo Božović/ }),
  ).toBeVisible();
  await expect(page.getByText(/Neplaćeni dolasci:/)).toHaveCount(0);

  // 5. Next time: out (after the guard), in again — green.
  await admin
    .from("visits")
    .update({ checked_in_at: new Date(Date.now() - 10 * 60_000).toISOString() })
    .eq("member_id", member.bozo)
    .is("checked_out_at", null);
  await page.goto("/reception");
  await startWork(page);
  await scan(page, card.bozo);
  await expect(page.getByText(/^Odjavljen\/a: E2E Božo Božović/)).toBeVisible();
  await scan(page, card.bozo);
  await expect(page.locator("[data-result=covered]")).toBeVisible();
  console.log(`[note] all: ${notes.join(" | ")}`);
});
