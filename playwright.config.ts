import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // One Next server serves every worker, and each navigation costs the proxy two
  // Supabase round trips. Four workers queue up behind that and sign-ins occasionally
  // time out; two workers run the suite green and repeatably.
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  // D-56: every page talks to the hosted database, whose round trip varies from about
  // 100 ms to over 300 ms; 10 s leaves room for a slow network without hiding a real hang.
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    channel: "chrome",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1366, height: 768 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
      },
    },
  ],
  webServer: {
    command: `node node_modules/next/dist/bin/next ${process.env.E2E_PRODUCTION ? "start" : "dev"} --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    // N-05: never reuse a server this config did not start. A stray dev server runs
    // with the real .env.local, so the env below is not applied to it and the tests
    // send real email from a verified sender to the address in gym_settings. Refusing
    // to reuse turns that silent accident into a loud failure to start.
    reuseExistingServer: false,
    // BR-118 and BR-161: tests exercise the email path with a key Resend rejects, so no
    // real email ever leaves a test run, and a failed send is what the tests expect.
    env: {
      EMAIL_FROM: "noreply@stamenkovicc.com",
      RESEND_API_KEY: "re_e2e_invalid_key",
    },
    timeout: 120_000,
  },
});
