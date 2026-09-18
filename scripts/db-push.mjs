// Applies pending migrations in supabase/migrations to the hosted project (D-56).
//
// `supabase db push --linked` needs an interactive `supabase login`, so this wrapper
// pushes with --db-url taken from .env.local instead. The URI is passed through the
// child process argument list only, never printed. Nothing is ever reset.
//
// Usage: npm run db:push [-- --dry-run]
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    "Migration push BLOCKED: set DATABASE_URL in .env.local for the hosted Supabase project.",
  );
  process.exit(1);
}

// Run the CLI's own entry point with this Node binary: Windows refuses to spawn the
// npx/.cmd shims without a shell, and that failure is silent.
const require = createRequire(import.meta.url);
const cli = require.resolve("supabase/dist/supabase.js");

const result = spawnSync(
  process.execPath,
  [cli, "db", "push", "--db-url", connectionString, ...process.argv.slice(2)],
  { stdio: "inherit" },
);
if (result.error) {
  console.error(`Migration push failed to start: ${result.error.message}`);
  process.exit(1);
}
process.exitCode = result.status ?? 1;
