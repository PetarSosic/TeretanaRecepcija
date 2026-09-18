// Applies supabase/seed.sql to the hosted project (D-56).
//
// The Supabase CLI only runs seed.sql during a local `db reset`, which is forbidden
// here, so the file is applied over the same verified TLS connection the pgTAP runner
// uses. Every statement in seed.sql is idempotent, so re-running changes nothing.
//
// Usage: npm run seed
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { connect } from "./pg-client.mjs";

const client = await connect();
if (!client) {
  console.error(
    "Seed BLOCKED: set DATABASE_URL in .env.local for the hosted Supabase project.",
  );
  process.exit(1);
}

try {
  const sql = await readFile(resolve("supabase/seed.sql"), "utf8");
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  const { rows } = await client.query(
    "select g.name, s.gym_id is not null as has_settings from gyms g left join gym_settings s on s.gym_id = g.id order by g.name",
  );
  for (const row of rows)
    console.log(
      `Seeded gym "${row.name}" (settings: ${row.has_settings ? "yes" : "missing"})`,
    );
} catch (error) {
  await client.query("ROLLBACK");
  console.error(`Seed failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
