// Seed step 8 (doc 07 §7): the owner Auth user and their staff row.
//
// Idempotent: an existing Auth user or staff row is left untouched, so the script is
// safe to re-run against the hosted project (D-56). The service-role key is used here
// because creating Auth users and writing staff rows are server-only actions
// (doc 04 §2 point 4); it never reaches the browser.
//
// Usage: npm run seed:owner
import { createClient } from "@supabase/supabase-js";
import nextEnv from "@next/env";

const OWNER_NAME = "Matija Vojinović";
const OWNER_EMAIL = "matija.vojinovic@eurotehnikamn.me";
const GYM_NAME = "KP Fitness";

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.SEED_OWNER_PASSWORD;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!url || !serviceKey)
  fail(
    "Owner seed BLOCKED: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
  );
if (!password)
  fail("Owner seed BLOCKED: set SEED_OWNER_PASSWORD in .env.local.");

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const gym = await admin
  .from("gyms")
  .select("id")
  .eq("name", GYM_NAME)
  .maybeSingle();
if (gym.error) fail(`Owner seed failed reading gyms: ${gym.error.message}`);
if (!gym.data)
  fail(
    `Owner seed BLOCKED: gym "${GYM_NAME}" is missing. Run npm run seed first.`,
  );

// listUsers is paginated; the owner is created before any other account exists.
const existing = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (existing.error)
  fail(`Owner seed failed listing Auth users: ${existing.error.message}`);
let userId = existing.data.users.find(
  (user) => user.email?.toLowerCase() === OWNER_EMAIL,
)?.id;

if (userId) {
  console.log(
    `Auth user ${OWNER_EMAIL} already exists; password left unchanged.`,
  );
} else {
  const created = await admin.auth.admin.createUser({
    email: OWNER_EMAIL,
    password,
    email_confirm: true,
    user_metadata: { full_name: OWNER_NAME },
  });
  if (created.error || !created.data.user)
    fail(`Owner seed failed creating the Auth user: ${created.error?.message}`);
  userId = created.data.user.id;
  console.log(`Created Auth user ${OWNER_EMAIL}.`);
}

const staff = await admin
  .from("staff")
  .select("id, role, is_active")
  .eq("user_id", userId)
  .maybeSingle();
if (staff.error)
  fail(`Owner seed failed reading staff: ${staff.error.message}`);

if (staff.data) {
  console.log(
    `Staff row already exists (role ${staff.data.role}, active: ${staff.data.is_active}); left unchanged.`,
  );
} else {
  // BR-004 / doc 07 §7: the owner must change the seeded password at first login.
  // D-57: this account keeps its email login as the one exception among staff.
  const inserted = await admin
    .from("staff")
    .insert({
      gym_id: gym.data.id,
      user_id: userId,
      role: "owner",
      full_name: OWNER_NAME,
      email: OWNER_EMAIL,
      must_change_password: true,
    })
    .select("id")
    .single<{ id: string }>();
  if (inserted.error || !inserted.data)
    fail(
      `Owner seed failed creating the staff row: ${inserted.error?.message}`,
    );
  console.log(`Created owner staff row for ${OWNER_NAME}.`);

  // D-59: the password this script just set is stored for the admin to read.
  const stored = await admin.from("staff_credentials").insert({
    staff_id: inserted.data.id,
    gym_id: gym.data.id,
    password,
  });
  if (stored.error)
    fail(`Owner seed failed storing the password: ${stored.error.message}`);
}
