// Doc 08 §8: call one job handler by hand, with the shared secret, the way pg_cron will
// once APP_URL points at a deployed address. This is how the jobs are exercised in
// development, where Supabase cannot reach a machine on localhost.
//
// Usage: npm run jobs:run -- nightly | morning | weekly-backup | email-retry
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const job = process.argv[2];
const jobs = ["nightly", "morning", "weekly-backup", "email-retry"];
if (!jobs.includes(job)) {
  console.error(`Usage: npm run jobs:run -- ${jobs.join(" | ")}`);
  process.exit(1);
}

const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("Set CRON_SECRET in .env.local.");
  process.exit(1);
}

const base = (process.env.APP_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const response = await fetch(`${base}/api/jobs/${job}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-cron-secret": secret },
  body: "{}",
});

console.log(`${response.status} ${response.statusText}`);
console.log(JSON.stringify(await response.json(), null, 2));
process.exitCode = response.ok ? 0 : 1;
