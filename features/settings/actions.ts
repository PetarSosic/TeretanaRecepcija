"use server";

import { revalidatePath } from "next/cache";
import {
  requireStaff,
  usernameEmail,
  type AppRole,
  type Staff,
} from "@/lib/auth";
import { me } from "@/lib/i18n/me";
import { createAdminClient } from "@/lib/supabase/admin";
import { storeStaffPassword } from "@/lib/staff-credentials";
import type { ActionState } from "@/lib/action-state";
import {
  createStaffSchema,
  setActiveSchema,
  setPasswordSchema,
  updateStaffSchema,
} from "./schemas";

const USERS_PATH = "/settings/users";
const FOREVER = "876000h"; // ~100 years; Supabase has no permanent ban flag.

type Target = Pick<Staff, "id" | "gym_id" | "role" | "user_id" | "is_active">;

/**
 * P-04: owners and managers administer accounts; receptionists cannot.
 * P-03 (D-58): owner and admin accounts are managed by an admin alone. AS-5 still
 * keeps managers away from owners, and now from admins too.
 */
async function authorize(targetRole?: AppRole) {
  const caller = await requireStaff();
  if (caller.role === "receptionist") return { error: me.errors.E_FORBIDDEN };
  if (
    (targetRole === "owner" || targetRole === "admin") &&
    caller.role !== "admin"
  )
    return { error: me.errors.E_FORBIDDEN };
  return { caller };
}

async function loadTarget(staffId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("staff")
    .select("id, gym_id, role, user_id, is_active")
    .eq("id", staffId)
    .maybeSingle<Target>();
  return data;
}

function fieldError(field: string, message: string): ActionState {
  return { fieldErrors: { [field]: message } };
}

/**
 * A duplicate identity is reported on the field the user can actually fix — which is
 * the username for a receptionist and the email for everyone else, because the form
 * shows only one of them (US-01.3 AC1, AC2). Anything else becomes a form-level error,
 * so a message can never be attached to a field that is not on screen.
 */
function createFailure(message: string, role: AppRole): ActionState {
  const duplicate = /duplicate key|already (been )?(registered|exists)/i.test(
    message,
  );
  if (!duplicate) {
    console.error(`createStaffUser failed: ${message}`);
    return { error: me.errors.unexpected };
  }
  return role === "receptionist"
    ? fieldError("username", me.users.usernameTaken)
    : fieldError("email", me.users.emailTaken);
}

export async function createStaffUser(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = createStaffSchema.safeParse({
    role: formData.get("role"),
    fullName: formData.get("fullName"),
    username: formData.get("username") ?? undefined,
    email: formData.get("email") ?? undefined,
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues)
      fieldErrors[String(issue.path[0] ?? "fullName")] = issue.message;
    return { fieldErrors };
  }
  const input = parsed.data;

  const check = await authorize(input.role);
  if (!check.caller) return check;

  const admin = createAdminClient();
  let authEmail: string;
  try {
    authEmail = input.username
      ? usernameEmail(input.username)
      : (input.email as string);
  } catch (error) {
    // A misconfigured STAFF_EMAIL_DOMAIN must fail visibly, not silently (AS-4).
    console.error(`createStaffUser failed: ${(error as Error).message}`);
    return { error: me.errors.unexpected };
  }

  // Doc 08 §4: created through the admin API with the address already confirmed,
  // because a receptionist's internal address cannot receive mail (AS-4).
  const created = await admin.auth.admin.createUser({
    email: authEmail,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (created.error || !created.data.user)
    return createFailure(created.error?.message ?? "", input.role);

  // AS-18: every account starts with a temporary password it must replace.
  const inserted = await admin
    .from("staff")
    .insert({
      gym_id: check.caller.gym_id,
      user_id: created.data.user.id,
      role: input.role,
      full_name: input.fullName,
      username: input.username,
      email: input.email,
      must_change_password: true,
      created_by: check.caller.id,
    })
    .select("id")
    .single<{ id: string }>();
  if (inserted.error || !inserted.data) {
    // Never leave an Auth user without its staff row.
    await admin.auth.admin.deleteUser(created.data.user.id);
    return createFailure(inserted.error?.message ?? "", input.role);
  }

  // D-59: the admin-readable copy is written with the same password.
  await storeStaffPassword(
    inserted.data.id,
    check.caller.gym_id,
    input.password,
  );

  revalidatePath(USERS_PATH);
  return { success: me.users.created };
}

export async function updateStaffUser(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = updateStaffSchema.safeParse({
    staffId: formData.get("staffId"),
    fullName: formData.get("fullName"),
  });
  if (!parsed.success) return fieldError("fullName", me.users.nameInvalid);

  const target = await loadTarget(parsed.data.staffId);
  if (!target) return { error: me.errors.E_FORBIDDEN };
  const check = await authorize(target.role);
  if (!check.caller) return check;
  if (check.caller.gym_id !== target.gym_id)
    return { error: me.errors.E_FORBIDDEN };

  const admin = createAdminClient();
  const { error } = await admin
    .from("staff")
    .update({ full_name: parsed.data.fullName })
    .eq("id", target.id);
  if (error) return { error: me.errors.unexpected };

  revalidatePath(USERS_PATH);
  return { success: me.users.updated };
}

/** US-01.3 AC4: a new temporary password, which the user must then replace (AC3). */
export async function setStaffPassword(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = setPasswordSchema.safeParse({
    staffId: formData.get("staffId"),
    password: formData.get("password"),
  });
  if (!parsed.success) return fieldError("password", me.password.tooShort);

  const target = await loadTarget(parsed.data.staffId);
  if (!target) return { error: me.errors.E_FORBIDDEN };
  const check = await authorize(target.role);
  if (!check.caller) return check;
  if (check.caller.gym_id !== target.gym_id)
    return { error: me.errors.E_FORBIDDEN };

  const admin = createAdminClient();
  const updated = await admin.auth.admin.updateUserById(target.user_id, {
    password: parsed.data.password,
  });
  if (updated.error) return { error: me.errors.unexpected };

  const { error } = await admin
    .from("staff")
    .update({ must_change_password: true })
    .eq("id", target.id);
  if (error) return { error: me.errors.unexpected };

  // D-59: a reset must update the admin-readable copy, or it goes stale.
  await storeStaffPassword(target.id, target.gym_id, parsed.data.password);

  revalidatePath(USERS_PATH);
  return { success: me.users.passwordSet };
}

/**
 * US-01.3 AC5 and doc 04 §2 point 5: deactivating also bans the Auth user, so the
 * session is rejected on the next request.
 */
export async function setStaffActive(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = setActiveSchema.safeParse({
    staffId: formData.get("staffId"),
    active: formData.get("active") === "true",
  });
  if (!parsed.success) return { error: me.errors.unexpected };

  const target = await loadTarget(parsed.data.staffId);
  if (!target) return { error: me.errors.E_FORBIDDEN };
  const check = await authorize(target.role);
  if (!check.caller) return check;
  if (check.caller.gym_id !== target.gym_id)
    return { error: me.errors.E_FORBIDDEN };

  const admin = createAdminClient();

  // D-60: nobody may deactivate their own account, and the last active owner or admin
  // must stay, so account administration can never be locked out.
  if (!parsed.data.active) {
    if (target.id === check.caller.id)
      return { error: me.errors.E_SELF_DEACTIVATE };
    if (target.role === "owner" || target.role === "admin") {
      const { count } = await admin
        .from("staff")
        .select("id", { count: "exact", head: true })
        .eq("gym_id", target.gym_id)
        .eq("role", target.role)
        .eq("is_active", true);
      if ((count ?? 0) <= 1) return { error: me.errors.E_LAST_ACCOUNT };
    }
  }

  const { error } = await admin
    .from("staff")
    .update({ is_active: parsed.data.active })
    .eq("id", target.id);
  if (error) return { error: me.errors.unexpected };

  const banned = await admin.auth.admin.updateUserById(target.user_id, {
    ban_duration: parsed.data.active ? "none" : FOREVER,
  });
  if (banned.error) return { error: me.errors.unexpected };

  revalidatePath(USERS_PATH);
  return {
    success: parsed.data.active ? me.users.activated : me.users.deactivated,
  };
}
