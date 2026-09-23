import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// TEST_PLAN.md §3: the remaining steps of the Kritično money cases left DJELOMIČNO on
// 22.09.2026 (PAY-08 to PAY-12, STO-06, CLOSE-07), against one synthetic gym (D-56).
// Serial: one receptionist's shift carries every record until it is closed.
test.describe.configure({ mode: "serial" });

const PASSWORD = "novaclozinka1";

let gymId: string;
let owner: TestStaff;
let ana: TestStaff;
let manager: TestStaff;
let mjesecnaId: string;
let memberId: string;
let productId: string;

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
  gymId = await createTestGym(`${workerInfo.project.name}-money-${suffix()}`);
  owner = await createTestStaff(gymId, {
    role: "owner",
    fullName: "E2E Vlasnik novca",
    password: PASSWORD,
  });
  ana = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Ana novac",
    password: PASSWORD,
  });
  manager = await createTestStaff(gymId, {
    role: "manager",
    fullName: "E2E Menadžer novca",
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
  mjesecnaId = plans.find((p) => p.name === "E2E Mjesečna")!.id;
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
  await must(
    admin
      .from("stock_movements")
      .insert({
        gym_id: gymId,
        product_id: productId,
        type: "in",
        quantity: 5,
        unit_cost: 0.3,
        created_by: owner.id,
      })
      .select("id"),
    "Test stock",
  );
  memberId = (
    await must(
      admin
        .from("members")
        .insert({
          gym_id: gymId,
          member_number: 1,
          first_name: "E2E Poništena",
          last_name: "Članica",
          phone: "+38267500001",
          email: "ponistena@e2e.invalid",
          date_of_birth: "1990-01-01",
          created_by: owner.id,
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

async function signedIn(browser: Browser, who: TestStaff): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });
  const page = await context.newPage();
  await signIn(page, who);
  return page;
}

async function sellDayPass(page: Page) {
  await page.goto("/reception");
  await page
    .getByRole("button", { name: "Počni rad" })
    .click({ timeout: 3_000 })
    .catch(() => {});
  await page.getByRole("button", { name: "Dnevna karta" }).click();
  const pass = page.getByRole("dialog");
  await pass.getByText("Gotovina", { exact: true }).click();
  await pass.getByRole("button", { name: "Naplati" }).click();
  await expect(
    page.getByText("Prodato: 1 × dnevna karta = 10,00 €").first(),
  ).toBeVisible();
}

/** The S-14 card value, e.g. "Gotovina (prihod)" → "10,00 €". */
async function closeCard(page: Page, label: string): Promise<string> {
  await page.goto("/shift/close");
  const term = page.locator("dt", { hasText: label });
  return (
    (await term.locator("xpath=following-sibling::dd").textContent()) ?? ""
  ).trim();
}

const notes: string[] = [];
function note(text: string) {
  notes.push(text);
  console.log(`[note] ${text}`);
}

test("PAY-08: the receptionist corrects method and note, not the amount; it is audited", async ({
  page,
  browser,
}) => {
  await signIn(page, ana);
  await sellDayPass(page);
  await page.goto("/payments/today");
  await page.getByRole("button", { name: "Ispravi Dnevna karta × 1" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Iznos (€)")).toHaveCount(0);
  await dialog.getByText("Platna kartica", { exact: true }).click();
  await dialog.getByLabel("Napomena").fill("Greška pri naplati");
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Uplata je ispravljena.").first()).toBeVisible();
  const { data } = await adminClient()
    .from("payments")
    .select("method, note, amount")
    .eq("gym_id", gymId)
    .eq("kind", "day_pass")
    .single<{ method: string; note: string; amount: number }>();
  expect(data).toEqual({
    method: "card",
    note: "Greška pri naplati",
    amount: 10,
  });

  const boss = await signedIn(browser, owner);
  await boss.goto("/finance/audit?period=today");
  // The screen streams in after its skeleton, so wait for the row itself.
  await expect(boss.locator("main")).toContainText("Greška pri naplati", {
    timeout: 20_000,
  });
  const audit = (await boss.locator("main").textContent()) ?? "";
  note(
    `PAY-08 audit row: ${audit.match(/.{0,80}Greška pri naplati.{0,40}/)?.[0]}`,
  );
  await boss.context().close();
});

test("PAY-11: voiding needs a 3–200 character reason; the row stays, struck, out of the totals", async ({
  page,
}) => {
  await signIn(page, ana);
  await sellDayPass(page);
  expect(await closeCard(page, "Gotovina (prihod)")).toBe("10,00 €");

  await page.goto("/payments/today");
  const rows = page.locator("tr", { hasText: "Dnevna karta × 1" });
  await expect(rows).toHaveCount(2);
  const cashRow = rows.filter({ hasText: "Gotovina" });
  await cashRow
    .getByRole("button", { name: "Poništi Dnevna karta × 1" })
    .click();
  const dialog = page.getByRole("dialog");
  for (const reason of ["ab", "R".repeat(201)]) {
    await dialog.getByLabel("Razlog").fill(reason);
    await dialog.getByRole("button", { name: "Poništi" }).click();
    await expect(
      dialog.getByText("Unesite razlog (3–200 znakova).").first(),
      `${reason.length} znakova`,
    ).toBeVisible();
  }
  await dialog.getByLabel("Razlog").fill("Greška u naplati");
  await dialog.getByRole("button", { name: "Poništi" }).click();
  await expect(page.getByText("Stavka je poništena.").first()).toBeVisible();

  const voided = page.locator("tr[data-voided=true]", {
    hasText: "Dnevna karta × 1",
  });
  await expect(voided).toHaveCount(1);
  await expect(voided).toContainText("Poništeno");
  await expect(voided).toHaveClass(/line-through/);
  expect(await closeCard(page, "Gotovina (prihod)")).toBe("0,00 €");
});

test("PAY-12: voiding a membership payment voids the membership and unlinks its visit", async ({
  page,
}) => {
  await signIn(page, ana);
  await page.goto(`/members/${memberId}`);
  await page.getByRole("button", { name: "Nova članarina" }).click();
  const sell = page.getByRole("dialog");
  await sell.getByLabel("Vrsta članarine").selectOption(mjesecnaId);
  await sell.getByText("Gotovina", { exact: true }).click();
  await sell.getByRole("button", { name: "Naplati i sačuvaj" }).click();
  await expect(page.getByText("Članarina sačuvana.").first()).toBeVisible();
  await page.getByRole("button", { name: "Ručna prijava" }).click();
  await expect(page.locator("[data-result=covered]")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/payments/today");
  await page.getByRole("button", { name: /^Poništi E2E Mjesečna/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText(
      "Poništavanjem ove uplate poništava se i članarina, a njeni dolasci postaju neplaćeni.",
    ),
  ).toBeVisible();
  await dialog.getByLabel("Razlog").fill("Test poništavanja");
  await dialog.getByRole("button", { name: "Poništi" }).click();
  await expect(page.getByText("Stavka je poništena.").first()).toBeVisible();

  await page.goto(`/members/${memberId}`);
  await expect(page.getByText("Neplaćeni dolasci: 1")).toBeVisible();
  await expect(page.getByRole("row", { name: /E2E Mjesečna/ })).toContainText(
    "Poništena",
  );
  await page.goto(`/members/${memberId}?tab=dolasci`);
  await expect(
    page.getByText("Neplaćeno", { exact: true }).last(),
  ).toBeVisible();
});

test("STO-06: selling more than the stock is refused and nothing changes", async ({
  page,
}) => {
  await signIn(page, ana);
  await page.goto("/storage");
  await expect(page.getByTestId("stock-E2E Voda")).toHaveText("5");
  await page.getByRole("button", { name: "Prodaja E2E Voda" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Količina").fill("6");
  await dialog.getByText("Gotovina", { exact: true }).click();
  await dialog.getByRole("button", { name: "Naplati" }).click();
  await expect(
    dialog.getByText("Nema dovoljno na stanju (stanje: 5).").first(),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByTestId("stock-E2E Voda")).toHaveText("5");
  const { count } = await adminClient()
    .from("stock_movements")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .eq("type", "out");
  expect(count).toBe(0);
});

test("PAY-09: the owner changes an amount, and the shift totals follow", async ({
  page,
}) => {
  await signIn(page, owner);
  await page.goto("/payments/today");
  const cardRow = page
    .locator("tr:not([data-voided])", { hasText: "Dnevna karta × 1" })
    .filter({ hasText: "Platna kartica" });
  await cardRow
    .getByRole("button", { name: "Ispravi Dnevna karta × 1" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Iznos (€)").fill("70");
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Uplata je ispravljena.").first()).toBeVisible();
  await expect(cardRow).toContainText("70,00 €");

  // The S-12 footer that owners and managers see (D-54), and the receptionist's S-14.
  const footer = page.getByRole("region", { name: "Otvorena smjena" });
  note(
    `PAY-09 S-12 footer: ${(await footer.textContent().catch(() => ""))?.replace(/\s+/g, " ")}`,
  );
  await expect(footer).toContainText("70,00 €");
  const ana2 = await page
    .context()
    .browser()!
    .newContext({
      viewport: { width: 1366, height: 768 },
    });
  const desk = await ana2.newPage();
  await signIn(desk, ana);
  expect(await closeCard(desk, "Platna kartica (prihod)")).toBe("70,00 €");
  await ana2.close();
});

test("PAY-10 and CLOSE-07: after the shift closes its records are the owner's alone", async ({
  page,
  browser,
}) => {
  await signIn(page, ana);
  await page.goto("/shift/close");
  const expected = await page
    .locator("dt", { hasText: "Očekivana gotovina" })
    .locator("xpath=following-sibling::dd")
    .textContent();
  await page
    .getByLabel("Prebrojana gotovina (€)")
    .fill((expected ?? "0").replace(/[^\d,]/g, ""));
  await page
    .getByRole("button", { name: "Zaključi smjenu i odjavi me" })
    .click();
  await page.getByRole("button", { name: "Zaključi", exact: true }).click();
  await expect(page.getByText("Smjena je zaključena.")).toBeVisible({
    timeout: 30_000,
  });

  // CLOSE-07: the same receptionist opens a new shift the same day.
  await signIn(page, ana);
  await expect(page).toHaveURL(/\/reception/);
  await page.goto("/payments/today");
  await expect(
    page.getByRole("heading", { name: "Uplate danas" }),
  ).toBeVisible();
  await expect(page.getByText("Poništeno").first()).toBeVisible();
  const old = page.getByRole("button", { name: "Ispravi Dnevna karta × 1" });
  const count = await old.count();
  note(`PAY-10 closed-shift rows listed to the receptionist: ${count}`);
  if (count) {
    for (const button of await old.all()) {
      await expect(button).toBeDisabled();
      await expect(button).toHaveAttribute(
        "title",
        "Stavka iz zaključene smjene – samo vlasnik je može mijenjati.",
      );
    }
    for (const button of await page
      .getByRole("button", { name: /^Poništi / })
      .all())
      await expect(button).toBeDisabled();
  }

  // A manager sees the whole day (D-54), so the closed shift's rows are listed to
  // them, read-only with the reason.
  const mgr = await signedIn(browser, manager);
  await mgr.goto("/payments/today");
  await expect(
    mgr.getByRole("heading", { name: "Uplate danas" }),
  ).toBeVisible();
  await expect(mgr.getByText("Poništeno").first()).toBeVisible();
  const closedRows = mgr.getByRole("button", {
    name: "Ispravi Dnevna karta × 1",
  });
  note(
    `PAY-10 closed-shift rows listed to the manager: ${await closedRows.count()}`,
  );
  expect(await closedRows.count()).toBeGreaterThan(0);
  for (const button of await closedRows.all()) {
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute(
      "title",
      "Stavka iz zaključene smjene – samo vlasnik je može mijenjati.",
    );
  }
  await mgr.context().close();

  const boss = await signedIn(browser, owner);
  await boss.goto("/payments/today");
  await expect(
    boss
      .locator("tr:not([data-voided])", { hasText: "Dnevna karta × 1" })
      .getByRole("button", { name: "Ispravi Dnevna karta × 1" }),
  ).toBeEnabled();
  console.log(`[note] all: ${notes.join(" | ")}`);
});
