import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// M-11 "done when" (doc 09): a handler call without the secret is 401, and S-27 shows the
// backup status line of BR-163.
//
// The handlers themselves are never called with a valid secret from a test: one server
// serves every gym, so a real run of the nightly or morning job would close the working
// gym's shift or consume its members' reminders. Their behaviour is proved in pgTAP
// (`supabase/tests/0011_jobs.test.sql`), inside a transaction that is rolled back.
test.describe.configure({ mode: "serial" });

const PASSWORD = "poslovi12345";

let gymId: string;
let owner: TestStaff;
let receptionist: TestStaff;

test.beforeAll(async ({}, workerInfo) => {
  gymId = await createTestGym(`${workerInfo.project.name}-jobs-${suffix()}`);
  owner = await createTestStaff(gymId, {
    role: "owner",
    fullName: "E2E Vlasnik poslova",
    password: PASSWORD,
  });
  receptionist = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Recepcioner poslova",
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

test("Doc 08 §8: a job handler without the shared secret answers 401", async ({
  request,
}) => {
  for (const job of ["nightly", "morning", "weekly-backup", "email-retry"]) {
    const missing = await request.post(`/api/jobs/${job}`, { data: {} });
    expect(missing.status(), `${job} without a secret`).toBe(401);

    const wrong = await request.post(`/api/jobs/${job}`, {
      headers: { "x-cron-secret": "nije-tajna" },
      data: {},
    });
    expect(wrong.status(), `${job} with a wrong secret`).toBe(401);
  }
});

test("Doc 08 §8: a browser visit never runs a job", async ({ request }) => {
  const response = await request.get("/api/jobs/nightly");
  expect(response.status()).toBe(401);
});

test("BR-163: S-27 shows when the last backup ran and how it went", async ({
  page,
}) => {
  const admin = adminClient();
  await signIn(page, owner);

  // Before the first Sunday there is nothing to show.
  await page.goto("/settings/gym");
  await expect(
    page.getByText("Posljednja rezervna kopija: Još nije napravljena"),
  ).toBeVisible();

  // A failed attempt shows its reason (AC5).
  const failed = await admin
    .from("backup_runs")
    .insert({
      gym_id: gymId,
      run_date: "2026-09-13",
      attempt: 1,
      status: "failed",
      error: "Storage nedostupan",
      finished_at: "2026-09-13T01:05:00+00:00",
    })
    .select("id")
    .single();
  expect(failed.error).toBeNull();

  await page.reload();
  await expect(
    page.getByText(/Posljednja rezervna kopija: 13\.09\.2026 .* neuspješno/),
  ).toBeVisible();
  await expect(page.getByText("Storage nedostupan")).toBeVisible();

  // The newest attempt is the one shown, whichever way it went.
  const succeeded = await admin.from("backup_runs").insert({
    gym_id: gymId,
    run_date: "2026-09-20",
    attempt: 1,
    status: "success",
    file_path: `${gymId}/kpfitness-backup-2026-09-20.zip`,
    size_bytes: 4096,
    emailed: true,
    finished_at: "2026-09-20T01:04:00+00:00",
  });
  expect(succeeded.error).toBeNull();

  await page.reload();
  await expect(
    page.getByText(/Posljednja rezervna kopija: 20\.09\.2026 .* uspješno/),
  ).toBeVisible();
});

test("BR-116: after the automatic close the receptionist's next request goes to the login page", async ({
  page,
}) => {
  const admin = adminClient();
  await signIn(page, receptionist);
  await expect(page).toHaveURL(/\/reception/);

  // What the nightly job does at 23:00, done here directly so the test does not depend
  // on the hour: the open visits are checked out and the shift is closed as automatic.
  const closed = await admin
    .from("shifts")
    .update({
      closed_at: new Date().toISOString(),
      close_type: "auto",
    })
    .eq("gym_id", gymId)
    .is("closed_at", null);
  expect(closed.error).toBeNull();

  await page.goto("/reception");
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByText("Smjena je automatski zaključena."),
  ).toBeVisible();
});
