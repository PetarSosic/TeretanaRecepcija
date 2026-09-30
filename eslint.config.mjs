import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    rules: {
      // D-86: a prefetch is a server request (proxy, database, function) for a page
      // that may never be opened, so no link prefetches.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXOpeningElement[name.name='Link']:not(:has(JSXAttribute[name.name='prefetch'][value.expression.value=false]))",
          message: "D-86: every Link sets prefetch={false}.",
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    ".playwright/**",
  ]),
]);
