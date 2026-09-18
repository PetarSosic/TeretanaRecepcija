import "server-only";
import { createClient } from "@/lib/supabase/server";

// D-58: admin sits above owner and has every owner permission.
export type AppRole = "admin" | "owner" | "manager" | "receptionist";

export type Staff = {
  id: string;
  gym_id: string;
  user_id: string;
  role: AppRole;
  full_name: string;
  username: string | null;
  email: string | null;
  must_change_password: boolean;
  is_active: boolean;
};

const COLUMNS =
  "id, gym_id, user_id, role, full_name, username, email, must_change_password, is_active";

/**
 * The signed-in staff row, or null when there is no session or no active staff row.
 *
 * A deactivated account makes the doc 07 §6 policies raise E_NOT_STAFF rather than
 * return an empty result, so an error is treated the same as "not staff" here and the
 * caller signs the user out (doc 04 §2 point 5).
 */
export async function getStaff(): Promise<Staff | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from("staff")
    .select(COLUMNS)
    .eq("user_id", auth.user.id)
    .maybeSingle<Staff>();
  if (error || !data || !data.is_active) return null;
  return data;
}

/** The staff row, or an E_NOT_STAFF throw for routes that require a signed-in user. */
export async function requireStaff(): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) throw new Error("E_NOT_STAFF");
  return staff;
}

/** Doc 06 §2: where each role lands after login. */
export function homeRoute(role: AppRole): string {
  return role === "owner" || role === "admin" ? "/finance" : "/reception";
}

/**
 * AS-4: a receptionist's Auth account uses an internal, non-deliverable email built
 * from their username, so a username login maps to that address without a lookup.
 */
export function usernameEmail(username: string): string {
  const domain = process.env.STAFF_EMAIL_DOMAIN;
  // A domain, never an address: a value with an @ would build a broken login email.
  if (!domain || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain))
    throw new Error(
      "STAFF_EMAIL_DOMAIN must be a bare domain such as staff.kpfitness.internal",
    );
  return `${username.trim().toLowerCase()}@${domain}`;
}

/** The address a staff row signs in with: their own email, or the internal one. */
export function loginEmail(staff: Pick<Staff, "email" | "username">): string {
  if (staff.email) return staff.email;
  if (staff.username) return usernameEmail(staff.username);
  throw new Error("E_NOT_STAFF");
}
