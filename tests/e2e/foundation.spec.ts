import { expect, test } from "@playwright/test";

// The M-00 placeholder was replaced in M-02: the root now routes each role to its home
// screen (doc 06 §2), so these checks run against S-01, the first screen a user sees.
test("S-01 language, layout and no horizontal overflow", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator("html")).toHaveAttribute("lang", "sr-Latn-ME");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Prijava");
  await expect(page.getByLabel("Korisničko ime ili email")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Zaboravljena lozinka?" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("login.png"),
    fullPage: true,
  });
});

test("US-01.2 AC2: a username gets no reset email (D-57)", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Zaboravljena lozinka?" }).click();
  await page.getByRole("dialog").getByLabel("Email").fill("recepcija.test");
  await page.getByRole("button", { name: "Pošalji link" }).click();
  await expect(
    page.getByText(
      "Lozinku vam postavlja administrator, vlasnik ili menadžer.",
    ),
  ).toBeVisible();
});

test("doc 08 §9 sends security headers and unique CSP nonces", async ({
  request,
}) => {
  const first = await request.get("/login");
  const second = await request.get("/login");
  expect(first.headers()["x-frame-options"]).toBe("DENY");
  expect(first.headers()["referrer-policy"]).toBe(
    "strict-origin-when-cross-origin",
  );
  const csp = first.headers()["content-security-policy"];
  expect(csp).toContain("frame-ancestors 'none'");
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
  expect(nonce).toBeTruthy();
  expect(second.headers()["content-security-policy"]).not.toContain(
    `'nonce-${nonce}'`,
  );
  expect(await first.text()).toContain(`nonce="${nonce}"`);
});
