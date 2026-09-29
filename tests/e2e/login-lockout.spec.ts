import { expect, test, type Page } from "@playwright/test";
import {
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// D-75 (US-01.1 AC6, P-08): five failed sign-ins in a row lock a login for 15 minutes,
// even against the right password; the owner lifts the lock on S-23, the manager
// cannot, and both lock and unlock are in Dnevnik izmjena. One synthetic gym (D-56),
// desktop only, serial: the unlock needs the lock.
test.describe.configure({ mode: "serial" });

const PASSWORD = "zakljucana1lozinka";
const FAILED = "Pogrešno korisničko ime/email ili lozinka.";
const LOCKED =
  /^Previše neuspješnih pokušaja prijave\. Pokušajte ponovo za 1[45] min\.$/;

let gymId: string;
const staff = {} as Record<"owner" | "manager" | "desk", TestStaff>;

test.beforeAll(async ({}, workerInfo) => {
  test.skip(workerInfo.project.name !== "desktop");
  gymId = await createTestGym(`${workerInfo.project.name}-lockout-${suffix()}`);
  staff.owner = await createTestStaff(gymId, {
    role: "owner",
    fullName: "E2E Vlasnik zaključavanja",
    password: PASSWORD,
    mustChangePassword: false,
  });
  staff.manager = await createTestStaff(gymId, {
    role: "manager",
    fullName: "E2E Menadžer zaključavanja",
    password: PASSWORD,
    mustChangePassword: false,
  });
  staff.desk = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Zaključana Recepcija",
    password: PASSWORD,
    mustChangePassword: false,
  });
});

test.afterAll(async ({}, workerInfo) => {
  if (workerInfo.project.name === "desktop") await deleteTestGym(gymId);
});

async function attempt(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Korisničko ime ili email").fill(identifier);
  await page.getByLabel("Lozinka", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Prijavi se" }).click();
}

async function signedIn(page: Page, who: TestStaff) {
  await attempt(page, who.identifier, PASSWORD);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("AUTH-25: five wrong passwords lock the login, even against the right one", async ({
  page,
}) => {
  for (let round = 1; round <= 5; round++) {
    await attempt(page, staff.desk.identifier, `pogresna-${round}`);
    await expect(page.getByText(FAILED), `attempt ${round}`).toBeVisible();
  }
  await attempt(page, staff.desk.identifier, PASSWORD);
  await expect(page.getByText(LOCKED)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);

  // The same lock whatever the case of the username.
  await attempt(page, staff.desk.identifier.toUpperCase(), PASSWORD);
  await expect(page.getByText(LOCKED)).toBeVisible();
});

test("AUTH-26: the manager sees the lock; the owner lifts it; the log keeps both", async ({
  browser,
  page,
}) => {
  const manager = await browser.newPage();
  await signedIn(manager, staff.manager);
  await manager.goto("/settings/users");
  const managerRow = manager.getByRole("row", {
    name: /E2E Zaključana Recepcija/,
  });
  await expect(managerRow).toContainText(/Zaključan do \d\d:\d\d/);
  await expect(
    managerRow.getByRole("button", { name: "Otključaj" }),
  ).toHaveCount(0);
  await manager.close();

  const owner = await browser.newPage();
  await signedIn(owner, staff.owner);
  await owner.goto("/settings/users");
  const row = owner.getByRole("row", { name: /E2E Zaključana Recepcija/ });
  await row.getByRole("button", { name: "Otključaj" }).click();
  await expect(owner.getByText("Nalog je otključan.").first()).toBeVisible();
  await expect(row).not.toContainText("Zaključan do");

  // Unlocked, the right password works at once.
  await signedIn(page, staff.desk);

  // BR-096: Dnevnik izmjena has the lock (by nobody) and the unlock (by the owner).
  await owner.goto("/finance/audit");
  await expect(
    owner.getByText(/Prijava zaključana do: — → \d\d\.\d\d\.\d{4} \d\d:\d\d/),
  ).toBeVisible();
  await expect(
    owner.getByText(/Prijava zaključana do: \d\d\.\d\d\.\d{4} \d\d:\d\d → —/),
  ).toBeVisible();
  await owner.close();
});
