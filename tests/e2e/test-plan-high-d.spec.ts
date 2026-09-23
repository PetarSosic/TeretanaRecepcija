import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";
import { pdfText } from "./pdf-text";

// TEST_PLAN.md §3, priority Visoko, group D (storage and cards): STO-01, STO-02,
// STO-03, STO-04, STO-05, STO-08, STO-09, STO-11, CARD-02, CARD-03. One synthetic gym
// (D-56), serial: the stock level carries from one case to the next.
test.describe.configure({ mode: "serial" });

const PASSWORD = "visokoDlozinka1";
const ZONE = "Europe/Podgorica";

let gymId: string;
let gymName: string;
const staff = {} as Record<"owner" | "manager" | "ana", TestStaff>;
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

test.beforeAll(async ({}, workerInfo) => {
  test.skip(workerInfo.project.name !== "desktop");
  gymName = `E2E ${workerInfo.project.name}-visd-${suffix()}`;
  gymId = await createTestGym(gymName.slice(4));
  for (const [key, role, name] of [
    ["owner", "owner", "E2E Vlasnik D"],
    ["manager", "manager", "E2E Menadžer D"],
    ["ana", "receptionist", "E2E Ana D"],
  ] as const)
    staff[key] = await createTestStaff(gymId, {
      role,
      fullName: name,
      password: PASSWORD,
    });
  const admin = adminClient();
  // BR-130: the system category every stock-in expense goes to.
  await must(
    admin
      .from("expense_categories")
      .insert({
        gym_id: gymId,
        name: "Roba za prodaju",
        is_system: true,
        is_salary: false,
      })
      .select("id"),
    "Test system category",
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

const stock = (page: Page) => page.getByTestId("stock-E2E Voda");

async function stockIn(
  page: Page,
  quantity: string,
  cost: string,
  payment: "Iz kase" | "Van kase" | null,
): Promise<Locator> {
  await page.getByRole("button", { name: "Nova roba E2E Voda" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Količina").fill(quantity);
  await dialog.getByLabel("Nabavna cijena po komadu (sa fakture)").fill(cost);
  if (payment) await dialog.getByText(payment, { exact: true }).click();
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  return dialog;
}

async function tillExpenses(page: Page): Promise<string> {
  await page.goto("/shift/close");
  return (
    (await page
      .locator("dt", { hasText: "Troškovi iz kase" })
      .locator("xpath=following-sibling::dd")
      .textContent()) ?? ""
  ).trim();
}

const notes: string[] = [];
function note(text: string) {
  notes.push(text);
  console.log(`[note] ${text}`);
}

test("STO-03 and STO-04: stock-in cost and quantity bounds, and the sale quantity", async ({
  page,
}) => {
  await signIn(page, staff.ana);
  await page.goto("/storage");
  const COST = "Nabavna cijena mora biti najmanje 0,01 €.";
  for (const cost of ["0", "0,001", "-1", "abc", ""]) {
    const dialog = await stockIn(page, "5", cost, "Van kase");
    await expect(
      dialog.getByText(COST).first(),
      `cijena "${cost}"`,
    ).toBeVisible();
    await page.keyboard.press("Escape");
  }
  const QTY = "Unesite količinu od 1 do 10000.";
  // "abc" cannot be typed: the field is type=number and the browser refuses letters.
  for (const quantity of ["0", "10001", "-5", "2.5"]) {
    const dialog = await stockIn(page, quantity, "0,30", "Van kase");
    await expect(
      dialog.getByText(QTY).first(),
      `količina "${quantity}"`,
    ).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await expect(stock(page)).toHaveText("0");
  const { count } = await adminClient()
    .from("stock_movements")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId);
  expect(count).toBe(0);
});

test("STO-01: a stock-in paid from the till sets stock, price and the expense", async ({
  page,
}) => {
  await signIn(page, staff.ana);
  await page.goto("/storage");
  const dialog = await stockIn(page, "24", "0,35", "Iz kase");
  await expect(page.getByText("Roba je evidentirana.").first()).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(stock(page)).toHaveText("24");
  await expect(page.getByRole("row", { name: /E2E Voda/ })).toContainText(
    "0,35 €",
  );
  await page.goto("/payments/today");
  const row = page.locator("tr", { hasText: "Roba za prodaju" });
  await expect(row).toContainText("8,40 €");
  expect(await tillExpenses(page)).toBe("8,40 €");
});

test("STO-02: a stock-in outside the till adds stock but not till expenses", async ({
  page,
}) => {
  await signIn(page, staff.ana);
  await page.goto("/storage");
  await stockIn(page, "12", "0,30", "Van kase");
  await expect(page.getByText("Roba je evidentirana.").first()).toBeVisible();
  await expect(stock(page)).toHaveText("36");
  expect(await tillExpenses(page)).toBe("8,40 €");
  const { data } = await adminClient()
    .from("expenses")
    .select("amount, method, paid_from_till")
    .eq("gym_id", gymId)
    .eq("amount", 3.6)
    .single();
  expect(data).toEqual({ amount: 3.6, method: null, paid_from_till: false });
});

test("STO-05, STO-04 (sale) and STO-08: sell 2, correct, void, stock back", async ({
  page,
}) => {
  await signIn(page, staff.ana);
  await page.goto("/storage");
  const sale = page.getByRole("dialog");
  // A fresh dialog for every value (the storage dialogs mount only while open), so an
  // answer is never confused with the previous one.
  for (const quantity of ["0", "37", "-1"]) {
    await page.getByRole("button", { name: "Prodaja E2E Voda" }).click();
    await expect(sale.locator(".text-danger")).toHaveCount(0);
    await sale.getByLabel("Količina").fill(quantity);
    await sale.getByText("Gotovina", { exact: true }).click();
    await sale.getByRole("button", { name: "Naplati" }).click();
    await expect(sale.locator(".text-danger").first(), quantity).toBeVisible();
    const shown = (await sale.locator(".text-danger").allInnerTexts()).join(
      " / ",
    );
    note(`STO-04 sale "${quantity}" → ${shown}`);
    expect(shown, quantity).not.toBe("");
    await page.keyboard.press("Escape");
    await expect(sale).toBeHidden();
  }
  await page.getByRole("button", { name: "Prodaja E2E Voda" }).click();
  await sale.getByLabel("Količina").fill("2");
  await sale.getByText("Gotovina", { exact: true }).click();
  await expect(sale.getByText("Ukupno: 3,00 €")).toBeVisible();
  await sale.getByRole("button", { name: "Naplati" }).click();
  await expect(page.getByText("Prodaja je sačuvana.").first()).toBeVisible();
  await expect(stock(page)).toHaveText("34");

  await page.goto("/payments/today");
  await expect(page.getByText("E2E Voda × 2").first()).toBeVisible();
  await page.getByRole("button", { name: "Ispravi E2E Voda × 2" }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Količina")).toHaveCount(0);
  await dialog.getByText("Platna kartica", { exact: true }).click();
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(dialog).toBeHidden();
  const { data: corrected } = await adminClient()
    .from("stock_movements")
    .select("method, quantity, unit_price")
    .eq("product_id", productId)
    .eq("type", "out")
    .single();
  expect(corrected).toEqual({ method: "card", quantity: 2, unit_price: 1.5 });

  await page.getByRole("button", { name: "Poništi E2E Voda × 2" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Razlog").fill("Test");
  await dialog.getByRole("button", { name: "Poništi" }).click();
  await expect(page.getByText("Stavka je poništena.").first()).toBeVisible();
  await expect(
    page.locator("tr[data-voided=true]", { hasText: "E2E Voda × 2" }),
  ).toHaveClass(/line-through/);
  await page.goto("/storage");
  await expect(stock(page)).toHaveText("36");
});

test("STO-11: the desk sees no stock value or profit; the owner's report does", async ({
  browser,
}) => {
  const desk = await signedIn(browser, staff.ana);
  await desk.goto("/storage");
  await expect(stock(desk)).toHaveText("36");
  // Under a full-suite load the table can still be streaming in after the first cell.
  await expect(desk.getByRole("columnheader", { name: "Proizvod" })).toBeVisible();
  const headers = (await desk.getByRole("columnheader").allInnerTexts()).map(
    (h) => h.trim(),
  );
  note(`STO-11 desk columns: ${headers.join(" | ")}`);
  for (const column of [
    "Proizvod",
    "Stanje",
    "Nabavna cijena",
    "Prodajna cijena",
  ])
    expect(headers).toContain(column);
  await expect(desk.locator("main")).not.toContainText(
    /vrijednost zalihe|zarada/i,
  );
  await desk.context().close();

  const owner = await signedIn(browser, staff.owner);
  await owner.goto("/finance/storage?period=month");
  await expect(owner.getByText("Vrijednost zalihe").first()).toBeVisible();
  await owner.context().close();
});

test("STO-09 (E18): a stock-in that was sold cannot be voided; one that can takes its expense", async ({
  browser,
}) => {
  // Sell 30 of the 36, leaving 6: neither the 24 nor the 12 can be taken back.
  const desk = await signedIn(browser, staff.ana);
  await desk.goto("/storage");
  await desk.getByRole("button", { name: "Prodaja E2E Voda" }).click();
  const sale = desk.getByRole("dialog");
  await sale.getByLabel("Količina").fill("30");
  await sale.getByText("Gotovina", { exact: true }).click();
  await sale.getByRole("button", { name: "Naplati" }).click();
  await expect(desk.getByText("Prodaja je sačuvana.").first()).toBeVisible();
  // A small stock-in that can be voided afterwards.
  await stockIn(desk, "5", "0,40", "Van kase");
  await expect(desk.getByText("Roba je evidentirana.").first()).toBeVisible();
  await expect(stock(desk)).toHaveText("11");
  await desk.context().close();

  const owner = await signedIn(browser, staff.owner);
  await owner.goto("/finance/storage?period=month");
  const voidRow = async (quantity: string) => {
    const row = owner
      .getByRole("row")
      .filter({ hasText: "E2E Voda" })
      .filter({ has: owner.getByRole("cell", { name: quantity, exact: true }) })
      .filter({ has: owner.getByRole("button", { name: "Poništi" }) });
    await row.getByRole("button", { name: "Poništi" }).click();
    const dialog = owner.getByRole("dialog");
    await dialog.getByLabel("Razlog").fill("E2E test");
    await dialog.getByRole("button", { name: "Poništi" }).click();
  };
  await voidRow("24");
  await expect(
    owner
      .getByText("Poništavanje nije moguće – stanje bi bilo negativno.")
      .first(),
  ).toBeVisible();
  await owner.keyboard.press("Escape");
  await voidRow("5");
  await expect(owner.getByRole("dialog")).toBeHidden();
  const { data: movements } = await adminClient()
    .from("stock_movements")
    .select("quantity, voided_at")
    .eq("product_id", productId)
    .eq("type", "in")
    .order("created_at")
    .returns<{ quantity: number; voided_at: string | null }[]>();
  expect(movements?.map((m) => [m.quantity, Boolean(m.voided_at)])).toEqual([
    [24, false],
    [12, false],
    [5, true],
  ]);
  const { data: expense } = await adminClient()
    .from("expenses")
    .select("voided_at")
    .eq("gym_id", gymId)
    .eq("amount", 2)
    .single<{ voided_at: string | null }>();
  expect(expense?.voided_at).not.toBeNull();
  await owner.goto("/storage");
  await expect(stock(owner)).toHaveText("6");
  await owner.context().close();
});

test("CARD-02 and CARD-03: batch size bounds; the sheet PDF and its codes", async ({
  page,
}) => {
  await signIn(page, staff.manager);
  await page.goto("/settings/cards");
  const quantity = page.getByLabel("Broj kartica (1–100)");
  const generate = page.getByRole("button", { name: "Generiši" });
  const batches = async () =>
    (
      await adminClient()
        .from("card_batches")
        .select("id", { count: "exact", head: true })
        .eq("gym_id", gymId)
    ).count ?? 0;
  for (const value of ["0", "101", "-5", "abc", "", "2.5"]) {
    await quantity.fill(value);
    await generate.click();
    await expect(
      page.getByText("Unesite broj između 1 i 100.").first(),
      `"${value}"`,
    ).toBeVisible();
    await expect(generate).toBeEnabled();
  }
  expect(await batches()).toBe(0);
  for (const value of ["1", "100"]) {
    await quantity.fill(value);
    await generate.click();
    await expect(
      page.getByText("Kartice su generisane.").first(),
    ).toBeVisible();
    await expect.poll(batches).toBe(value === "1" ? 1 : 2);
  }

  // CARD-03: the one-card batch's sheet.
  const { data: batch } = await adminClient()
    .from("card_batches")
    .select("id")
    .eq("gym_id", gymId)
    .eq("quantity", 1)
    .single<{ id: string }>();
  const { data: cards } = await adminClient()
    .from("cards")
    .select("code")
    .eq("batch_id", batch!.id)
    .returns<{ code: string }[]>();
  const response = await page.request.get(`/api/pdf/cards/${batch!.id}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toBe(
    `attachment; filename="kartice-${gymToday()}.pdf"`,
  );
  const text = pdfText(await response.body()).replace(/\n/g, " ");
  note(`CARD-03 PDF text: ${text.slice(0, 200)}`);
  // The sheet prints the code in groups (lib/pdf/card-sheet.tsx formatCardCode).
  const code = cards![0].code;
  expect(text).toContain(
    `${code.slice(0, 3)} ${code.slice(3, 6)} ${code.slice(6)}`,
  );
  expect(text).toContain("Ime i prezime:");

  // The printed code is one the reception accepts: an empty card opens registration.
  await page.goto("/reception");
  await page
    .getByRole("button", { name: "Počni rad" })
    .click({ timeout: 3_000 })
    .catch(() => {});
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await page.keyboard.type(cards![0].code);
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Novi član" }),
  ).toBeVisible();
  console.log(`[note] all: ${notes.join(" | ")}`);
});
