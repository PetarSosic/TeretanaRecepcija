import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    // tests/unit is offline; tests/integration talks to the hosted project (D-56),
    // which is where the weekly backup's Storage round trip is proved (M-11).
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["tests/setup-env.ts"],
    testTimeout: 120_000,
  },
});
