import { expect, test, type Page, type Request } from "@playwright/test";
import {
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// D-85: the reception panel reloads every 5 minutes, only while the screen is visible.
// D-86: no link prefetches a page.
test.describe.configure({ mode: "serial" });

const PASSWORD = "resursilozinka12";

let gymId: string;
let receptionist: TestStaff;
let owner: TestStaff;

test.beforeAll(async ({}, workerInfo) => {
  test.skip(workerInfo.project.name !== "desktop");
  gymId = await createTestGym(
    `${workerInfo.project.name}-resources-${suffix()}`,
  );
  receptionist = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Recepcija resursi",
    password: PASSWORD,
  });
  owner = await createTestStaff(gymId, {
    role: "owner",
    fullName: "E2E Vlasnik resursi",
    password: PASSWORD,
  });
});

test.afterAll(async () => {
  if (gymId) await deleteTestGym(gymId);
});

async function signIn(page: Page, staff: TestStaff, landing: RegExp) {
  await page.goto("/login");
  await page.getByLabel("Korisničko ime ili email").fill(staff.identifier);
  await page.getByLabel("Lozinka", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await page.waitForURL(landing);
}

/** Switches what `document.visibilityState` says, as a tab change or a minimise would. */
async function setVisibility(page: Page, state: "visible" | "hidden") {
  await page.evaluate((next) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => next,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

test("D-85: the panel reloads every 5 minutes, never while hidden, at once on return", async ({
  page,
}) => {
  await page.clock.install();
  await signIn(page, receptionist, /\/reception/);
  await page.getByRole("button", { name: "Počni rad" }).click();
  await expect(
    page.getByRole("heading", { name: "Skenirajte karticu" }),
  ).toBeVisible();

  // Every panel reload is a server action: a POST that names its action.
  const reloads: Request[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"])
      reloads.push(request);
  });
  const settled = async (count: number) =>
    expect.poll(() => reloads.length, { timeout: 10_000 }).toBe(count);

  await page.clock.runFor("04:50");
  await settled(0);
  await page.clock.runFor("00:20");
  await settled(1);

  await setVisibility(page, "hidden");
  await page.clock.runFor("30:00");
  await settled(1);

  await setVisibility(page, "visible");
  await settled(2);
  await page.clock.runFor("04:50");
  await settled(2);
  await page.clock.runFor("00:20");
  await settled(3);
});

test("D-86: pages with many links fetch none of them ahead of a click", async ({
  page,
}) => {
  // Next.js prefetches only in a production build; `npm run dev` never does, so the
  // check means something only there (E2E_PRODUCTION=1, see playwright.config.ts).
  test.skip(
    !process.env.E2E_PRODUCTION,
    "Prefetching happens only in a production build.",
  );

  // Any client fetch of a page's server components (a prefetch or a navigation) carries
  // the RSC header, whatever else Next.js adds to a prefetch.
  const fetches: string[] = [];
  page.on("request", (request) => {
    const headers = request.headers();
    if (headers["rsc"] || headers["next-router-prefetch"])
      fetches.push(request.url());
  });

  await signIn(page, owner, /\/finance/);
  await page.waitForLoadState("networkidle");
  const menuLink = page
    .getByRole("navigation")
    .getByRole("link", { name: "Članovi" })
    .first();
  await menuLink.hover();
  await page.waitForLoadState("networkidle");
  expect(fetches, "nothing is fetched before a click").toEqual([]);

  // The click fetches its page, which also proves the requests above would be seen.
  await menuLink.click();
  await page.waitForURL(/\/members/);
  expect(fetches.length).toBeGreaterThan(0);
});
