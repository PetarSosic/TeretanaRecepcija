import { expect, test } from "@playwright/test";

// D-91: the app installs as an app from Chrome and Edge on a computer and Android, and
// from Safari on iOS.
test("D-91: the manifest and its icons load without a session", async ({
  request,
}) => {
  // The browser fetches the manifest without cookies; a redirect to /login breaks it.
  const response = await request.get("/manifest.webmanifest", {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    name: "KP Fitness",
    start_url: "/",
    display: "standalone",
  });
  for (const icon of manifest.icons as { src: string; sizes: string }[]) {
    const image = await request.get(icon.src, { maxRedirects: 0 });
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/png");
    // A PNG stores its width and height big-endian at bytes 16 and 20.
    const body = await image.body();
    expect(`${body.readUInt32BE(16)}x${body.readUInt32BE(20)}`).toBe(
      icon.sizes,
    );
  }
});

test("D-91: Chrome finds nothing that stops the install", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  const cdp = await page.context().newCDPSession(page);
  const { errors } = await cdp.send("Page.getAppManifest", {});
  expect(errors).toEqual([]);
  const { installabilityErrors } = await cdp.send(
    "Page.getInstallabilityErrors",
  );
  // Playwright's browser contexts are incognito, where Chrome installs nothing; that is
  // the test browser, not the app.
  expect(
    installabilityErrors.filter((error) => error.errorId !== "in-incognito"),
  ).toEqual([]);
});
