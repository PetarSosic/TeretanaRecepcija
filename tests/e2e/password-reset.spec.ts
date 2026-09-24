import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// US-01.2 and D-69: the reset link from the email opens S-01b without the forgotten
// password, in any browser. generateLink returns the same token hash the email template
// puts in the link, without sending anything.
test.describe.configure({ mode: "serial" });

const PASSWORD = "zaboravljena1";
const NEW_PASSWORD = "AdminNova123";

let gymId: string;
let admin: TestStaff;

test.beforeAll(async ({}, workerInfo) => {
  gymId = await createTestGym(`${workerInfo.project.name}-reset-${suffix()}`);
  admin = await createTestStaff(gymId, {
    role: "admin",
    fullName: "E2E Administrator reset",
    password: PASSWORD,
  });
});

test.afterAll(async () => {
  await deleteTestGym(gymId);
});

async function resetLink(email: string): Promise<string> {
  const { data, error } = await adminClient().auth.admin.generateLink({
    type: "recovery",
    email,
  });
  if (error) throw new Error(`Recovery link not generated: ${error.message}`);
  return `/auth/callback?token_hash=${data.properties.hashed_token}&type=recovery`;
}

async function signIn(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Korisničko ime ili email").fill(identifier);
  await page.getByLabel("Lozinka", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("D-69: the reset link opens S-01b without the current password and works once", async ({
  page,
  browser,
}) => {
  const link = await resetLink(admin.identifier);

  // A browser that never asked for the reset, as when the mail is opened on a phone.
  await page.goto(link);
  await expect(page).toHaveURL(/\/change-password\?reset=1$/);
  await expect(
    page.getByText(
      "Otvorili ste link za novu lozinku. Postavite novu lozinku da nastavite.",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Trenutna lozinka")).toHaveCount(0);

  // S-01b blocks every other screen until the password is saved (AS-18).
  await page.goto("/finance");
  await expect(page).toHaveURL(/\/change-password/);

  await page.getByLabel("Nova lozinka").fill(NEW_PASSWORD);
  await page.getByLabel("Ponovi lozinku").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Sačuvaj" }).click();
  await page.waitForURL(/\/finance/);

  // D-59: the admin-readable copy follows the reset.
  const { data: stored } = await adminClient()
    .from("staff_credentials")
    .select("password")
    .eq("staff_id", admin.id)
    .single<{ password: string }>();
  expect(stored?.password).toBe(NEW_PASSWORD);

  const fresh = await browser.newContext();
  const second = await fresh.newPage();
  // The link is single-use.
  await second.goto(link);
  await expect(second).toHaveURL(/\/login$/);
  // The new password signs in, and S-01b does not come back.
  await signIn(second, admin.identifier, NEW_PASSWORD);
  await expect(second).toHaveURL(/\/finance/);
  await fresh.close();
});

test("AUTH-15, AUTH-16: a bad token, a bad code or a foreign next ends on /login", async ({
  page,
}) => {
  for (const path of [
    "/auth/callback?token_hash=neispravan&type=recovery",
    "/auth/callback?code=neispravan",
    "/auth/callback",
    "/auth/callback?next=//example.com",
    "/auth/callback?next=https://example.com",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:\d+\/login$/);
  }
});

test("D-69: a deactivated account's reset link signs nobody in", async ({
  page,
}) => {
  const inactive = await createTestStaff(gymId, {
    role: "admin",
    fullName: "E2E Neaktivni admin",
    password: PASSWORD,
  });
  const service = adminClient();
  await service
    .from("staff")
    .update({ is_active: false })
    .eq("id", inactive.id);

  await page.goto(await resetLink(inactive.identifier));
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/finance");
  await expect(page).toHaveURL(/\/login$/);

  const { data } = await service
    .from("staff")
    .select("must_change_password")
    .eq("id", inactive.id)
    .single<{ must_change_password: boolean }>();
  expect(data?.must_change_password).toBe(false);
});
