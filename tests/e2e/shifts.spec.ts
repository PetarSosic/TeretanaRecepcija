import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// M-05 "done when" (doc 09): login opens a shift, re-login resumes it, a second
// receptionist meets S-02 and the takeover works (E19, without the email until M-10).
test.describe.configure({ mode: "serial" });

const PASSWORD = "smjenalozinka1";

let gymId: string;
let ana: TestStaff;
let bojana: TestStaff;
let owner: TestStaff;

test.beforeAll(async ({}, workerInfo) => {
  gymId = await createTestGym(`${workerInfo.project.name}-shifts-${suffix()}`);
  ana = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Ana",
    password: PASSWORD,
  });
  bojana = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Bojana",
    password: PASSWORD,
  });
  owner = await createTestStaff(gymId, {
    role: "owner",
    fullName: "E2E Vlasnik smjene",
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

async function openShifts() {
  const { data } = await adminClient()
    .from("shifts")
    .select("id, staff_id, closed_at, close_type, counted_cash::text")
    .eq("gym_id", gymId)
    .returns<
      {
        id: string;
        staff_id: string;
        closed_at: string | null;
        close_type: string | null;
        counted_cash: string | null;
      }[]
    >();
  return data ?? [];
}

test("US-02.1: logging in opens a shift and the header shows it", async ({
  page,
}) => {
  await signIn(page, ana);
  await expect(page).toHaveURL(/\/reception/);

  // AC3: `Smjena: <ime> od <HH:mm>`.
  await expect(
    page.getByText(/^Smjena: E2E Ana od \d{2}:\d{2}$/),
  ).toBeVisible();

  // Doc 08 §9: the header must stay usable at 375 px, badge included.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  const shifts = await openShifts();
  expect(shifts).toHaveLength(1);
  expect(shifts[0].staff_id).toBe(ana.id);
  expect(shifts[0].closed_at).toBeNull();
});

test("US-02.1 AC2: logging in again resumes the same shift", async ({
  page,
}) => {
  await signIn(page, ana);
  await expect(page).toHaveURL(/\/reception/);

  const shifts = await openShifts();
  expect(shifts).toHaveLength(1);
});

test("US-02.2 and E19: the second receptionist meets S-02 and takes over", async ({
  page,
}) => {
  await signIn(page, bojana);

  // AC1: S-02, naming whose shift is open and since when.
  await expect(page).toHaveURL(/\/shift\/gate/);
  await expect(
    page.getByText(
      /^Otvorena je smjena: E2E Ana \(od \d{2}\.\d{2}\.\d{4} \d{2}:\d{2}\)\.$/,
    ),
  ).toBeVisible();

  // AS-10: the counted cash is optional, but it is stored when entered.
  await page
    .getByLabel("Prebrojana gotovina za prethodnu smjenu (€)")
    .fill("120,50");
  await page.getByRole("button", { name: "Preuzmi smjenu" }).click();
  await expect(page).toHaveURL(/\/reception/);

  // AC2: the other shift is closed as a takeover and mine is open — BR-110 still holds.
  const shifts = await openShifts();
  const open = shifts.filter((shift) => shift.closed_at === null);
  const closed = shifts.filter((shift) => shift.closed_at !== null);
  expect(open).toHaveLength(1);
  expect(open[0].staff_id).toBe(bojana.id);
  expect(closed).toHaveLength(1);
  expect(closed[0].staff_id).toBe(ana.id);
  expect(closed[0].close_type).toBe("takeover");
  expect(Number(closed[0].counted_cash)).toBe(120.5);

  await expect(
    page.getByText(/^Smjena: E2E Bojana od \d{2}:\d{2}$/),
  ).toBeVisible();
});

test("BR-113: a receptionist confirms before signing out of an open shift", async ({
  page,
}) => {
  await signIn(page, bojana);
  await page.getByRole("button", { name: "Nalog" }).click();
  await page.getByRole("menuitem", { name: "Odjava" }).click();

  await expect(
    page.getByText("Smjena ostaje otvorena. Odjaviti se?"),
  ).toBeVisible();

  // The shift is still open while the question is on screen.
  expect((await openShifts()).filter((s) => s.closed_at === null)).toHaveLength(
    1,
  );

  await page.getByRole("button", { name: "Odjavi se" }).click();
  await expect(page).toHaveURL(/\/login/);
  // BR-113: logging out leaves the shift open for the next receptionist.
  expect((await openShifts()).filter((s) => s.closed_at === null)).toHaveLength(
    1,
  );
});

test("BR-112: an owner login neither opens nor closes a shift", async ({
  page,
}) => {
  const before = await openShifts();
  await signIn(page, owner);
  await expect(page).toHaveURL(/\/finance/);
  // The badge shows the receptionist's shift, not one of the owner's own.
  await expect(
    page.getByText(/^Smjena: E2E Bojana od \d{2}:\d{2}$/),
  ).toBeVisible();
  expect(await openShifts()).toHaveLength(before.length);
});
