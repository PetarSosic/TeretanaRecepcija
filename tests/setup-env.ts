import { readFileSync } from "node:fs";

/**
 * Vitest runs with NODE_ENV=test, and Next's own loader deliberately ignores `.env.local`
 * in that mode, so the hosted project's keys never reach an integration test (D-56).
 * They are read here instead, before any test module is imported, and an existing value
 * in the real environment always wins.
 */
try {
  const file = readFileSync(".env.local", "utf8");
  for (const line of file.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match || line.trimStart().startsWith("#")) continue;
    const [, name, raw] = match;
    if (process.env[name] !== undefined) continue;
    process.env[name] = raw.trim().replace(/^["'](.*)["']$/, "$1");
  }
} catch {
  // No .env.local: the offline unit tests do not need one, and an integration test
  // reports the missing variable itself.
}
