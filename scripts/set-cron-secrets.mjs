// Doc 08 §8 and §11: the pg_cron schedule created by migration 0019 reads the
// application address and the shared job secret from Supabase Vault, so neither is ever
// committed. This writes them from .env.local into the Vault of the hosted project.
//
// Until both exist, `run_scheduled_jobs()` returns without calling anything, which is
// what keeps the schedule harmless in development.
//
// Usage: node scripts/set-cron-secrets.mjs
import nextEnv from "@next/env";
import { connect } from "./pg-client.mjs";

nextEnv.loadEnvConfig(process.cwd());

const secrets = {
  app_url: process.env.APP_URL,
  cron_secret: process.env.CRON_SECRET,
};

for (const [name, value] of Object.entries(secrets)) {
  if (!value) {
    console.error(
      `Missing ${name.toUpperCase()} in .env.local; nothing was written.`,
    );
    process.exit(1);
  }
}

if (secrets.app_url.includes("localhost") || secrets.app_url.includes("127.")) {
  console.error(
    "APP_URL points at this machine, which Supabase cannot reach. Set the deployed address before scheduling the jobs.",
  );
  process.exit(1);
}

const client = await connect();
if (!client) {
  console.error("Set DATABASE_URL in .env.local for the hosted project.");
  process.exit(1);
}

try {
  for (const [name, value] of Object.entries(secrets)) {
    const { rows } = await client.query(
      "select id from vault.secrets where name = $1",
      [name],
    );
    if (rows.length) {
      await client.query("select vault.update_secret($1, $2, $3)", [
        rows[0].id,
        value,
        name,
      ]);
      console.log(`Updated Vault secret ${name}.`);
    } else {
      await client.query("select vault.create_secret($1, $2)", [value, name]);
      console.log(`Created Vault secret ${name}.`);
    }
  }
  const { rows } = await client.query(
    "select jobname, schedule, active from cron.job order by jobname",
  );
  console.log("Scheduled jobs:", rows);
} finally {
  await client.end();
}
