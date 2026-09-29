"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { me } from "@/lib/i18n/me";
import { fieldErrorsOf, rpcCode, rpcFailure } from "@/lib/rpc";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/action-state";
import { personalMinimumText, saleArguments, saleFieldsFrom } from "./sale";
import { classTimeChangeSchema, sellSchema } from "./schemas";

/** F-08: sell or renew a membership (BR-050 to BR-060, BR-092). */
export async function sellMembership(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();
  const parsed = sellSchema.safeParse({
    ...saleFieldsFrom(formData),
    memberId: formData.get("memberId"),
  });
  if (!parsed.success)
    return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("sell_membership", {
    p_member: parsed.data.memberId,
    ...saleArguments(parsed.data),
    p_start_override: parsed.data.startOverride,
  });
  if (error) {
    const code = rpcCode(error);
    if (code === "E_AMOUNT_BELOW_MIN")
      return rpcFailure(error, { min: await personalMinimumText() });
    // D-71: the class time has its own field, so its message goes under it.
    if (code.startsWith("E_CLASS_TIME_"))
      return { fieldErrors: { classTime: getErrorMessage(code) } };
    return rpcFailure(error);
  }

  revalidatePath(`/members/${parsed.data.memberId}`);
  revalidatePath("/members");
  return { success: me.memberships.saved };
}

/**
 * D-71: S-07 [Promijeni termin]. Any role moves a group membership to another active
 * time of its trainer; no money changes hands, so no shift is needed (BR-092).
 */
export async function changeClassTime(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();
  const parsed = classTimeChangeSchema.safeParse({
    memberId: formData.get("memberId"),
    membershipId: formData.get("membershipId"),
    classTime: formData.get("classTime") ?? "",
  });
  if (!parsed.success)
    return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_membership_class_time", {
    p_membership: parsed.data.membershipId,
    p_class_time: parsed.data.classTime,
  });
  if (error) return rpcFailure(error);

  revalidatePath(`/members/${parsed.data.memberId}`);
  return { success: me.memberships.classTimeSaved };
}

export type MembershipPreview = {
  startDate: string;
  endDate: string;
  reason: string;
  warning: string | null;
};

const previewSchema = z.object({
  memberId: z.string().uuid().nullable(),
  planId: z.string().uuid(),
  startOverride: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});

/**
 * US-08.1 AC2: the start date, its BR-052 reason and the BR-051 last valid day, shown
 * before saving. Both come from the same SQL the sale runs, so the preview and the
 * saved membership cannot disagree.
 */
export async function previewMembership(input: {
  memberId: string | null;
  planId: string;
  startOverride: string | null;
}): Promise<MembershipPreview | null> {
  const staff = await requireStaff();
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) return null;
  const { memberId, planId, startOverride } = parsed.data;
  const supabase = await createClient();

  let computed: MembershipPreview | null = null;
  if (memberId) {
    const { data, error } = await supabase.rpc("calc_membership_start", {
      p_member: memberId,
      p_plan: planId,
      p_date: null,
    });
    if (error) {
      rpcCode(error);
      return null;
    }
    const row = data as {
      start_date: string;
      end_date: string;
      reason: string;
      warning: string | null;
    };
    computed = {
      startDate: row.start_date,
      endDate: row.end_date,
      reason: row.reason,
      warning: row.warning,
    };
  }

  // A new member (S-05) has no history, so BR-052 step 3 applies; an owner's own date
  // (step 4) replaces whatever was computed.
  const start =
    startOverride ??
    computed?.startDate ??
    ((await supabase.rpc("gym_today", { p_gym: staff.gym_id })).data as
      string | null);
  if (!start) return null;
  if (computed && start === computed.startDate) return computed;

  const { data: plan } = await supabase
    .from("plans")
    .select("duration_value, duration_unit")
    .eq("id", planId)
    .maybeSingle<{ duration_value: number; duration_unit: string }>();
  if (!plan) return null;
  const { data: end, error } = await supabase.rpc("membership_end_date", {
    p_start: start,
    p_value: plan.duration_value,
    p_unit: plan.duration_unit,
  });
  if (error) {
    rpcCode(error);
    return null;
  }
  return {
    startDate: start,
    endDate: end as string,
    reason: startOverride
      ? me.memberships.reasonOwner
      : me.memberships.reasonToday,
    warning: startOverride ? null : (computed?.warning ?? null),
  };
}
