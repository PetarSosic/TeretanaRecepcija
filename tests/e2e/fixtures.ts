import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import nextEnv from "@next/env";

/**
 * Synthetic fixtures for Playwright (doc 08 §10, D-56): every test gym is created and
 * removed again through the service role, so the real KP Fitness data is never touched
 * and the hosted database is never reset.
 */
nextEnv.loadEnvConfig(process.cwd());

export type TestStaff = {
  id: string;
  userId: string;
  fullName: string;
  identifier: string;
  password: string;
};

export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      "E2E fixtures need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function suffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

export async function createTestGym(label: string): Promise<string> {
  const admin = adminClient();
  const { data, error } = await admin
    .from("gyms")
    .insert({ name: `E2E ${label}` })
    .select("id")
    .single<{ id: string }>();
  if (error || !data)
    throw new Error(`Test gym not created: ${error?.message}`);
  const settings = await admin.from("gym_settings").insert({ gym_id: data.id });
  if (settings.error)
    throw new Error(`Test gym settings not created: ${settings.error.message}`);
  return data.id;
}

export async function createTestStaff(
  gymId: string,
  options: {
    role: "admin" | "owner" | "manager" | "receptionist";
    fullName: string;
    password: string;
    mustChangePassword?: boolean;
    /** D-59: seed the admin-readable copy with this value instead of the password. */
    storePassword?: string;
  },
): Promise<TestStaff> {
  const admin = adminClient();
  const tag = `e2e.${suffix()}`;
  // D-57: every role signs in with a username; only the admin uses an email.
  const isAdmin = options.role === "admin";
  const username = isAdmin ? null : tag;
  const email = isAdmin ? `${tag}@e2e.invalid` : null;
  const authEmail = isAdmin
    ? (email as string)
    : `${tag}@${process.env.STAFF_EMAIL_DOMAIN}`;

  const created = await admin.auth.admin.createUser({
    email: authEmail,
    password: options.password,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw new Error(`Test Auth user not created: ${created.error?.message}`);

  const { data, error } = await admin
    .from("staff")
    .insert({
      gym_id: gymId,
      user_id: created.data.user.id,
      role: options.role,
      full_name: options.fullName,
      username,
      email,
      must_change_password: options.mustChangePassword ?? false,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    await admin.auth.admin.deleteUser(created.data.user.id);
    throw new Error(`Test staff row not created: ${error?.message}`);
  }

  const stored = options.storePassword ?? options.password;
  const credential = await admin
    .from("staff_credentials")
    .insert({ staff_id: data.id, gym_id: gymId, password: stored });
  if (credential.error)
    throw new Error("Test credential not stored: " + credential.error.message);

  return {
    id: data.id,
    userId: created.data.user.id,
    fullName: options.fullName,
    identifier: username ?? (email as string),
    password: options.password,
  };
}

/** Removes everything the test created, in foreign-key order. */
export async function deleteTestGym(gymId: string): Promise<void> {
  const admin = adminClient();
  const { data: staff } = await admin
    .from("staff")
    .select("user_id")
    .eq("gym_id", gymId)
    .returns<{ user_id: string }[]>();

  await admin.from("audit_log").delete().eq("gym_id", gymId);
  // M-05: shifts reference staff, so they go before it.
  await admin.from("shifts").delete().eq("gym_id", gymId);
  // M-04: cards before their batches.
  await admin.from("cards").delete().eq("gym_id", gymId);
  await admin.from("card_batches").delete().eq("gym_id", gymId);
  // Catalogue first, in foreign-key order (M-03).
  await admin.from("class_slots").delete().eq("gym_id", gymId);
  await admin.from("trainer_programs").delete().eq("gym_id", gymId);
  await admin.from("trainer_finance").delete().eq("gym_id", gymId);
  await admin.from("trainers").delete().eq("gym_id", gymId);
  await admin.from("programs").delete().eq("gym_id", gymId);
  await admin.from("plan_finance").delete().eq("gym_id", gymId);
  await admin.from("plans").delete().eq("gym_id", gymId);
  await admin.from("products").delete().eq("gym_id", gymId);
  await admin.from("expense_categories").delete().eq("gym_id", gymId);
  await admin.from("member_counters").delete().eq("gym_id", gymId);
  await admin.from("staff_credentials").delete().eq("gym_id", gymId);
  await admin.from("staff").delete().eq("gym_id", gymId);
  for (const row of staff ?? []) await admin.auth.admin.deleteUser(row.user_id);
  await admin.from("gym_settings").delete().eq("gym_id", gymId);
  await admin.from("gyms").delete().eq("id", gymId);
}

/**
 * A minimal catalogue so the M-03 screens have something to show: one trainer with a
 * fee (BR-020), one group program with that trainer assigned (BR-021), one plan with
 * its owner-only finance row (BR-010) and one product (BR-140).
 */
export async function createTestCatalog(gymId: string) {
  const admin = adminClient();
  const trainer = await admin
    .from("trainers")
    .insert({ gym_id: gymId, full_name: "E2E Trenerka" })
    .select("id")
    .single<{ id: string }>();
  if (trainer.error || !trainer.data)
    throw new Error(`Test trainer not created: ${trainer.error?.message}`);

  const fee = await admin.from("trainer_finance").insert({
    trainer_id: trainer.data.id,
    gym_id: gymId,
    personal_gym_fee: 80,
  });
  if (fee.error) throw new Error(`Test fee not created: ${fee.error.message}`);

  const program = await admin
    .from("programs")
    .insert({ gym_id: gymId, name: "E2E Grupni", kind: "group" })
    .select("id")
    .single<{ id: string }>();
  if (program.error || !program.data)
    throw new Error(`Test program not created: ${program.error?.message}`);

  const assignment = await admin.from("trainer_programs").insert({
    gym_id: gymId,
    trainer_id: trainer.data.id,
    program_id: program.data.id,
  });
  if (assignment.error)
    throw new Error(`Test assignment not created: ${assignment.error.message}`);

  const plan = await admin
    .from("plans")
    .insert({
      gym_id: gymId,
      name: "E2E Mjesečna",
      kind: "gym",
      duration_value: 1,
      duration_unit: "month",
      price: 79,
      covers_gym: true,
      sort_order: 1,
    })
    .select("id")
    .single<{ id: string }>();
  if (plan.error || !plan.data)
    throw new Error(`Test plan not created: ${plan.error?.message}`);
  const planFinance = await admin
    .from("plan_finance")
    .insert({ plan_id: plan.data.id, gym_id: gymId });
  if (planFinance.error)
    throw new Error(
      `Test plan finance not created: ${planFinance.error.message}`,
    );

  const product = await admin
    .from("products")
    .insert({
      gym_id: gymId,
      name: "E2E Voda",
      current_purchase_price: 0.3,
      sale_price: 1.5,
    })
    .select("id")
    .single<{ id: string }>();
  if (product.error || !product.data)
    throw new Error(`Test product not created: ${product.error?.message}`);

  return {
    trainerId: trainer.data.id,
    programId: program.data.id,
    planId: plan.data.id,
    productId: product.data.id,
  };
}
