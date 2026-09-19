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
// bar sale corrected and voided on S-12 (its quantity returns to stock).
test.describe.configure({ mode: "serial" });

const PASSWORD = "magacinlozinka1";

let gymId: string;
let receptionist: TestStaff;
let productId: string;

test.beforeAll(async ({}, workerInfo) => {
  gymId = await createTestGym(`${workerInfo.project.name}-storage-${suffix()}`);
  receptionist = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Šank",
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
  await dialog.getByText("Iz kase", { exact: true }).click();
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
