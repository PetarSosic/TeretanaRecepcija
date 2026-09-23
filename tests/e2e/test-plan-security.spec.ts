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

// TEST_PLAN.md: SEC-01 (HTML and script in every listed text field, on every screen that
// shows it and in the shift PDF) and JOB-01 (the nightly job, called for the synthetic
// gym only — `npm run jobs:run` would close the working gym's shift, see jobs.spec.ts).
test.describe.configure({ mode: "serial" });

const PASSWORD = "sigurnostLozinka1";
const ZONE = "Europe/Podgorica";
const SCRIPT = "<script>alert(1)</script>";
const IMG = "<img src=x onerror=alert(1)>";

let gymId: string;
const staff = {} as Record<"owner" | "ana" | "odd", TestStaff>;
let memberId: string;
let categoryId: string;

async function must<T>(
  query: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  what: string,
): Promise<T> {
  const { data, error } = await query;
  if (error || data === null)
    throw new Error(`${what} not created: ${error?.message}`);
  return data;
}

function gymClock(minutesAgo: number): { date: string; time: string } {
  const at = new Date(Date.now() - minutesAgo * 60_000);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map(({ type, value }) => [type, value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

test.beforeAll(async ({}, workerInfo) => {
  test.skip(workerInfo.project.name !== "desktop");
  gymId = await createTestGym(`${workerInfo.project.name}-sec-${suffix()}`);
  staff.owner = await createTestStaff(gymId, {
    role: "owner",
    fullName: "E2E Vlasnik sigurnosti",
    password: PASSWORD,
  });
  staff.ana = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Ana sigurnost",
    password: PASSWORD,
  });
  // SEC-01: a staff member's name.
  staff.odd = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: IMG,
    password: PASSWORD,
  });

  const admin = adminClient();
  const trainer = await must(
    admin
      .from("trainers")
      .insert({ gym_id: gymId, full_name: SCRIPT })
      .select("id")
      .single<{ id: string }>(),
    "Test trainer",
  );
  await must(
    admin
      .from("trainer_finance")
      .insert({ trainer_id: trainer.id, gym_id: gymId, personal_gym_fee: 80 })
      .select("trainer_id"),
    "Test trainer finance",
  );
  await must(
    admin
      .from("programs")
      .insert({ gym_id: gymId, name: SCRIPT, kind: "group" })
      .select("id"),
    "Test program",
  );
  const plans = await must(
    admin
      .from("plans")
      .insert([
        {
          gym_id: gymId,
          name: IMG,
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
      .select("id")
      .returns<{ id: string }[]>(),
    "Test plans",
  );
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
        name: SCRIPT,
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
        quantity: 5,
        unit_cost: 0.3,
        created_by: staff.owner.id,
      })
      .select("id"),
    "Test stock",
  );
  categoryId = (
    await must(
      admin
        .from("expense_categories")
        .insert({ gym_id: gymId, name: IMG })
        .select("id")
        .single<{ id: string }>(),
      "Test category",
    )
  ).id;
  memberId = (
    await must(
      admin
        .from("members")
        .insert({
          gym_id: gymId,
          member_number: 1,
          first_name: IMG,
          last_name: SCRIPT,
          phone: "+38267900001",
          email: "xss2@e2e.invalid",
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

/** A page wired to catch any executed payload: a dialog, a CSP refusal, a live element. */
async function watched(browser: Browser, who: TestStaff) {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on("dialog", async (dialog) => {
    problems.push(`dialog: ${dialog.message()}`);
    await dialog.dismiss();
  });
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /Content Security Policy|Refused to/i.test(message.text())
    )
      problems.push(`console: ${message.text().slice(0, 120)}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  await signIn(page, who);
  return { page, problems };
}

async function inspect(page: Page, path: string, problems: string[]) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const live = await page.evaluate(() => ({
    img: document.querySelectorAll('img[src="x"]').length,
    script: [...document.querySelectorAll("script")].filter(
      (s) =>
        s.textContent?.includes("alert(1)") &&
        !s.textContent.includes("self.__next"),
    ).length,
  }));
  if (live.img || live.script)
    problems.push(`${path}: live img=${live.img} script=${live.script}`);
  const text = (await page.locator("body").innerText()) ?? "";
  return { img: text.includes(IMG), script: text.includes(SCRIPT) };
}

const notes: string[] = [];
function note(text: string) {
  notes.push(text);
  console.log(`[note] ${text}`);
}

test("SEC-01: HTML and script stay text in every field, screen and the shift PDF", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  // The desk: a day pass corrected with an HTML note, another voided with a script reason.
  const desk = await watched(browser, staff.ana);
  await desk.page
    .getByRole("button", { name: "Počni rad" })
    .click({ timeout: 3_000 })
    .catch(() => {});
  for (let i = 0; i < 2; i++) {
    await desk.page.getByRole("button", { name: "Dnevna karta" }).click();
    const pass = desk.page.getByRole("dialog");
    await pass.getByText("Gotovina", { exact: true }).click();
    await pass.getByRole("button", { name: "Naplati" }).click();
    await expect(pass).toBeHidden();
  }
  await desk.page.goto("/payments/today");
  const rows = desk.page.getByRole("button", {
    name: "Ispravi Dnevna karta × 1",
  });
  await rows.first().click();
  let dialog = desk.page.getByRole("dialog");
  await dialog.getByLabel("Napomena").fill(IMG);
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(
    desk.page.getByText("Uplata je ispravljena.").first(),
  ).toBeVisible();
  await desk.page
    .getByRole("button", { name: "Poništi Dnevna karta × 1" })
    .last()
    .click();
  dialog = desk.page.getByRole("dialog");
  await dialog.getByLabel("Razlog").fill(SCRIPT);
  await dialog.getByRole("button", { name: "Poništi" }).click();
  await expect(
    desk.page.getByText("Stavka je poništena.").first(),
  ).toBeVisible();
  // A till expense whose description is HTML, so it also reaches the shift PDF.
  await desk.page.goto("/reception");
  await desk.page.getByRole("button", { name: "Trošak" }).click();
  dialog = desk.page.getByRole("dialog");
  await dialog.getByLabel("Kategorija").selectOption(categoryId);
  await dialog.getByLabel("Opis").fill(IMG);
  await dialog.getByLabel("Iznos (€)").fill("2");
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(desk.page.getByText("Trošak je sačuvan.").first()).toBeVisible();
  for (const path of [
    "/payments/today",
    "/members",
    `/members/${memberId}`,
    "/storage",
    "/reception",
  ])
    await inspect(desk.page, path, desk.problems);
  const titles = await desk.page
    .goto("/payments/today")
    .then(() =>
      desk.page
        .locator("tr[title]")
        .evaluateAll((trs) => trs.map((tr) => tr.getAttribute("title"))),
    );
  note(`SEC-01 row tooltips: ${JSON.stringify(titles)}`);
  expect(titles).toContain(IMG);
  expect(titles).toContain(SCRIPT);

  // The owner: an expense with HTML in description, supplier and invoice, then voided.
  const owner = await watched(browser, staff.owner);
  await owner.page.goto("/finance/expenses?period=month");
  await owner.page.getByRole("button", { name: "Novi trošak" }).click();
  dialog = owner.page.getByRole("dialog");
  await dialog
    .getByLabel("Kategorija", { exact: true })
    .selectOption(categoryId);
  await dialog.getByLabel("Opis").fill(SCRIPT);
  await dialog.getByLabel("Iznos (€)").fill("5");
  await dialog.getByLabel("Način", { exact: true }).selectOption("card");
  await dialog.locator("#expense-supplier").fill(IMG);
  await dialog.locator("#expense-invoice").fill("<b>1</b>");
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(
    owner.page.getByText("Trošak je sačuvan.").first(),
  ).toBeVisible();
  await owner.page
    .getByRole("row", { name: /script/ })
    .getByRole("button", { name: "Poništi" })
    .click();
  dialog = owner.page.getByRole("dialog");
  await dialog.getByLabel("Razlog").fill(IMG);
  await dialog.getByRole("button", { name: "Poništi" }).click();
  // S-17 confirms a void with "Poništeno" (S-12 says "Stavka je poništena.").
  await expect(owner.page.getByRole("dialog")).toBeHidden();
  await expect(owner.page.getByRole("row", { name: /script/ })).toContainText(
    `Poništeno: ${IMG}`,
  );

  const seen: Record<string, { img: boolean; script: boolean }> = {};
  for (const path of [
    "/finance/expenses?period=month",
    "/finance?period=month",
    "/finance/trainers",
    "/finance/audit?period=today",
    "/finance/storage?period=month",
    "/finance/backdated",
    "/payments/today",
    `/members/${memberId}?tab=uplate`,
    "/settings/plans",
    "/settings/products",
    "/settings/gym",
    "/settings/trainers",
    "/settings/users",
    "/stats/visits",
  ])
    seen[path] = await inspect(owner.page, path, owner.problems);
  note(
    `SEC-01 literal text per screen: ${Object.entries(seen)
      .map(
        ([path, hit]) =>
          `${path}=${hit.img ? "I" : "-"}${hit.script ? "S" : "-"}`,
      )
      .join(" ")}`,
  );
  // Where each value belongs, it is shown as the typed text.
  expect(seen["/finance/expenses?period=month"]).toEqual({
    img: true,
    script: true,
  });
  expect(seen["/settings/plans"].img).toBe(true);
  expect(seen["/settings/products"].script).toBe(true);
  expect(seen["/settings/gym"].img).toBe(true);
  expect(seen["/settings/trainers"].script).toBe(true);
  expect(seen["/settings/users"].img).toBe(true);

  // The shift PDF, closed by the owner from S-19.
  await owner.page.goto("/finance/shifts");
  await owner.page.getByRole("button", { name: "Zaključi smjenu" }).click();
  await owner.page
    .getByRole("dialog")
    .getByRole("button", { name: "Zaključi smjenu" })
    .click();
  await expect(
    owner.page.getByText("Smjena je zaključena.").first(),
  ).toBeVisible();
  const { data: shift } = await adminClient()
    .from("shifts")
    .select("id")
    .eq("gym_id", gymId)
    .single<{ id: string }>();
  const pdf = await owner.page.request.get(`/api/pdf/shift/${shift!.id}`);
  expect(pdf.status()).toBe(200);
  // The PDF wraps long cells, hyphenating where it breaks a word; joined back, the
  // cells read exactly as typed.
  const text = pdfText(await pdf.body())
    .replace(/-\n/g, "")
    .replace(/\n/g, "");
  note(
    `SEC-01 PDF contains img=${text.includes(IMG)} script=${text.includes(SCRIPT)}`,
  );
  expect(text).toContain(IMG);
  expect(text).toContain(SCRIPT);

  note(
    `SEC-01 problems: ${JSON.stringify([...desk.problems, ...owner.problems])}`,
  );
  expect([...desk.problems, ...owner.problems]).toEqual([]);
  await desk.page.context().close();
  await owner.page.context().close();
});

test("JOB-01: the nightly job checks out, closes as Automatski, and runs once a day", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const admin = adminClient();
  // A new shift and a member inside, with the close time half an hour ago.
  const desk = await watched(browser, staff.ana);
  await desk.page.goto(`/members/${memberId}`);
  await desk.page.getByRole("button", { name: "Ručna prijava" }).click();
  await expect(desk.page.locator("[data-result=yellow]")).toBeVisible();
  await desk.page.context().close();
  const close = gymClock(30);
  test.skip(
    close.date !== gymClock(0).date,
    "too close to midnight for a same-day close time",
  );
  await admin
    .from("gym_settings")
    .update({ auto_close_time: `${close.time}:00` })
    .eq("gym_id", gymId);

  const first = await admin.rpc("job_nightly", { p_gym: gymId });
  expect(first.error).toBeNull();
  const report = first.data as {
    ran: boolean;
    closed_at: string;
    visits_closed: number;
    shift_id: string | null;
  };
  note(
    `JOB-01 first run: ${JSON.stringify({ ...report, shift_id: Boolean(report.shift_id) })}`,
  );
  expect(report.ran).toBe(true);
  expect(report.visits_closed).toBe(1);
  expect(report.shift_id).not.toBeNull();

  const { data: visit } = await admin
    .from("visits")
    .select("checked_out_at, auto_checkout")
    .eq("member_id", memberId)
    .order("checked_in_at", { ascending: false })
    .limit(1)
    .single<{ checked_out_at: string; auto_checkout: boolean }>();
  expect(visit?.auto_checkout).toBe(true);
  expect(new Date(visit!.checked_out_at).getTime()).toBeGreaterThanOrEqual(
    new Date(report.closed_at).getTime(),
  );
  const { data: closed } = await admin
    .from("shifts")
    .select("close_type, counted_cash, closed_by")
    .eq("id", report.shift_id!)
    .single();
  expect(closed).toEqual({
    close_type: "auto",
    counted_cash: null,
    closed_by: null,
  });

  const second = await admin.rpc("job_nightly", { p_gym: gymId });
  expect(second.data).toEqual({ ran: false });
  const { count } = await admin
    .from("shifts")
    .select("id", { count: "exact", head: true })
    .eq("gym_id", gymId)
    .eq("close_type", "auto");
  expect(count).toBe(1);

  const owner = await watched(browser, staff.owner);
  await owner.page.goto("/finance/shifts?period=today");
  await expect(
    owner.page.getByRole("row", { name: /E2E Ana sigurnost/ }).filter({
      hasText: "Automatski",
    }),
  ).toBeVisible();
  await owner.page.context().close();
  console.log(`[note] all: ${notes.join(" | ")}`);
});
