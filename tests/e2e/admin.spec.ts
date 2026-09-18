import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// M-02b "done when" (doc 09): the admin role (D-58), username logins (D-57), stored
// passwords (D-59) and the deactivation guard (D-60).
test.describe.configure({ mode: "serial" });

const PASSWORD = "administrator1";

let gymId: string;
let admin: TestStaff;
let owner: TestStaff;

test.beforeAll(async ({}, workerInfo) => {
  gymId = await createTestGym(`${workerInfo.project.name}-admin-${suffix()}`);
  admin = await createTestStaff(gymId, {
    role: "admin",
    fullName: "E2E Administrator",
    password: PASSWORD,
  });
  owner = await createTestStaff(gymId, {
    role: "owner",
    fullName: "E2E Vlasnik jedan",
    password: PASSWORD,
    storePassword: "tajna-vlasnika",
  });
});

test.afterAll(async () => {
  await deleteTestGym(gymId);
});

async function signIn(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Korisničko ime ili email").fill(identifier);
  await page.getByLabel("Lozinka", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("D-57: an owner signs in with a username and lands on Finansije", async ({
  page,
}) => {
  expect(owner.identifier).not.toContain("@");
  await signIn(page, owner.identifier, PASSWORD);
  await expect(page).toHaveURL(/\/finance/);
});

test("D-59: the admin reads stored passwords, other roles never see them", async ({
  page,
}) => {
  await signIn(page, admin.identifier, PASSWORD);
  await page.goto("/settings/users");

  const ownerRow = page.getByRole("row", { name: owner.fullName });
  await expect(ownerRow.getByText("••••••••")).toBeVisible();
  await expect(page.getByText("tajna-vlasnika")).toHaveCount(0);
  await ownerRow.getByRole("button", { name: "Prikaži" }).click();
  await expect(ownerRow.getByText("tajna-vlasnika")).toBeVisible();

  // The owner's own screen has no password column at all (D-59).
  const second = await page.context().browser()!.newContext();
  const ownerPage = await second.newPage();
  await signIn(ownerPage, owner.identifier, PASSWORD);
  await ownerPage.goto("/settings/users");
  await expect(
    ownerPage.getByRole("columnheader", { name: "Lozinka" }),
  ).toHaveCount(0);
  await expect(ownerPage.getByText("tajna-vlasnika")).toHaveCount(0);
  await second.close();
});

test("D-58: only the admin creates owners, and the new owner uses a username", async ({
  page,
}) => {
  await signIn(page, admin.identifier, PASSWORD);
  await page.goto("/settings/users");
  await page.getByRole("button", { name: "Novi korisnik" }).click();

  const roles = await page
    .getByLabel("Uloga")
    .locator("option")
    .allInnerTexts();
  expect(roles).toContain("Vlasnik");
  expect(roles).toContain("Administrator");

  const username = `e2e.${suffix()}`;
  await page.getByLabel("Uloga").selectOption("owner");
  // D-57: an owner is asked for a username, not an email.
  await expect(page.getByLabel("Korisničko ime")).toBeVisible();
  await page.getByLabel("Ime i prezime").fill("E2E Vlasnik dva");
  await page.getByLabel("Korisničko ime").fill(username);
  await page.getByLabel("Privremena lozinka").fill(PASSWORD);
  await page.getByRole("button", { name: "Sačuvaj" }).click();
  await expect(page.getByText("Korisnik je kreiran.")).toBeVisible();

  // D-59: the password the admin set is readable right away.
  const newRow = page.getByRole("row", { name: "E2E Vlasnik dva" });
  await newRow.getByRole("button", { name: "Prikaži" }).click();
  await expect(newRow.getByText(PASSWORD)).toBeVisible();
});

test("D-60: nobody may deactivate their own account", async ({ page }) => {
  await signIn(page, admin.identifier, PASSWORD);
  await page.goto("/settings/users");

  const ownRow = page.getByRole("row", { name: admin.fullName });
  await expect(ownRow.getByRole("button", { name: "Deaktiviraj" })).toHaveCount(
    0,
  );
  // Other rows still offer it.
  const ownerRow = page.getByRole("row", { name: owner.fullName });
  await expect(
    ownerRow.getByRole("button", { name: "Deaktiviraj" }),
  ).toBeVisible();
});

test("D-60: the last active owner cannot be deactivated", async ({ page }) => {
  // Leave exactly one active owner in the gym.
  const client = adminClient();
  await client
    .from("staff")
    .update({ is_active: false })
    .eq("gym_id", gymId)
    .eq("role", "owner")
    .neq("id", owner.id);

  await signIn(page, admin.identifier, PASSWORD);
  await page.goto("/settings/users");
  const ownerRow = page.getByRole("row", { name: owner.fullName });
  await ownerRow.getByRole("button", { name: "Deaktiviraj" }).click();

  await expect(
    page.getByText(
      "Mora ostati bar jedan aktivan nalog ove uloge. Prvo dodajte zamjenu.",
    ),
  ).toBeVisible();

  const { data } = await client
    .from("staff")
    .select("is_active")
    .eq("id", owner.id)
    .single<{ is_active: boolean }>();
  expect(data?.is_active).toBe(true);
});
