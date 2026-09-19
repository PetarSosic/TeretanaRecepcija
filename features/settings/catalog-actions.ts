"use server";

import { revalidatePath } from "next/cache";
import type { PostgrestError } from "@supabase/supabase-js";
import type { ZodType } from "zod";
import { requireStaff } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { me } from "@/lib/i18n/me";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/action-state";
import {
  assignmentSchema,
  categorySchema,
  classSlotSchema,
  gymSettingsSchema,
  planSchema,
  productSchema,
  programSchema,
  trainerFeeSchema,
  trainerSchema,
} from "./catalog-schemas";

const TRAINERS_PATH = "/settings/trainers";
const PLANS_PATH = "/settings/plans";
const PRODUCTS_PATH = "/settings/products";
const GYM_PATH = "/settings/gym";

/**
 * Doc 08 §6: validate, call the RPC with the caller's own session so the RPC sees the
 * real role, then revalidate. The RPC raises the coded errors of doc 08 §5; §5 also
 * says a raw database error is never shown, which getErrorMessage guarantees.
 */
function fieldErrorsOf(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues)
    fieldErrors[String(issue.path[0] ?? "form")] = issue.message;
  return fieldErrors;
}

function rpcFailure(error: PostgrestError): ActionState {
  const code = error.message.trim();
  if (!code.startsWith("E_")) console.error(`RPC failed: ${error.message}`);
  return { error: getErrorMessage(code) };
}

async function callRpc<T>(
  schema: ZodType<T>,
  input: unknown,
  run: (
    client: Awaited<ReturnType<typeof createClient>>,
    value: T,
    // The Supabase query builder is thenable rather than a real Promise.
  ) => PromiseLike<{ error: PostgrestError | null }>,
  paths: string[],
): Promise<ActionState> {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const client = await createClient();
  const { error } = await run(client, parsed.data);
  if (error) return rpcFailure(error);

  for (const path of paths) revalidatePath(path);
  return { success: me.settings.saved };
}

// S-24: trainers, programs, assignments and the schedule (F-22, BR-023 to BR-026) ---
export async function saveTrainer(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return callRpc(
    trainerSchema,
    {
      id: formData.get("id") ?? "",
      fullName: formData.get("fullName"),
      isActive: formData.get("isActive"),
    },
    (client, value) =>
      client.rpc("upsert_trainer", {
        p_id: value.id,
        p_full_name: value.fullName,
        p_is_active: value.isActive,
      }),
    [TRAINERS_PATH],
  );
}

/** BR-026 and D-62: only the owner and the admin may set the fee or the group share. */
export async function saveTrainerFee(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return callRpc(
    trainerFeeSchema,
    {
      trainerId: formData.get("trainerId"),
      fee: formData.get("fee") ?? "",
      groupSharePct: formData.get("groupSharePct") ?? "",
    },
    (client, value) =>
      client.rpc("set_trainer_fee", {
        p_trainer: value.trainerId,
        p_fee: value.fee,
        p_group_share_pct: value.groupSharePct,
      }),
    [TRAINERS_PATH],
  );
}

export async function saveProgram(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return callRpc(
    programSchema,
    {
      id: formData.get("id") ?? "",
      name: formData.get("name"),
      kind: formData.get("kind"),
      isActive: formData.get("isActive"),
    },
    (client, value) =>
      client.rpc("upsert_program", {
        p_id: value.id,
        p_name: value.name,
        p_kind: value.kind,
        p_is_active: value.isActive,
      }),
    [TRAINERS_PATH],
  );
}

/** US-22.1 AC1: an assignment is saved the moment its checkbox is toggled. */
export async function saveAssignment(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return callRpc(
    assignmentSchema,
    {
      trainerId: formData.get("trainerId"),
      programId: formData.get("programId"),
      assigned: formData.get("assigned"),
    },
    (client, value) =>
      client.rpc("set_trainer_program", {
        p_trainer: value.trainerId,
        p_program: value.programId,
        p_assigned: value.assigned,
      }),
    [TRAINERS_PATH],
  );
}

export async function saveClassSlot(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return callRpc(
    classSlotSchema,
    {
      id: formData.get("id") ?? "",
      programId: formData.get("programId"),
      trainerId: formData.get("trainerId"),
      weekday: formData.get("weekday"),
      startsAt: formData.get("startsAt"),
      isActive: formData.get("isActive"),
    },
    (client, value) =>
      client.rpc("upsert_class_slot", {
        p_id: value.id,
        p_program: value.programId,
        p_trainer: value.trainerId,
        p_weekday: value.weekday,
        p_starts_at: value.startsAt,
        p_is_active: value.isActive,
      }),
    [TRAINERS_PATH],
  );
}

// S-25, S-26, S-27: owner and admin only (P-61 to P-63) -----------------------------
export async function savePlan(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return callRpc(
    planSchema,
    {
      id: formData.get("id") ?? "",
      name: formData.get("name"),
      kind: formData.get("kind"),
      durationValue: formData.get("durationValue") ?? "",
      durationUnit: formData.get("durationUnit") ?? "",
      price: formData.get("price") ?? "",
      coversGym: formData.get("coversGym"),
      coversGroup: formData.get("coversGroup"),
      coversPersonal: formData.get("coversPersonal"),
      gymVisitLimit: formData.get("gymVisitLimit") ?? "",
      groupSessionLimit: formData.get("groupSessionLimit") ?? "",
      requiresTrainer: formData.get("requiresTrainer"),
      sortOrder: formData.get("sortOrder") ?? "0",
      isActive: formData.get("isActive"),
      gymFixedAmount: formData.get("gymFixedAmount") ?? "0",
      trainerSharePct: formData.get("trainerSharePct") ?? "",
    },
    (client, value) =>
      client.rpc("upsert_plan", {
        p_id: value.id,
        p_name: value.name,
        p_kind: value.kind,
        p_duration_value: value.durationValue,
        p_duration_unit: value.durationUnit,
        p_price: value.price,
        p_covers_gym: value.coversGym,
        p_covers_group: value.coversGroup,
        p_covers_personal: value.coversPersonal,
        p_gym_visit_limit: value.gymVisitLimit,
        p_group_session_limit: value.groupSessionLimit,
        p_requires_trainer: value.requiresTrainer,
        p_sort_order: value.sortOrder,
        p_is_active: value.isActive,
        p_gym_fixed_amount: value.gymFixedAmount,
        p_trainer_share_pct: value.trainerSharePct,
      }),
    [PLANS_PATH],
  );
}

export async function saveProduct(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return callRpc(
    productSchema,
    {
      id: formData.get("id") ?? "",
      name: formData.get("name"),
      purchasePrice: formData.get("purchasePrice"),
      salePrice: formData.get("salePrice"),
      isActive: formData.get("isActive"),
    },
    (client, value) =>
      client.rpc("upsert_product", {
        p_id: value.id,
        p_name: value.name,
        p_purchase_price: value.purchasePrice,
        p_sale_price: value.salePrice,
        p_is_active: value.isActive,
      }),
    [PRODUCTS_PATH],
  );
}

/** BR-131: categories are never deleted, and a system category stays active. */
export async function saveExpenseCategory(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return callRpc(
    categorySchema,
    {
      id: formData.get("id") ?? "",
      name: formData.get("name"),
      isActive: formData.get("isActive"),
    },
    (client, value) =>
      client.rpc("upsert_expense_category", {
        p_id: value.id,
        p_name: value.name,
        p_is_active: value.isActive,
      }),
    // M-12: the same dialog is reachable from S-17, whose filter lists the categories.
    [GYM_PATH, "/finance/expenses"],
  );
}

export async function saveGymSettings(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return callRpc(
    gymSettingsSchema,
    {
      cardReplacementPrice: formData.get("cardReplacementPrice"),
      personalMinPrice: formData.get("personalMinPrice"),
      expiryReminderDays: formData.get("expiryReminderDays"),
      autoCloseTime: formData.get("autoCloseTime"),
      doubleScanSeconds: formData.get("doubleScanSeconds"),
      shiftReportEmails: formData.get("shiftReportEmails"),
      backupEmails: formData.get("backupEmails"),
    },
    (client, value) =>
      client.rpc("update_gym_settings", {
        p_card_replacement_price: value.cardReplacementPrice,
        p_personal_min_price: value.personalMinPrice,
        p_expiry_reminder_days: value.expiryReminderDays,
        p_auto_close_time: value.autoCloseTime,
        p_double_scan_seconds: value.doubleScanSeconds,
        p_shift_report_emails: value.shiftReportEmails,
        p_backup_emails: value.backupEmails,
        p_logo_path: null,
      }),
    [GYM_PATH],
  );
}

/**
 * US-21.1: the owner uploads a PNG or JPG of at most 1 MB. Doc 08 §6 keeps this in a
 * server action because the bucket is private and only the service role writes to it.
 */
export async function uploadLogo(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await requireStaff();
  if (staff.role !== "owner" && staff.role !== "admin")
    return { error: me.errors.E_FORBIDDEN };

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0)
    return { fieldErrors: { logo: me.settings.logoInvalid } };
  if (file.size > 1_048_576 || !["image/png", "image/jpeg"].includes(file.type))
    return { fieldErrors: { logo: me.settings.logoInvalid } };

  const extension = file.type === "image/png" ? "png" : "jpg";
  const path = `${staff.gym_id}/logo.${extension}`;
  const admin = createAdminClient();
  const upload = await admin.storage
    .from("gym-assets")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (upload.error) {
    console.error(`uploadLogo failed: ${upload.error.message}`);
    return { error: me.errors.unexpected };
  }

  const client = await createClient();
  const { data: settings, error } = await client
    .from("gym_settings")
    .select(
      "card_replacement_price::text, personal_min_price::text, expiry_reminder_days, auto_close_time, double_scan_seconds, shift_report_emails, backup_emails",
    )
    .eq("gym_id", staff.gym_id)
    .single();
  if (error || !settings) return { error: me.errors.unexpected };

  // The path is written through the same audited RPC as the rest of the settings.
  const saved = await client.rpc("update_gym_settings", {
    p_card_replacement_price: settings.card_replacement_price,
    p_personal_min_price: settings.personal_min_price,
    p_expiry_reminder_days: settings.expiry_reminder_days,
    p_auto_close_time: settings.auto_close_time,
    p_double_scan_seconds: settings.double_scan_seconds,
    p_shift_report_emails: settings.shift_report_emails,
    p_backup_emails: settings.backup_emails,
    p_logo_path: path,
  });
  if (saved.error) return rpcFailure(saved.error);

  revalidatePath(GYM_PATH);
  return { success: me.settings.logoSaved };
}
