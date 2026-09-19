import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// M-02 "done when" (doc 09). Each worker gets its own synthetic gym, so the desktop and
// mobile projects never collide and the real gym data is untouched.
test.describe.configure({ mode: "serial" });

const TEMPORARY = "privremena123";
const CHOSEN = "izabrana456";

let gymId: string;
let owner: TestStaff;

test.beforeAll(async ({}, workerInfo) => {
  gymId = await createTestGym(`${workerInfo.project.name}-${suffix()}`);
  owner = await createTestStaff(gymId, {
    role: "owner",
    fullName: "E2E Vlasnik",
    password: TEMPORARY,
    mustChangePassword: true,
  });
});

test.afterAll(async () => {
  await deleteTestGym(gymId);
});

async function signIn(
  page: Page,
  identifier: string,
  password: string,
  { expectSuccess = true } = {},
) {
  await page.goto("/login");
  await page.getByLabel("Korisničko ime ili email").fill(identifier);
  await page.getByLabel("Lozinka", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  // A successful sign-in redirects; waiting for it means the session cookie is set
  // before the test navigates anywhere else.
  if (expectSuccess)
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function setNewPassword(page: Page, password: string) {
  await page.getByLabel("Nova lozinka", { exact: true }).fill(password);
  await page.getByLabel("Ponovi lozinku").fill(password);
  await page.getByRole("button", { name: "Sačuvaj" }).click();
}

test("US-01.1 AC3: wrong credentials give one neutral message", async ({
  page,
}) => {
  await signIn(page, owner.identifier, "pogresna-lozinka", {
    expectSuccess: false,
  });
  await expect(
    page.getByText("Pogrešno korisničko ime/email ili lozinka."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("AS-18: the owner logs in and must set a new password first", async ({
  page,
}) => {
  await signIn(page, owner.identifier, TEMPORARY);
  await expect(page).toHaveURL(/\/change-password/);

  // S-01b blocks every other route until the password is saved.
  await page.goto("/settings/users");
  await expect(page).toHaveURL(/\/change-password/);

  await setNewPassword(page, CHOSEN);
  // Doc 06 §2: an owner lands on Finansije.
  await expect(page).toHaveURL(/\/finance/);
  owner.password = CHOSEN;
});

test("US-01.3: the owner creates a manager and a receptionist", async ({
  page,
}) => {
  await signIn(page, owner.identifier, owner.password);
  await page.goto("/settings/users");

  // D-57: a manager signs in with a username, like every role but the admin.
  const managerName = `e2e.${suffix()}`;
  await page.getByRole("button", { name: "Novi korisnik" }).click();
  await page.getByLabel("Uloga").selectOption("manager");
  await page.getByLabel("Ime i prezime").fill("E2E Menadžer");
  await page.getByLabel("Korisničko ime").fill(managerName);
  await page.getByLabel("Privremena lozinka").fill(TEMPORARY);
  await page.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Korisnik je kreiran.")).toBeVisible();

  const receptionistName = `e2e.${suffix()}`;
  await page.getByRole("button", { name: "Novi korisnik" }).click();
  await page.getByLabel("Uloga").selectOption("receptionist");
  await page.getByLabel("Ime i prezime").fill("E2E Recepcioner");
  await page.getByLabel("Korisničko ime").fill(receptionistName);
  await page.getByLabel("Privremena lozinka").fill(TEMPORARY);
  await page.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Korisnik je kreiran.")).toBeVisible();

  await expect(
    page.getByRole("cell", { name: managerName, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: receptionistName, exact: true }),
  ).toBeVisible();

  // US-01.1: a receptionist signs in with the username, not an email.
  const receptionist = page.context();
  const second = await receptionist.browser()!.newContext();
  const receptionistPage = await second.newPage();
  await signIn(receptionistPage, receptionistName, TEMPORARY);
  await expect(receptionistPage).toHaveURL(/\/change-password/);
  await setNewPassword(receptionistPage, CHOSEN);
  // Doc 06 §2: a receptionist lands on Recepcija. The password change and the S-03
  // render (panel and sale catalogue, M-07) share one response, so allow for a slow run.
  await expect(receptionistPage).toHaveURL(/\/reception/, { timeout: 15_000 });
  await second.close();
});

test("AS-5 and P-03: a manager cannot create an owner", async ({ page }) => {
  const manager = await createTestStaff(gymId, {
    role: "manager",
    fullName: "E2E Menadžer dva",
    password: CHOSEN,
  });

  await signIn(page, manager.identifier, manager.password);
  await page.goto("/settings/users");
  await page.getByRole("button", { name: "Novi korisnik" }).click();

  // P-03: the owner role is not offered, and the owner's row carries no actions.
  const roles = await page
    .getByLabel("Uloga")
    .locator("option")
    .allInnerTexts();
  expect(roles).not.toContain("Vlasnik");

  await page.keyboard.press("Escape");
  const ownerRow = page.getByRole("row", { name: owner.fullName });
  await expect(ownerRow.getByRole("button", { name: "Uredi" })).toHaveCount(0);

  // P-51: finance stays owner-only.
  await page.goto("/finance");
  await expect(page.getByText("404")).toBeVisible();
});

test("US-01.3 AC5: a deactivated user is signed out on the next request", async ({
  page,
}) => {
  const doomed = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Deaktivirani",
    password: CHOSEN,
  });

  await signIn(page, doomed.identifier, doomed.password);
  // BR-111: the receptionist of the earlier test still holds this gym's open shift, so
  // this one meets the S-02 gate rather than the reception screen. Either is a signed-in
  // session, which is all this test needs before the account is deactivated.
  await expect(page).toHaveURL(/\/reception|\/shift\/gate/);

  const admin = adminClient();
  await admin.from("staff").update({ is_active: false }).eq("id", doomed.id);
  await admin.auth.admin.updateUserById(doomed.userId, {
    ban_duration: "876000h",
  });

  await page.goto("/reception");
  await expect(page).toHaveURL(/\/login/);
});
