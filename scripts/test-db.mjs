import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { connect } from "./pg-client.mjs";
import { validateTap } from "./validate-tap.mjs";

// D-56: execute pgTAP over TLS directly on hosted Postgres, with no local containers.
const client = await connect();
if (!client) {
  console.error(
    "Database tests BLOCKED: set DATABASE_URL in .env.local for the hosted Supabase project. No Docker is used.",
  );
  process.exit(1);
}

// Error text stays suppressed by default so credentials and row values never reach a log.
// Set DB_TEST_VERBOSE=1 locally to print the Postgres message while debugging a failure.
const verbose = process.env.DB_TEST_VERBOSE === "1";
let failed = false;
try {
  const folder = resolve("supabase/tests");
  const files = (await readdir(folder))
    .filter((name) => name.endsWith(".test.sql"))
    .sort();
  if (!files.length) throw new Error("No database tests found");
  for (const file of files) {
    try {
      await client.query("BEGIN");
      await client.query(
        "CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions",
      );
      await client.query("SET LOCAL search_path = public, extensions");
      const sql = await readFile(resolve(folder, file), "utf8");
      const results = await client.query(sql);
      const lines = (Array.isArray(results) ? results : [results]).flatMap(
        (result) =>
          result.rows.flatMap((row) =>
            Object.values(row).filter((value) => typeof value === "string"),
          ),
      );
      // SQL tests contain synthetic fixtures only; never output row values or connection details.
      const result = validateTap(lines);
      if (!result.ok) throw new Error("pgTAP assertions failed");
      console.log(`PASS ${file} (${result.count} assertions)`);
    } catch (error) {
      failed = true;
      console.error(
        `FAIL ${file}. Inspect its pgTAP assertions in the Supabase SQL editor; database error details are suppressed to protect credentials and data.`,
      );
      if (verbose) console.error(`  ${error.message}`);
    } finally {
      // Every test file, including its fixtures, is rolled back (D-56).
      await client.query("ROLLBACK");
    }
  }
} catch (error) {
  failed = true;
  console.error(
    "Database tests failed: verify the hosted connection, TLS trust, and pgTAP extension permissions. Credentials and server error details are not logged.",
  );
  if (verbose) console.error(`  ${error.message}`);
} finally {
  await client.end();
}
if (failed) process.exitCode = 1;
