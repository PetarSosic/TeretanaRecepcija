import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// M-04 "done when" (doc 09): a batch of 100 gives 100 unique BR-030 codes, and the
// sheet downloads as a PDF. P-64 keeps receptionists out.
test.describe.configure({ mode: "serial" });

const PASSWORD = "karticelozinka1";

let gymId: string;
let owner: TestStaff;
let receptionist: TestStaff;

test.beforeAll(async ({}, workerInfo) => {
  gymId = await createTestGym(`${workerInfo.project.name}-cards-${suffix()}`);
  owner = await createTestStaff(gymId, {
    role: "owner",
    fullName: "E2E Vlasnik kartica",
    password: PASSWORD,
  });
  receptionist = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Recepcioner kartica",
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

test("US-03.1: the owner generates 100 cards and the batch is listed", async ({
  page,
}) => {
  await signIn(page, owner);
  await page.goto("/settings/cards");

  await expect(page.getByText("Nema generisanih serija.")).toBeVisible();
  await page.getByLabel("Broj kartica (1–100)").fill("100");
  await page.getByRole("button", { name: "Generiši" }).click();
  await expect(page.getByText("Kartice su generisane.")).toBeVisible();

  // AC3: quantity and how many are still unassigned.
  const row = page.getByRole("row").filter({ hasText: "100" }).first();
  await expect(row).toBeVisible();
  await expect(row.getByRole("link", { name: "Preuzmi PDF" })).toBeVisible();

  // AC1: BR-030 codes, all distinct.
  const { data } = await adminClient()
    .from("cards")
    .select("code, status, member_id")
    .eq("gym_id", gymId)
    .returns<{ code: string; status: string; member_id: string | null }[]>();
  expect(data).toHaveLength(100);
  expect(new Set(data?.map((card) => card.code)).size).toBe(100);
  for (const card of data ?? []) {
    expect(card.code).toMatch(/^[1-9][0-9]{9}$/);
    expect(card.status).toBe("unassigned");
    expect(card.member_id).toBeNull();
  }
});

test("US-03.1 AC2: the sheet downloads as a PDF", async ({ page }) => {
  await signIn(page, owner);
  await page.goto("/settings/cards");

  const { data: batch } = await adminClient()
    .from("card_batches")
    .select("id")
    .eq("gym_id", gymId)
    .single<{ id: string }>();

  const response = await page.request.get(`/api/pdf/cards/${batch?.id}`);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/pdf");
  const body = await response.body();
  expect(body.subarray(0, 5).toString()).toBe("%PDF-");
  // Ten cards a page means ten pages of QR images for a hundred cards.
  expect(body.length).toBeGreaterThan(10_000);
});

test("P-64: a receptionist reaches neither the screen nor the PDF", async ({
  page,
}) => {
  const { data: batch } = await adminClient()
    .from("card_batches")
    .select("id")
    .eq("gym_id", gymId)
    .single<{ id: string }>();

  await signIn(page, receptionist);
  await page.goto("/settings/cards");
  await expect(page.getByText("404")).toBeVisible();

  const response = await page.request.get(`/api/pdf/cards/${batch?.id}`);
  expect(response.status()).toBe(404);
});
