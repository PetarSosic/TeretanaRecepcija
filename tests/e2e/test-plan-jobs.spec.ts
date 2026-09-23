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

// TEST_PLAN.md JOB-03, JOB-05 and E2E-07: the nightly, morning and weekly-backup jobs,
// really run, for one synthetic gym only (tests/integration/test-plan-job.test.ts).
//
// Opt-in: this spec sends real email through Resend, to Resend's own test inbox
// delivered@resend.dev and nowhere else, so it runs only with TEST_PLAN_LIVE_EMAIL=1.
// The rest of the suite keeps its rule that no email ever leaves a test run.
test.describe.configure({ mode: "serial" });

const PASSWORD = "posloviPlana123";
const ZONE = "Europe/Podgorica";
const INBOX = "delivered@resend.dev";
/** N-04: the verified sender; onboarding@resend.dev is refused for this inbox. */
const SENDER = "noreply@stamenkovicc.com";

let gymId: string;
let owner: TestStaff;
let ana: TestStaff;
let planId: string;
const member: Record<"prvi" | "drugi" | "podsjetnik", string> = {
  prvi: "",
  drugi: "",
  podsjetnik: "",
};
const card = { prvi: "", drugi: "" };

type JobRun = {
  report: { job: string; gyms: number; details: Record<string, unknown>[] };
  emails: {
    to: string[];
    subject: string;
    text: string;
    attachments: { filename: string; size: number }[];
    error: string | null;
    lastEvent: string | null;
    mentionsZipPassword: boolean;
  }[];
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
  const iso = date.toISOString().slice(0, 10);
  const [y, m, d] = iso.split("-");
  return { iso, display: `${d}.${m}.${y}` };
}

function gymClock(at = new Date()): { hhmm: string; seconds: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: ZONE,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map(({ type, value }) => [type, value]),
  );
  return { hhmm: `${parts.hour}:${parts.minute}`, seconds: Number(parts.second) };
}

function code(): string {
  return `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
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

/** One handler, for the test gym alone; what it reported and every email it sent. */
function runJob(job: "nightly" | "morning" | "weekly-backup"): JobRun {
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
        EMAIL_FROM: SENDER,
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
  gymId = await createTestGym(`${workerInfo.project.name}-poslovi-${suffix()}`);
  owner = await createTestStaff(gymId, {
    role: "owner",
    fullName: "E2E Vlasnik poslova",
    password: PASSWORD,
  });
  ana = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Ana poslova",
    password: PASSWORD,
  });
  const admin = adminClient();
  // Every email of this gym goes to Resend's test inbox, never to a person.
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
  planId = plan.id;
  await must(
    admin.from("plan_finance").insert({ plan_id: planId, gym_id: gymId }).select("plan_id"),
    "Test plan finance",
  );
  const created = await must(
    admin
      .from("members")
      .insert(
        [
          ["Prvi", "Noćni", `poslovi-1@e2e.invalid`],
          ["Drugi", "Noćni", `poslovi-2@e2e.invalid`],
          ["Podsjetnik", "Jutarnji", INBOX],
        ].map(([first, last, email], index) => ({
          gym_id: gymId,
          member_number: index + 1,
          first_name: `E2E ${first}`,
          last_name: last,
          phone: `+3826790300${index}`,
          email,
          date_of_birth: "1990-01-01",
          created_by: owner.id,
        })),
      )
      .select("id, member_number")
      .returns<{ id: string; member_number: number }[]>(),
    "Test members",
  );
  const byNumber = (n: number) => created.find((m) => m.member_number === n)!.id;
  member.prvi = byNumber(1);
  member.drugi = byNumber(2);
  member.podsjetnik = byNumber(3);
  await must(
    admin.from("member_counters").insert({ gym_id: gymId, last_number: 3 }).select("gym_id"),
    "Test member counter",
  );
  const membership = (memberId: string, start: number, end: number) => ({
    gym_id: gymId,
    member_id: memberId,
    plan_id: planId,
    start_date: gymDate(start).iso,
    end_date: gymDate(end).iso,
    start_reason: "E2E",
    covers_gym: true,
    covers_group: false,
    covers_personal: false,
    is_backdated: true,
    created_by: owner.id,
  });
  await must(
    admin
      .from("memberships")
      .insert([
        membership(member.prvi, -5, 25),
        membership(member.drugi, -5, 25),
        // JOB-03: ends in exactly expiry_reminder_days (3) days.
        membership(member.podsjetnik, -27, 3),
      ])
      .select("id"),
    "Test memberships",
  );
  const batch = await must(
    admin
      .from("card_batches")
      .insert({ gym_id: gymId, quantity: 2, created_by: owner.id })
      .select("id")
      .single<{ id: string }>(),
    "Test batch",
  );
  card.prvi = code();
  card.drugi = code();
  await must(
    admin
      .from("cards")
      .insert(
        [
          [card.prvi, member.prvi],
          [card.drugi, member.drugi],
        ].map(([value, memberId]) => ({
          gym_id: gymId,
          code: value,
          batch_id: batch.id,
          status: "active",
          member_id: memberId,
          assigned_at: new Date().toISOString(),
        })),
      )
      .select("id"),
    "Test cards",
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

async function scan(page: Page, value: string) {
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await page.keyboard.type(value);
  await page.keyboard.press("Enter");
}

let closeTime = "";

test("E2E-07 night: two members left in, the shift left open, the nightly job closes both", async ({
  page,
}) => {
  test.setTimeout(300_000);
  // 1. Two check-ins, and the receptionist leaves without closing.
  await signIn(page, ana);
  await page
    .getByRole("button", { name: "Počni rad" })
    .click({ timeout: 3_000 })
    .catch(() => {});
  for (const value of [card.prvi, card.drugi]) {
    await scan(page, value);
    await expect(page.locator("[data-result=covered]")).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await page.context().clearCookies();

  // 2. The close time moved to the current minute, after both check-ins.
  const { seconds } = gymClock();
  await page.waitForTimeout((62 - seconds) * 1_000);
  closeTime = gymClock().hhmm;
  await must(
    adminClient()
      .from("gym_settings")
      .update({ auto_close_time: `${closeTime}:00` })
      .eq("gym_id", gymId)
      .select("gym_id"),
    "Test close time",
  );
  const night = runJob("nightly");
  console.log(`[note] E2E-07 nightly: ${JSON.stringify(night.report)}`);
  console.log(
    `[note] E2E-07 report email: ${JSON.stringify(night.emails.map(({ text, ...rest }) => ({ ...rest, text: text.slice(0, 160) })))}`,
  );
  expect(night.report.gyms).toBe(1);
  expect(night.report.details[0]).toMatchObject({ ran: true, visits_closed: 2 });
  expect(night.emails).toHaveLength(1);
  expect(night.emails[0].to).toEqual([INBOX]);
  expect(night.emails[0].attachments[0].filename).toMatch(/\.pdf$/);
  expect(night.emails[0].lastEvent).toBe("delivered");

  const admin = adminClient();
  const { data: visits } = await admin
    .from("visits")
    .select("checked_out_at, auto_checkout")
    .eq("gym_id", gymId)
    .returns<{ checked_out_at: string; auto_checkout: boolean }[]>();
  for (const visit of visits ?? []) {
    expect(visit.auto_checkout).toBe(true);
    expect(gymClock(new Date(visit.checked_out_at)).hhmm).toBe(closeTime);
  }
  const { data: shift } = await admin
    .from("shifts")
    .select("close_type, counted_cash, email_status, closed_by")
    .eq("gym_id", gymId)
    .single();
  expect(shift).toEqual({
    close_type: "auto",
    counted_cash: null,
    email_status: "sent",
    closed_by: null,
  });

  // 3. What the owner sees.
  await signIn(page, owner);
  await page.goto("/finance/shifts");
  const row = page.getByRole("row", { name: /E2E Ana poslova/ });
  await expect(row).toContainText("Automatski");
  await expect(row).toContainText("nije prebrojano");
  await expect(row).toContainText("poslato");
  for (const id of [member.prvi, member.drugi]) {
    await page.goto(`/members/${id}?tab=dolasci`);
    await expect(page.locator("main tbody tr").first()).toBeVisible();
    const text = (await page.locator("main tbody").innerText()).replace(/\s+/g, " ");
    console.log(`[note] E2E-07 profile: ${text.slice(0, 200)}`);
    expect(text).toContain(closeTime);
  }
});

test("JOB-03 and E2E-07 morning: one reminder, and none the second time", async () => {
  test.setTimeout(300_000);
  const first = runJob("morning");
  console.log(`[note] JOB-03 first: ${JSON.stringify(first)}`);
  expect(first.report.details[0]).toMatchObject({ ran: true, sent: 1, failed: 0 });
  expect(first.emails).toHaveLength(1);
  const [email] = first.emails;
  expect(email.to).toEqual([INBOX]);
  expect(email.subject).toBe(`Vaša članarina ističe ${gymDate(3).display}`);
  const { data: gym } = await adminClient()
    .from("gyms")
    .select("name")
    .eq("id", gymId)
    .single<{ name: string }>();
  for (const text of ["E2E Podsjetnik", "E2E Mjesečna", gym!.name, gymDate(3).display])
    expect(email.text).toContain(text);
  expect(email.lastEvent).toBe("delivered");
  const { data } = await adminClient()
    .from("expiry_notifications")
    .select("status")
    .eq("gym_id", gymId)
    .returns<{ status: string }[]>();
  expect(data).toEqual([{ status: "sent" }]);

  const second = runJob("morning");
  console.log(`[note] JOB-03 second: ${JSON.stringify(second.report)}`);
  expect(second.report.details[0]).toMatchObject({ ran: false, sent: 0 });
  expect(second.emails).toHaveLength(0);
});

test("JOB-05 and E2E-07 backup: success, the ZIP by email without its password, S-27", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const backup = runJob("weekly-backup");
  console.log(
    `[note] JOB-05: ${JSON.stringify({ report: backup.report, emails: backup.emails.map(({ text, ...rest }) => ({ ...rest, text: text.slice(0, 200) })) })}`,
  );
  const detail = backup.report.details[0] as {
    status: string;
    tables: number;
    rows: number;
    emailed: boolean;
  };
  expect(detail.status).toBe("success");
  expect(detail.tables).toBeGreaterThan(20);
  expect(detail.rows).toBeGreaterThan(0);
  expect(detail.emailed).toBe(true);
  expect(backup.emails).toHaveLength(1);
  const [email] = backup.emails;
  expect(email.to).toEqual([INBOX]);
  expect(email.attachments).toHaveLength(1);
  expect(email.attachments[0].filename).toMatch(/\.zip$/);
  expect(email.mentionsZipPassword).toBe(false);
  expect(email.lastEvent).toBe("delivered");

  await signIn(page, owner);
  await page.goto("/settings/gym");
  await expect(
    page.getByText(/Posljednja rezervna kopija: .* – uspješno/),
  ).toBeVisible();
  const { data: files } = await adminClient().storage.from("backups").list(gymId);
  expect(files?.length).toBe(1);
});
