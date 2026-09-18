import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * D-59: the admin can read any staff password, so a readable copy is kept beside the
 * Supabase bcrypt hash. Every path that sets a password must call this, otherwise the
 * copy goes stale and the admin reads a password that no longer works.
 *
 * The table is admin-only by RLS and is deliberately not audited, because audit_log is
 * readable by owners.
 */
export async function storeStaffPassword(
  staffId: string,
  gymId: string,
  password: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin.from("staff_credentials").upsert({
    staff_id: staffId,
    gym_id: gymId,
    password,
    updated_at: new Date().toISOString(),
  });
  if (error) console.error(`storeStaffPassword failed: ${error.message}`);
  return !error;
}
