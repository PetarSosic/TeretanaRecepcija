"use server";

import { redirect } from "next/navigation";
import {
  getStaff,
  homeRoute,
  loginEmail,
  requireStaff,
  usernameEmail,
  type AppRole,
} from "@/lib/auth";
import { me } from "@/lib/i18n/me";
import { createAdminClient } from "@/lib/supabase/admin";
import { storeStaffPassword } from "@/lib/staff-credentials";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/action-state";
import { resolveLoginShift } from "@/features/shifts/actions";
import { changePasswordSchema, isEmail, loginSchema } from "./schemas";

/**
 * US-01.1: one field accepts a username or an email. Every failure answers with the
 * same message (AC3, AC4), so nothing reveals which half was wrong or whether an
 * account exists.
 */
export async function loginWithUsernameOrEmail(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: me.login.failed };

  const { identifier, password } = parsed.data;
  // SUSPECT-03: usernameEmail throws when STAFF_EMAIL_DOMAIN is missing or malformed
  // (AS-4). Uncaught, that replaces S-01 with the error screen and nobody with a
  // username can sign in; the misconfiguration belongs in the log, not on the screen.
  let email: string;
  try {
    email = isEmail(identifier)
      ? identifier.toLowerCase()
      : usernameEmail(identifier);
  } catch (misconfiguration) {
    console.error(
      `loginWithUsernameOrEmail: ${(misconfiguration as Error).message}`,
    );
    return { error: me.login.failed };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: me.login.failed };

  // Doc 04 §2 point 5: a deactivated account must not reach any screen, even if its
  // Auth ban has not been applied.
  const staff = await getStaff();
  if (!staff) {
    await supabase.auth.signOut();
    return { error: me.login.failed };
  }

  if (staff.must_change_password) redirect("/change-password");

  // BR-111: a receptionist login opens, resumes, or meets the S-02 gate.
  if (staff.role === "receptionist") {
    const state = await resolveLoginShift();
    redirect(state === "gate" ? "/shift/gate" : homeRoute(staff.role));
  }

  redirect(homeRoute(staff.role));
}

/**
 * US-01.2: the reset email goes to owners and managers only. A username belongs to a
 * receptionist (doc 07 §3 constrains it that way), so that case is answered with the
 * AC2 message instead.
 */
export async function requestPasswordReset(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  if (!identifier) return { error: me.users.emailInvalid };
  // D-57: a username belongs to a staff account whose password is set on S-23.
  if (!isEmail(identifier)) return { error: me.login.resetStaff };

  const email = identifier.toLowerCase();
  const admin = createAdminClient();
  const { data: staff } = await admin
    .from("staff")
    .select("role, is_active, email")
    .eq("email", email)
    .maybeSingle<{ role: AppRole; is_active: boolean; email: string | null }>();

  // D-57: only an admin (and the seeded owner) has an email to reset.
  if (staff?.is_active && staff.email) {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.APP_URL ?? ""}/auth/callback?next=/change-password`,
    });
  }
  // The same confirmation either way, so the form cannot be used to find accounts.
  return { success: me.login.resetSent };
}

/**
 * US-01.4 and S-01b. The current password is required except at first login, where the
 * user already proved it with the temporary password they just used (AS-18).
 */
export async function changeOwnPassword(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await requireStaff();
  const parsed = changePasswordSchema.safeParse({
    current: formData.get("current") ?? undefined,
    next: formData.get("next"),
    repeat: formData.get("repeat"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues)
      fieldErrors[String(issue.path[0] ?? "next")] = issue.message;
    return { fieldErrors };
  }

  const supabase = await createClient();
  if (!staff.must_change_password) {
    const current = parsed.data.current ?? "";
    if (!current) return { fieldErrors: { current: me.password.wrongCurrent } };
    // SUSPECT-03: loginEmail throws on the same misconfiguration as the sign-in above.
    let email: string;
    try {
      email = loginEmail(staff);
    } catch (misconfiguration) {
      console.error(`changePassword: ${(misconfiguration as Error).message}`);
      return { error: me.errors.unexpected };
    }
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: current,
    });
    if (error) return { fieldErrors: { current: me.password.wrongCurrent } };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.next,
  });
  if (error) return { error: me.errors.unexpected };

  // D-59: the admin-readable copy follows every password change, including this one.
  await storeStaffPassword(staff.id, staff.gym_id, parsed.data.next);

  if (staff.must_change_password) {
    // staff is not writable by `authenticated` (doc 04 §2), so the flag is cleared
    // with the service role, which is server-only.
    const admin = createAdminClient();
    const { error: flagError } = await admin
      .from("staff")
      .update({ must_change_password: false })
      .eq("id", staff.id);
    if (flagError) return { error: me.errors.unexpected };

    // BR-111: a first login is sent to S-01b before the shift logic runs, so it runs
    // here instead. Without it a new receptionist would reach the reception screen with
    // no shift of their own, which BR-116 treats as a shift that has ended.
    if (staff.role === "receptionist") {
      const state = await resolveLoginShift();
      redirect(state === "gate" ? "/shift/gate" : homeRoute(staff.role));
    }
    redirect(homeRoute(staff.role));
  }

  return { success: me.password.changed };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
