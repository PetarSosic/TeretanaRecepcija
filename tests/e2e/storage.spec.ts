import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// M-09 (doc 09): S-13 Magacin through the screens. D-55 in the form, E18 and E17, and a
// bar sale corrected and voided on S-12 (its quantity returns to stock). D-92: E23 from
// the desk to the owner's statement, cash flow and S-20.
test.describe.configure({ mode: "serial" });

const PASSWORD = "magacinlozinka1";

let gymId: string;
let receptionist: TestStaff;
let owner: TestStaff;
let productId: string;

test.beforeAll(async ({}, workerInfo) => {
  gymId = await createTestGym(`${workerInfo.project.name}-storage-${suffix()}`);
  receptionist = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Šank",
    password: PASSWORD,
  });
  owner = await createTestStaff(gymId, {
    role: "owner",
    fullName: "E2E Vlasnik Magacina",
    password: PASSWORD,
  });
  const admin = adminClient();
  // BR-130: the system category the stock-in expense uses; BR-140: Voda.
  const category = await admin
    .from("expense_categories")
    .insert({ gym_id: gymId, name: "E2E Roba za prodaju", is_system: true });
  if (category.error) throw new Error(category.error.message);
  const product = await admin
    .from("products")
    .insert({
      gym_id: gymId,
      name: "E2E Voda",
      current_purchase_price: 0.3,
      sale_price: 1.5,
    })
    .select("id")
    .single<{ id: string }>();
  if (product.error || !product.data) throw new Error(product.error?.message);
  productId = product.data.id;
});

test.afterAll(async () => {
  await deleteTestGym(gymId);
});

async function openStorage(page: Page) {
  await page.goto("/login");
  await page
    .getByLabel("Korisničko ime ili email")
    .fill(receptionist.identifier);
  await page.getByLabel("Lozinka", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await page.waitForURL(/\/reception/);
  await page.goto("/storage");
  await expect(page.getByRole("heading", { name: "Magacin" })).toBeVisible();
}

async function movements() {
  const { data } = await adminClient()
    .from("stock_movements")
    .select("type, quantity, voided_at")
    .eq("product_id", productId)
    .returns<{ type: string; quantity: number; voided_at: string | null }[]>();
  return data ?? [];
}

test("D-55 and E18: goods arrive from the till at the invoice price", async ({
  page,
}) => {
  await openStorage(page);
  await page.getByRole("button", { name: "Nova roba E2E Voda" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Količina").fill("24");
  // The current purchase price is prefilled (BR-141).
  await expect(
    dialog.getByLabel("Nabavna cijena po komadu (sa fakture)"),
  ).toHaveValue("0,30");

  // D-55: a free delivery is refused by the form, and nothing is written.
  await dialog.getByLabel("Nabavna cijena po komadu (sa fakture)").fill("0");
  await dialog.getByRole("checkbox", { name: /^Iz kase/ }).check();
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(
    dialog.getByText("Nabavna cijena mora biti najmanje 0,01 €."),
  ).toBeVisible();
  expect(await movements()).toHaveLength(0);

  // E18: 24 × €0.35 from the till.
  await dialog.getByLabel("Nabavna cijena po komadu (sa fakture)").fill("0,35");
  await expect(dialog.getByText("Ukupno: 8,40 €")).toBeVisible();
  await dialog.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Roba je evidentirana.")).toBeVisible();
  await expect(page.getByTestId("stock-E2E Voda")).toHaveText("24");
  await expect(page.getByRole("cell", { name: "0,35 €" })).toBeVisible();

  const { data } = await adminClient()
    .from("expenses")
    .select("description, amount::text, method, paid_from_till")
    .eq("gym_id", gymId)
    .single<Record<string, unknown>>();
  expect(data).toEqual({
    description: "Nabavka: E2E Voda × 24",
    amount: "8.40",
    method: "cash",
    paid_from_till: true,
  });
});

test("E17: a sale larger than the stock is refused, a smaller one is sold", async ({
  page,
}) => {
  await openStorage(page);
  await page.getByRole("button", { name: "Prodaja E2E Voda" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Količina").fill("30");
  await dialog.getByText("Gotovina", { exact: true }).click();
  await dialog.getByRole("button", { name: "Naplati" }).click();
  await expect(
    dialog.getByText("Nema dovoljno na stanju (stanje: 24)."),
  ).toBeVisible();

  await dialog.getByLabel("Količina").fill("2");
  await expect(dialog.getByText("Ukupno: 3,00 €")).toBeVisible();
  await dialog.getByRole("button", { name: "Naplati" }).click();
  await expect(page.getByText("Prodaja je sačuvana.")).toBeVisible();
  await expect(page.getByTestId("stock-E2E Voda")).toHaveText("22");
  // BR-144: nothing on the screen is a stock value or a profit.
  await expect(page.getByText(/vrijednost|zarada/i)).toHaveCount(0);
});

test("BR-094 and BR-095: the sale is corrected and voided on S-12", async ({
  page,
}) => {
  await openStorage(page);
  await page.goto("/payments/today");
  await expect(
    page.getByRole("heading", { name: "Prodaja iz magacina" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Ispravi E2E Voda × 2" }).click();
  const correct = page.getByRole("dialog");
  await correct.getByText("Platna kartica", { exact: true }).click();
  await correct.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Uplata je ispravljena.")).toBeVisible();

  await page.getByRole("button", { name: "Poništi E2E Voda × 2" }).click();
  const voiding = page.getByRole("dialog");
  await voiding.getByLabel("Razlog").fill("Pogrešan proizvod");
  await voiding.getByRole("button", { name: "Poništi" }).click();
  await expect(page.getByText("Stavka je poništena.")).toBeVisible();

  // BR-095: the stock-in's own expense is not voided from here.
  await expect(
    page.getByRole("button", {
      name: "Poništi E2E Roba za prodaju: Nabavka: E2E Voda × 24",
    }),
  ).toBeDisabled();

  await page.goto("/storage");
  await expect(page.getByTestId("stock-E2E Voda")).toHaveText("24");
  const sale = (await movements()).find((m) => m.type === "out");
  expect(sale?.voided_at).not.toBeNull();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("E23 and D-92: a sale costs its purchase price; the goods bought are a payment", async ({
  page,
  browser,
}) => {
  const whey = await adminClient().from("products").insert({
    gym_id: gymId,
    name: "E2E Whey",
    current_purchase_price: 28,
    sale_price: 41,
  });
  if (whey.error) throw new Error(whey.error.message);

  // The desk receives ten outside the till and sells one (BR-141, BR-142).
  await openStorage(page);
  await page.getByRole("button", { name: "Nova roba E2E Whey" }).click();
  const goods = page.getByRole("dialog");
  await goods.getByLabel("Količina").fill("10");
  await expect(
    goods.getByLabel("Nabavna cijena po komadu (sa fakture)"),
  ).toHaveValue("28,00");
  await goods.getByLabel("Način", { exact: true }).selectOption("none");
  await goods.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Roba je evidentirana.")).toBeVisible();
  await page.getByRole("button", { name: "Prodaja E2E Whey" }).click();
  const sale = page.getByRole("dialog");
  await sale.getByLabel("Količina").fill("1");
  await sale.getByText("Gotovina", { exact: true }).click();
  await sale.getByRole("button", { name: "Naplati" }).click();
  await expect(page.getByText("Prodaja je sačuvana.")).toBeVisible();
  await expect(page.getByTestId("stock-E2E Whey")).toHaveText("9");

  const ownerPage = await (await browser.newContext()).newPage();
  await ownerPage.goto("/login");
  await ownerPage.getByLabel("Korisničko ime ili email").fill(owner.identifier);
  await ownerPage.getByLabel("Lozinka", { exact: true }).fill(PASSWORD);
  await ownerPage.getByRole("button", { name: "Prijavi se" }).click();
  await ownerPage.waitForURL((url) => !url.pathname.startsWith("/login"));

  // S-16: today the Whey cost €28 (the Voda sale above was voided), while €280 of Whey
  // and the €8.40 of Voda from the first test were paid for (BR-153, BR-158). What is
  // left is 9 × €28 of Whey and 24 × €0.35 of Voda (BR-159).
  await ownerPage.goto("/finance?period=today");
  const statement = ownerPage.locator("section", {
    has: ownerPage.getByRole("heading", { name: "Bilans uspjeha" }),
  });
  await expect(
    statement.getByRole("row", { name: /^Trošak prodate robe/ }),
  ).toContainText("28,00 €");
  await expect(
    statement.getByRole("row", { name: /^Bruto dobit/ }),
  ).toContainText("13,00 €");
  await expect(statement.getByRole("row", { name: /^Profit/ })).toContainText(
    "+13,00 €",
  );
  const cash = ownerPage.locator("section", {
    has: ownerPage.getByRole("heading", { name: "Novčani tok" }),
  });
  await expect(
    cash.getByRole("row", { name: /^Plaćena nova roba/ }),
  ).toContainText("288,40 €");
  await expect(cash).toContainText("260,40 €");

  // S-20: E23 per product, and the stock at the end of the period.
  await ownerPage.goto("/finance/storage?period=today");
  const row = ownerPage
    .locator("section", {
      has: ownerPage.getByRole("heading", { name: "Magacin", exact: true }),
    })
    .getByRole("row", { name: /^E2E Whey/ });
  await expect(row.getByRole("cell")).toHaveText([
    "E2E Whey",
    "28,00 €",
    "41,00 €",
    "10",
    "280,00 €",
    "1",
    "41,00 €",
    "28,00 €",
    "13,00 €",
    "31,7 %",
    "9",
    "252,00 €",
  ]);
  await ownerPage.context().close();
});

/** BR-001: a day of the gym, never the machine's, as yyyy-mm-dd. */
function gymDate(days: number): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Podgorica",
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

async function stockInExpense(invoice: string) {
  const { data } = await adminClient()
    .from("expenses")
    .select(
      "spent_on, description, amount::text, method, paid_from_till, supplier, vat_included, shift_id",
    )
    .eq("gym_id", gymId)
    .eq("invoice_number", invoice)
    .single();
  return data;
}

test("D-95: Nova roba takes the expense fields; only the owner moves the date", async ({
  browser,
}) => {
  // The desk: the same fields, the date fixed to today, the description suggested.
  const desk = await (await browser.newContext()).newPage();
  await openStorage(desk);
  await desk.getByRole("button", { name: "Nova roba E2E Voda" }).click();
  const goods = desk.getByRole("dialog");
  await expect(goods.getByLabel("Kategorija")).toHaveCount(0);
  await expect(goods.getByLabel("Datum")).toBeDisabled();
  await expect(goods.getByLabel("Datum")).toHaveValue(gymDate(0));
  await expect(goods.getByLabel("Opis")).toHaveValue("Nabavka: E2E Voda");
  await goods.getByLabel("Količina").fill("6");
  await expect(goods.getByLabel("Opis")).toHaveValue("Nabavka: E2E Voda × 6");
  await goods.getByLabel("Nabavna cijena po komadu (sa fakture)").fill("0,40");
  await expect(goods.getByText("Ukupno: 2,40 €")).toBeVisible();
  await goods.getByLabel("Način", { exact: true }).selectOption("card");
  await goods.getByLabel("PDV uračunat").selectOption("yes");
  await goods.getByLabel("Dobavljač").fill("E2E Veletrgovina");
  await goods.getByLabel("Račun").fill("E2E-R-1");
  await goods.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(desk.getByText("Roba je evidentirana.").first()).toBeVisible();
  expect(await stockInExpense("E2E-R-1")).toMatchObject({
    spent_on: gymDate(0),
    description: "Nabavka: E2E Voda × 6",
    amount: "2.40",
    method: "card",
    paid_from_till: false,
    supplier: "E2E Veletrgovina",
    vat_included: true,
  });
  await desk.context().close();

  // The owner: an earlier payment day and an own description; no shift for that day.
  const ownerPage = await (await browser.newContext()).newPage();
  await ownerPage.goto("/login");
  await ownerPage.getByLabel("Korisničko ime ili email").fill(owner.identifier);
  await ownerPage.getByLabel("Lozinka", { exact: true }).fill(PASSWORD);
  await ownerPage.getByRole("button", { name: "Prijavi se" }).click();
  await ownerPage.waitForURL((url) => !url.pathname.startsWith("/login"));
  await ownerPage.goto("/storage");
  await ownerPage.getByRole("button", { name: "Nova roba E2E Voda" }).click();
  const owned = ownerPage.getByRole("dialog");
  await owned.getByLabel("Količina").fill("2");
  await owned.getByLabel("Opis").fill("E2E faktura za vodu");
  await expect(owned.getByLabel("Datum")).toBeEnabled();
  await owned.getByLabel("Datum").fill(gymDate(-3));
  await owned.getByLabel("Način", { exact: true }).selectOption("none");
  await owned.getByLabel("Račun").fill("E2E-R-2");
  await owned.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(
    ownerPage.getByText("Roba je evidentirana.").first(),
  ).toBeVisible();
  expect(await stockInExpense("E2E-R-2")).toMatchObject({
    spent_on: gymDate(-3),
    description: "E2E faktura za vodu",
    amount: "0.80",
    method: null,
    paid_from_till: false,
    supplier: null,
    vat_included: null,
    shift_id: null,
  });
  await ownerPage.context().close();
});
