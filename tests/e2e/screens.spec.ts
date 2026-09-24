import { expect, test, type Page } from "@playwright/test";
import {
  createTestCatalog,
  createTestGym,
  createTestStaff,
  deleteTestGym,
  suffix,
  type TestStaff,
} from "./fixtures";

// M-13 (doc 08 §9 and D-47): every screen is opened at the project's viewport, checked
// for horizontal overflow, for a page error, for a form control without an accessible
// name, and for a heading — and a screenshot is attached to the report. The desktop
// project runs at 1366×768 and the mobile one at 375 px, so one run covers both sizes.
test.describe.configure({ mode: "serial" });

const PASSWORD = "ekrani12345";

let gymId: string;
let owner: TestStaff;
let manager: TestStaff;
let receptionist: TestStaff;

/** Doc 06: every screen of the application, by the role that may open it. */
const SCREENS = [
  { path: "/reception", name: "S-03 Recepcija", role: "receptionist" },
  {
    path: "/members",
    name: "S-06 Članovi",
    role: "receptionist",
    empty:
      "Još nema članova. Skenirajte praznu karticu na recepciji da dodate prvog.",
  },
  {
    path: "/payments/today",
    name: "S-12 Uplate danas",
    role: "receptionist",
    empty: "Danas još nema uplata.",
  },
  { path: "/storage", name: "S-13 Magacin", role: "receptionist" },
  { path: "/shift/close", name: "S-14 Zaključi smjenu", role: "receptionist" },
  {
    path: "/stats/visits",
    name: "S-15 Statistika",
    role: "manager",
    empty: "Nema dolazaka u izabranom periodu.",
  },
  { path: "/settings/users", name: "S-23 Korisnici", role: "manager" },
  { path: "/settings/trainers", name: "S-24 Treneri", role: "manager" },
  { path: "/settings/cards", name: "S-28 Kartice", role: "manager" },
  { path: "/finance", name: "S-16 Finansije", role: "owner" },
  { path: "/finance/expenses", name: "S-17 Troškovi", role: "owner" },
  { path: "/finance/trainers", name: "S-18 Treneri", role: "owner" },
  { path: "/finance/shifts", name: "S-19 Smjene", role: "owner" },
  { path: "/finance/storage", name: "S-20 Magacin", role: "owner" },
  { path: "/finance/audit", name: "S-21 Dnevnik", role: "owner" },
  { path: "/finance/backdated", name: "S-22 Naknadni unos", role: "owner" },
  { path: "/settings/plans", name: "S-25 Planovi", role: "owner" },
  { path: "/settings/products", name: "S-26 Proizvodi", role: "owner" },
  { path: "/settings/gym", name: "S-27 Podešavanja", role: "owner" },
] as const;

test.beforeAll(async ({}, workerInfo) => {
  gymId = await createTestGym(`${workerInfo.project.name}-ekrani-${suffix()}`);
  owner = await createTestStaff(gymId, {
    role: "owner",
    fullName: "E2E Vlasnik ekrana",
    password: PASSWORD,
  });
  manager = await createTestStaff(gymId, {
    role: "manager",
    fullName: "E2E Menadžer ekrana",
    password: PASSWORD,
  });
  receptionist = await createTestStaff(gymId, {
    role: "receptionist",
    fullName: "E2E Recepcioner ekrana",
    password: PASSWORD,
  });
  await createTestCatalog(gymId);
});

test.afterAll(async () => {
  await deleteTestGym(gymId);
});

async function signIn(page: Page, staff: TestStaff) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Korisničko ime ili email").fill(staff.identifier);
  await page.getByLabel("Lozinka", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/**
 * D-47: every control a person can operate carries a name a screen reader can read.
 * Hidden inputs and controls Radix marks aria-hidden are not operable, so they are out.
 */
async function unnamedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const controls = document.querySelectorAll<HTMLElement>(
      "input:not([type=hidden]), select, textarea, button, a[href]",
    );
    for (const control of controls) {
      if (control.closest("[aria-hidden=true]")) continue;
      if (control.hasAttribute("aria-hidden")) continue;
      const labelled =
        control.getAttribute("aria-label") ??
        (control.getAttribute("aria-labelledby")
          ? document.getElementById(
              control.getAttribute("aria-labelledby")!.split(" ")[0],
            )?.textContent
          : null) ??
        (control.id
          ? document.querySelector(`label[for="${CSS.escape(control.id)}"]`)
              ?.textContent
          : null) ??
        control.closest("label")?.textContent ??
        control.textContent ??
        (control as HTMLInputElement).title;
      if (!labelled || !labelled.trim())
        problems.push(
          `${control.tagName.toLowerCase()}${control.id ? `#${control.id}` : ""}${
            (control as HTMLInputElement).name
              ? `[name=${(control as HTMLInputElement).name}]`
              : ""
          }`,
        );
    }
    return problems;
  });
}

for (const screen of SCREENS) {
  test(`${screen.name} at this viewport: no overflow, named controls, no page error`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    const staff =
      screen.role === "owner"
        ? owner
        : screen.role === "manager"
          ? manager
          : receptionist;
    await signIn(page, staff);
    await page.goto(screen.path);
    await expect(page).toHaveURL(new RegExp(screen.path.replace("/", "\\/")));

    // Doc 08 §9: usable from 375 px up, with tables scrolling inside their own container.
    // N-24: /finance only grew past 375 px after hydration, which a check straight after
    // the load event never saw; measure once the page has settled.
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
      `${screen.name} scrolls sideways`,
    ).toBe(true);

    // Doc 06 §1: every screen names itself.
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

    // Doc 06: the gym is new, so the screens that document an empty text show it.
    if ("empty" in screen && screen.empty)
      await expect(page.getByText(screen.empty)).toBeVisible();

    expect(
      await unnamedControls(page),
      `${screen.name} unnamed controls`,
    ).toEqual([]);
    expect(errors, `${screen.name} page errors`).toEqual([]);

    await page.screenshot({
      path: testInfo.outputPath(`${screen.name.replace(/[^\w.-]+/g, "-")}.png`),
      fullPage: true,
    });
  });
}

test("D-47: the whole reception screen is reachable with the keyboard", async ({
  page,
}) => {
  await signIn(page, receptionist);
  await page.goto("/reception");

  // Tabbing from the top reaches a control, and the focus is always visible.
  const reached: string[] = [];
  for (let step = 0; step < 12; step += 1) {
    await page.keyboard.press("Tab");
    const described = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      if (!active || active === document.body) return null;
      const style = getComputedStyle(active, ":focus-visible");
      return {
        tag: active.tagName.toLowerCase(),
        text: (active.textContent ?? "").trim().slice(0, 30),
        outline: style.outlineStyle,
      };
    });
    if (described) reached.push(`${described.tag}:${described.text}`);
  }
  expect(reached.length).toBeGreaterThan(4);
});
