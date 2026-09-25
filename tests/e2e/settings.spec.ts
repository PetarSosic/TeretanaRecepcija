import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  createTestCatalog,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// M-03 "done when" (doc 09): the manager sees S-24 without the fee column, the
// receptionist cannot open settings at all, and a plan price change is possible.
test.describe.configure({ mode: "serial" });

const PASSWORD = "podesavanja1";

let gymId: string;
let owner: TestStaff;
let manager: TestStaff;
let receptionist: TestStaff;

test.beforeAll(async ({}, workerInfo) => {
  gymId = await createTestGym(
    `${workerInfo.project.name}-settings-${suffix()}`,
  );
  await createTestCatalog(gymId);
  owner = await createTestStaff(gymId, {
    role: "owner",
    fullName: "E2E Vlasnik podešavanja",
    password: PASSWORD,
  });
  manager = await createTestStaff(gymId, {
    role: "manager",
    fullName: "E2E Menadžer podešavanja",
    password: PASSWORD,
  });
  receptionist = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Recepcioner podešavanja",
    password: PASSWORD,
  });
});

test.afterAll(async () => {
  await deleteTestGym(gymId);
});

async function signIn(page: Page, staff: TestStaff) {
  await page.goto("/login");
  await page.getByLabel("Korisničko ime ili email").fill(staff.identifier);
  await page.getByLabel("Lozinka", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("US-22.1 AC3: the owner sees the trainer fee column and can change it", async ({
  page,
}) => {
  await signIn(page, owner);
  await page.goto("/settings/trainers");

  await expect(
    page.getByRole("columnheader", {
      name: "Naknada teretani po personalnom klijentu (€)",
    }),
  ).toBeVisible();

  // D-62: the group share field sits under its own header, not beside the fee.
  const shareHeader = await page
    .getByRole("columnheader", { name: "Udio za grupne (%)" })
    .boundingBox();
  const shareField = await page
    .getByRole("row", { name: "E2E Trenerka" })
    .getByLabel("Udio za grupne (%)")
    .boundingBox();
  expect(shareField!.x).toBeGreaterThanOrEqual(shareHeader!.x);

  const feeField = page.getByLabel(
    "Naknada teretani po personalnom klijentu (€)",
  );
  // N-13: the field holds the value it accepts back, without the currency sign.
  await expect(feeField).toHaveValue("80,00");
  await feeField.fill("90,50");
  await page
    .getByRole("row", { name: "E2E Trenerka" })
    .getByRole("button", { name: "Sačuvaj" })
    .click();
  await expect(page.getByText("Sačuvano.")).toBeVisible();

  const { data } = await adminClient()
    .from("trainer_finance")
    .select("personal_gym_fee")
    .eq("gym_id", gymId)
    .single<{ personal_gym_fee: string }>();
  expect(Number(data?.personal_gym_fee)).toBe(90.5);
});

test("US-22.1 AC2: a slot can only take a trainer assigned to its program", async ({
  page,
}) => {
  await signIn(page, owner);
  await page.goto("/settings/trainers");

  // A second trainer with no assignment must not be offered for the group slot.
  await adminClient()
    .from("trainers")
    .insert({ gym_id: gymId, full_name: "E2E Nedodijeljena" });
  await page.reload();

  await page.getByRole("button", { name: "Dodaj čas" }).click();
  const trainers = await page
    .getByLabel("Trener")
    .locator("option")
    .allInnerTexts();
  expect(trainers).toContain("E2E Trenerka");
  expect(trainers).not.toContain("E2E Nedodijeljena");
});

test("BR-026: a manager sees S-24 without the fee column", async ({ page }) => {
  await signIn(page, manager);
  await page.goto("/settings/trainers");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Treneri i raspored",
  );
  await expect(page.getByText("E2E Trenerka").first()).toBeVisible();
  await expect(
    page.getByRole("columnheader", {
      name: "Naknada teretani po personalnom klijentu (€)",
    }),
  ).toHaveCount(0);
  await expect(page.getByText("80,00 €")).toHaveCount(0);

  // P-61 and P-62: prices and plans stay with the owner.
  await page.goto("/settings/plans");
  await expect(page.getByText("404")).toBeVisible();
});

test("P-60 to P-63: a receptionist cannot open settings", async ({ page }) => {
  await signIn(page, receptionist);
  for (const route of [
    "/settings/users",
    "/settings/trainers",
    "/settings/plans",
    "/settings/products",
    "/settings/gym",
  ]) {
    await page.goto(route);
    await expect(page.getByText("404"), route).toBeVisible();
  }
});

test("BR-004: the owner changes a plan price and the screen says it affects new sales", async ({
  page,
}) => {
  await signIn(page, owner);
  await page.goto("/settings/plans");

  await expect(
    page.getByText("Promjena cijene važi samo za nove prodaje."),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: "79,00 €" })).toBeVisible();

  await page
    .getByRole("row", { name: "E2E Mjesečna" })
    .getByRole("button", { name: "Uredi" })
    .click();
  await page.getByLabel("Cijena (€)").fill("85");
  await page.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Sačuvano.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "85,00 €" })).toBeVisible();
});

test("BR-140: the owner adds a product", async ({ page }) => {
  await signIn(page, owner);
  await page.goto("/settings/products");

  await page.getByRole("button", { name: "Dodaj proizvod" }).click();
  await page.getByLabel("Naziv").fill("E2E Izotonik");
  await page.getByLabel("Nabavna cijena (€)").fill("0,80");
  await page.getByLabel("Prodajna cijena (€)").fill("2,50");
  await page.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Sačuvano.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "E2E Izotonik" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "2,50 €" })).toBeVisible();
});

test("BR-012 and BR-131: the owner edits gym settings and a category", async ({
  page,
}) => {
  await signIn(page, owner);
  await page.goto("/settings/gym");

  await page.getByLabel("Minimalna cijena personalnog (€)").fill("85");
  await page
    .getByRole("button", { name: "Sačuvaj", exact: true })
    .first()
    .click();
  await expect(page.getByText("Sačuvano.")).toBeVisible();

  const { data } = await adminClient()
    .from("gym_settings")
    .select("personal_min_price")
    .eq("gym_id", gymId)
    .single<{ personal_min_price: string }>();
  expect(Number(data?.personal_min_price)).toBe(85);

  // BR-131: a new category can be added and later deactivated.
  await page.getByRole("button", { name: "Dodaj kategoriju" }).click();
  await page.getByLabel("Naziv").fill("E2E Kategorija");
  await page.getByRole("button", { name: "Sačuvaj" }).last().click();
  await expect(page.getByText("Sačuvano.")).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "E2E Kategorija" }),
  ).toBeVisible();
});

// SEC-07 and finding N-01: an oversized logo used to travel to the server, where Next
// refused the body before uploadLogo could answer, so the owner saw the general error
// screen with an HTTP 500 instead of the sentence under the field.
test("US-21.1: a logo over 1 MB is refused with the field message, not an error page", async ({
  page,
}) => {
  await signIn(page, owner);
  await page.goto("/settings/gym");

  // A real PNG header followed by filler, so only the size makes it invalid.
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(5 * 1024 * 1024, 0),
  ]);
  // A file chosen before hydration fires `change` before React has attached onChange,
  // which made this test fail about one run in three; choose again until it is seen.
  await expect(async () => {
    await page.locator("#logo").setInputFiles({
      name: "veliki-logo.png",
      mimeType: "image/png",
      buffer: png,
    });
    await expect(
      page.getByText("Dozvoljeni su PNG i JPG do 1 MB."),
    ).toBeVisible({ timeout: 1_000 });
  }).toPass();
  // The file input is also exposed as a button with the label's name, so the submit
  // button is addressed by its type.
  await expect(
    page.locator('form:has(#logo) button[type="submit"]'),
  ).toBeDisabled();
  // The general error screen never appears and the gym keeps no logo.
  await expect(
    page.getByText("Došlo je do greške. Pokušajte ponovo."),
  ).toHaveCount(0);
  const { data } = await adminClient()
    .from("gym_settings")
    .select("logo_path")
    .eq("gym_id", gymId)
    .single<{ logo_path: string | null }>();
  expect(data?.logo_path).toBeNull();
});
