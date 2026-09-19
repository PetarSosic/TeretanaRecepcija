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

// Doc 08 §10 flow 11 and F-27: the offline banner appears, every money button goes dead
// while it is up, and both come back when the connection does.
test.describe.configure({ mode: "serial" });

const PASSWORD = "offline12345";
const BANNER =
  "Nema internet konekcije. Podaci se ne mogu sačuvati – vodite evidenciju na papiru i predajte je vlasniku.";

let gymId: string;
let receptionist: TestStaff;

test.beforeAll(async ({}, workerInfo) => {
  gymId = await createTestGym(`${workerInfo.project.name}-offline-${suffix()}`);
  receptionist = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Recepcioner bez mreže",
    password: PASSWORD,
  });
  const catalog = await createTestCatalog(gymId);
  // BR-142: the sale button is dead without stock, so the bar gets some first.
  const stock = await adminClient().from("stock_movements").insert({
    gym_id: gymId,
    product_id: catalog.productId,
    type: "in",
    quantity: 24,
    unit_cost: "0.30",
    paid_from_till: false,
    created_by: receptionist.id,
  });
  if (stock.error)
    throw new Error(`Test stock not created: ${stock.error.message}`);
});

test.afterAll(async () => {
  await deleteTestGym(gymId);
});

async function signIn(page: Page, staff: TestStaff) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Korisničko ime ili email").fill(staff.identifier);
  await page.getByLabel("Lozinka", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("Flow 11 and F-27: the banner appears offline and the save buttons go dead", async ({
  page,
  context,
}) => {
  await signIn(page, receptionist);
  await page.goto("/storage");

  // The bar sale is a money button, so it is live while the gym has an open shift.
  const sell = page.getByRole("button", { name: /Prodaja/ }).first();
  await expect(sell).toBeEnabled();
  await expect(page.getByText(BANNER)).toBeHidden();

  // F-27 AC1: the browser reporting itself offline is enough.
  await context.setOffline(true);
  await expect(
    page.getByRole("alert").filter({ hasText: BANNER }),
  ).toBeVisible();

  // F-27 AC2: nothing that writes money can be pressed while the banner is up.
  await expect(sell).toBeDisabled();

  // F-27 AC3: the banner goes within five seconds of the connection returning.
  await context.setOffline(false);
  await expect(page.getByText(BANNER)).toBeHidden({ timeout: 5000 });
  await expect(sell).toBeEnabled();
});
