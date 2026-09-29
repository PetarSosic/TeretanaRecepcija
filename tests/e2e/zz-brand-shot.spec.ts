import { test } from "@playwright/test";
import {
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// Temporary: screenshots of the KP mark on S-01 and in the header (D-73).
const SHOTS =
  "C:/Users/Mihajlo/AppData/Local/Temp/claude/C--Users-Mihajlo-Desktop-Projekti-TeretanaRecepcija/3702e9a2-ddd4-485e-8b2b-05dbef20bcce/scratchpad";
const PASSWORD = "brendlozinka1";
let gymId: string;
let owner: TestStaff;

test.beforeAll(async ({}, workerInfo) => {
  gymId = await createTestGym(`${workerInfo.project.name}-brand-${suffix()}`);
  owner = await createTestStaff(gymId, {
    role: "owner",
    fullName: "E2E Vlasnik brend",
    password: PASSWORD,
  });
});

test.afterAll(async () => {
  await deleteTestGym(gymId);
});

test("brand shots", async ({ page }, workerInfo) => {
  const name = workerInfo.project.name;
  await page.goto("/login");
  await page.screenshot({ path: `${SHOTS}/login-${name}.png` });
  await page.getByLabel("Korisničko ime ili email").fill(owner.identifier);
  await page.getByLabel("Lozinka", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await page.locator("header").screenshot({ path: `${SHOTS}/header-${name}.png` });
  await page.goto("/icon.svg");
  await page.screenshot({ path: `${SHOTS}/icon-${name}.png` });
});
