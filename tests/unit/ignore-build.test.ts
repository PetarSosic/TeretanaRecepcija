import { describe, expect, it } from "vitest";
import { needsBuild } from "../../scripts/ignore-build.mjs";

describe("needsBuild (D-87)", () => {
  it("skips a commit of documentation, tests, migrations and tooling only", () => {
    expect(
      needsBuild([
        "docs/10-decisions-open-questions-assumptions.md",
        "TEST_PLAN.md",
        "README.md",
        "tests/e2e/finance.spec.ts",
        "tests/unit/period.test.ts",
        "supabase/migrations/0037_example.sql",
        "supabase/tests/0021_example.test.sql",
        "scripts/seed.mjs",
        "playwright.config.ts",
        "eslint.config.mjs",
        "",
      ]),
    ).toBe(false);
  });

  it("builds when any application file changed", () => {
    for (const file of [
      "app/(app)/finance/page.tsx",
      "features/reception/components/reception-screen.tsx",
      "components/common/app-header.tsx",
      "lib/auth.ts",
      "proxy.ts",
      "public/favicon.svg",
      "package.json",
      "package-lock.json",
      "next.config.ts",
      "vercel.json",
      "tsconfig.json",
    ])
      expect(needsBuild(["docs/x.md", file]), file).toBe(true);
  });

  it("builds when nothing is known to have changed", () => {
    expect(needsBuild([])).toBe(true);
    expect(needsBuild([""])).toBe(true);
  });

  it("does not mistake a similar name for a skipped folder", () => {
    expect(needsBuild(["docsite/page.tsx"])).toBe(true);
    expect(needsBuild(["lib/tests-helper.ts"])).toBe(true);
  });
});
