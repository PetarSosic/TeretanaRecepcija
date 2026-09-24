import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// TEST_PLAN.md JOB-04 and JOB-07: the morning job with no sender, and the BR-118 retry of
// failed shift reports with its limit of five attempts — the real handlers, for one
// synthetic gym only (tests/integration/test-plan-job.test.ts).
//
// Opt-in like test-plan-jobs.spec.ts: the last step sends one real report through
// Resend, to Resend's own test inbox delivered@resend.dev and nowhere else, so this runs
// only with TEST_PLAN_LIVE_EMAIL=1. `npm run jobs:run` is never used: it would act on the
// working gym too (a morning run without a sender uses up its members' reminders).
test.describe.configure({ mode: "serial" });

const PASSWORD = "posloviSrednje123";
const ZONE = "Europe/Podgorica";
const INBOX = "delivered@resend.dev";
/** N-04: the verified sender. */
const SENDER = "noreply@stamenkovicc.com";

let gymId: string;
let owner: TestStaff;
let ana: TestStaff;

type JobRun = {
  report: { job: string; gyms: number; details: Record<string, unknown>[] };
  emails: { to: string[]; subject: string; error: string | null; lastEvent: string | null }[];
};

function gymDate(days: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map(({ type, value }) => [type, value]),
  );
  const date = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function must<T>(
  query: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  what: string,
): Promise<T> {
  const { data, error } = await query;
  if (error || data === null)
    throw new Error(`${what} not created: ${error?.message}`);
  return data;
}

/** One handler for the test gym alone; `env` overrides the sender or the key. */
function runJob(
  job: "morning" | "email-retry",
  env: Record<string, string>,
): JobRun {
  const out = join(mkdtempSync(join(tmpdir(), "kp-job-")), "run.json");
  const run = spawnSync(
    "npx",
    ["vitest", "run", "tests/integration/test-plan-job.test.ts"],
    {
      shell: true,
      encoding: "utf8",
      timeout: 240_000,
      env: {
        ...process.env,
        TEST_PLAN_JOB: job,
        TEST_PLAN_GYM: gymId,
        TEST_PLAN_OUT: out,
        ...env,
      },
    },
  );
  if (run.status !== 0)
    throw new Error(`${job} failed:\n${run.stdout}\n${run.stderr}`);
  return JSON.parse(readFileSync(out, "utf8")) as JobRun;
}

test.beforeAll(async ({}, workerInfo) => {
  test.skip(
    workerInfo.project.name !== "desktop" || process.env.TEST_PLAN_LIVE_EMAIL !== "1",
    "sends real email; set TEST_PLAN_LIVE_EMAIL=1",
  );
  gymId = await createTestGym(`${workerInfo.project.name}-poslovis-${suffix()}`);
  owner = await createTestStaff(gymId, {
    role: "owner",
    fullName: "E2E Vlasnik poslova S",
    password: PASSWORD,
  });
  ana = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Ana poslova S",
    password: PASSWORD,
  });
  const admin = adminClient();
  await must(
    admin
      .from("gym_settings")
      .update({ shift_report_emails: [INBOX], backup_emails: [INBOX] })
      .eq("gym_id", gymId)
      .select("gym_id"),
    "Test gym recipients",
  );
  const plan = await must(
    admin
      .from("plans")
      .insert({
        gym_id: gymId,
        name: "E2E Mjesečna",
        kind: "gym",
        price: 79,
        duration_value: 1,
        duration_unit: "month",
        covers_gym: true,
        covers_group: false,
        covers_personal: false,
        requires_trainer: false,
        sort_order: 1,
      })
      .select("id")
      .single<{ id: string }>(),
    "Test plan",
  );
  await must(
    admin.from("plan_finance").insert({ plan_id: plan.id, gym_id: gymId }).select("plan_id"),
    "Test plan finance",
  );
  const created = await must(
    admin
      .from("members")
      .insert({
        gym_id: gymId,
        member_number: 1,
        first_name: "E2E Podsjetnik",
        last_name: "Bez pošiljaoca",
        phone: "+38267903100",
        email: INBOX,
        date_of_birth: "1990-01-01",
        created_by: owner.id,
      })
      .select("id")
      .single<{ id: string }>(),
    "Test member",
  );
  await must(
    admin.from("member_counters").insert({ gym_id: gymId, last_number: 1 }).select("gym_id"),
    "Test member counter",
  );
  // JOB-04: ends in exactly expiry_reminder_days (3) days.
  await must(
    admin
      .from("memberships")
      .insert({
        gym_id: gymId,
        member_id: created.id,
        plan_id: plan.id,
        start_date: gymDate(-27),
        end_date: gymDate(3),
        start_reason: "E2E",
        covers_gym: true,
        covers_group: false,
        covers_personal: false,
        is_backdated: true,
        created_by: owner.id,
      })
      .select("id"),
    "Test membership",
  );
});

test.afterAll(async ({}, workerInfo) => {
  if (workerInfo.project.name === "desktop" && gymId) await deleteTestGym(gymId);
});

async function signIn(page: Page, who: TestStaff) {
  await page.goto("/login");
  await page.getByLabel("Korisničko ime ili email").fill(who.identifier);
  await page.getByLabel("Lozinka", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** A receptionist's shift, opened by signing in and closed on S-14 (CLOSE-06). */
async function shiftWithFailedReport(page: Page): Promise<string> {
  await signIn(page, ana);
  await page.goto("/shift/close");
  await page.getByLabel("Prebrojana gotovina (€)").fill("0");
  await page.getByRole("button", { name: "Zaključi smjenu i odjavi me" }).click();
  await page.getByRole("button", { name: "Zaključi", exact: true }).click();
  await expect(page.getByText("Smjena je zaključena.")).toBeVisible({ timeout: 30_000 });
  // The test server's Resend key is refused (playwright.config.ts), so it failed.
  const { data } = await adminClient()
    .from("shifts")
    .select("id, email_status, email_attempts")
    .eq("gym_id", gymId)
    .order("started_at", { ascending: false })
    .limit(1)
    .single<{ id: string; email_status: string; email_attempts: number }>();
  expect(data).toMatchObject({ email_status: "failed", email_attempts: 1 });
  return data!.id;
}

/** BR-118 waits fifteen minutes between attempts; move the last one back instead. */
async function lastAttemptLongAgo(shiftId: string) {
  await must(
    adminClient()
      .from("shifts")
      .update({ emailed_at: new Date(Date.now() - 16 * 60_000).toISOString() })
      .eq("id", shiftId)
      .select("id"),
    "Back-dated attempt",
  );
}

async function attempts(shiftId: string) {
  const { data } = await adminClient()
    .from("shifts")
    .select("email_status, email_attempts")
    .eq("id", shiftId)
    .single<{ email_status: string; email_attempts: number }>();
  return data!;
}

test("JOB-04: the morning job with no sender skips the email, without an error", async () => {
  test.setTimeout(240_000);
  const run = runJob("morning", { EMAIL_FROM: "" });
  // `npm run jobs:run` prints exactly this report (scripts/run-job.mjs).
  console.log(`[note] JOB-04 report: ${JSON.stringify(run.report)}`);
  expect(run.report.details[0]).toMatchObject({ ran: true, sent: 0, failed: 0, skipped: 1 });
  expect(run.emails).toHaveLength(0);
  const { data } = await adminClient()
    .from("expiry_notifications")
    .select("status")
    .eq("gym_id", gymId)
    .returns<{ status: string }[]>();
  console.log(`[note] JOB-04 expiry_notifications: ${JSON.stringify(data)}`);
  expect(data).toEqual([{ status: "not_sent" }]);
});

test("JOB-07: failed reports are retried after 15 minutes, five attempts at most, then sent", async ({
  page,
}) => {
  test.setTimeout(600_000);
  const first = await shiftWithFailedReport(page);

  // Too soon: the last attempt is not fifteen minutes old.
  const early = runJob("email-retry", { EMAIL_FROM: SENDER, RESEND_API_KEY: "re_e2e_invalid_key" });
  console.log(`[note] JOB-07 right after the close: ${JSON.stringify(early.report.details)}`);
  expect(early.report.details).toEqual([]);

  // Attempts 2 to 5 fail with a refused key; the sixth is never made.
  for (let attempt = 2; attempt <= 6; attempt++) {
    await lastAttemptLongAgo(first);
    const run = runJob("email-retry", { EMAIL_FROM: SENDER, RESEND_API_KEY: "re_e2e_invalid_key" });
    const state = await attempts(first);
    console.log(`[note] JOB-07 run ${attempt}: ${JSON.stringify(run.report.details)} → ${JSON.stringify(state)}`);
    if (attempt <= 5) {
      expect(run.report.details).toEqual([{ shift: first, outcome: "failed" }]);
      expect(state).toEqual({ email_status: "failed", email_attempts: attempt });
    } else {
      expect(run.report.details).toEqual([]);
      expect(state).toEqual({ email_status: "failed", email_attempts: 5 });
    }
  }

  // A second failed report, and a key that works: only that one is sent.
  await page.context().clearCookies();
  const second = await shiftWithFailedReport(page);
  await lastAttemptLongAgo(second);
  const sent = runJob("email-retry", { EMAIL_FROM: SENDER });
  console.log(
    `[note] JOB-07 with the right key: ${JSON.stringify(sent.report.details)}; emails ${JSON.stringify(sent.emails)}`,
  );
  expect(sent.report.details).toEqual([{ shift: second, outcome: "sent" }]);
  expect(sent.emails).toHaveLength(1);
  expect(sent.emails[0].to).toEqual([INBOX]);
  expect(sent.emails[0].lastEvent).toBe("delivered");
  expect(await attempts(second)).toEqual({ email_status: "sent", email_attempts: 2 });

  await page.context().clearCookies();
  await signIn(page, owner);
  await page.goto("/finance/shifts");
  const rows = page.getByRole("row", { name: /E2E Ana poslova S/ });
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "poslato" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "neuspješno" })).toHaveCount(1);
});
