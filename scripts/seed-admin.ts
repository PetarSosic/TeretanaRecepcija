// Seeds the admin account (D-58). The admin signs in with an email so a forgotten
// password can be reset (D-57), and is the only role that may manage owners and read
// stored staff passwords (D-59).
//
// Idempotent: an existing Auth user or staff row is left untouched and no password is
// overwritten. Set ADMIN_EMAIL and ADMIN_PASSWORD in .env.local first.
//
// Usage: npm run seed:admin
import { createClient } from "@supabase/supabase-js";
import nextEnv from "@next/env";

const GYM_NAME = "KP Fitness";

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const fullName = process.env.ADMIN_NAME?.trim() || "Administrator";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!url || !serviceKey)
  fail(
    "Admin seed BLOCKED: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
  );
if (!email || !password)
  fail(
    "Admin seed BLOCKED: set ADMIN_EMAIL and ADMIN_PASSWORD in .env.local (the password must be at least 8 characters).",
  );
if (password.length < 8)
  fail("Admin seed BLOCKED: ADMIN_PASSWORD must be at least 8 characters.");

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const gym = await admin
  .from("gyms")
  .select("id")
  .eq("name", GYM_NAME)
  .maybeSingle<{ id: string }>();
if (gym.error) fail(`Admin seed failed reading gyms: ${gym.error.message}`);
if (!gym.data)
  fail(
    `Admin seed BLOCKED: gym "${GYM_NAME}" is missing. Run npm run seed first.`,
  );

const existing = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (existing.error)
  fail(`Admin seed failed listing Auth users: ${existing.error.message}`);
let userId = existing.data.users.find(
  (user) => user.email?.toLowerCase() === email,
)?.id;

if (userId) {
  console.log(`Auth user ${email} already exists; password left unchanged.`);
} else {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (created.error || !created.data.user)
    fail(`Admin seed failed creating the Auth user: ${created.error?.message}`);
  userId = created.data.user.id;
  console.log(`Created Auth user ${email}.`);
}

const staff = await admin
  .from("staff")
  .select("id, role, is_active")
  .eq("user_id", userId)
  .maybeSingle<{ id: string; role: string; is_active: boolean }>();
if (staff.error)
  fail(`Admin seed failed reading staff: ${staff.error.message}`);

let staffId = staff.data?.id;
if (staff.data) {
  console.log(
    `Staff row already exists (role ${staff.data.role}, active: ${staff.data.is_active}); left unchanged.`,
  );
} else {
  const inserted = await admin
    .from("staff")
    .insert({
      gym_id: gym.data.id,
      user_id: userId,
      role: "admin",
      full_name: fullName,
      email,
      // The admin sets the password here, so there is nothing temporary to replace.
      must_change_password: false,
    })
    .select("id")
    .single<{ id: string }>();
  if (inserted.error || !inserted.data)
    fail(
      `Admin seed failed creating the staff row: ${inserted.error?.message}`,
    );
  staffId = inserted.data.id;
  console.log(`Created admin staff row for ${fullName}.`);
}

// D-59: the admin's own password is stored like every other staff password.
const stored = await admin.from("staff_credentials").upsert({
  staff_id: staffId,
  gym_id: gym.data.id,
  password,
  updated_at: new Date().toISOString(),
});
if (stored.error)
  fail(`Admin seed failed storing the password: ${stored.error.message}`);
console.log("Stored password recorded.");
