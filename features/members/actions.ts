"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { gymToday } from "@/lib/gym-date";
import { me } from "@/lib/i18n/me";
import { fieldErrorsOf, rpcCode, rpcFailure } from "@/lib/rpc";
import { parseCardCode } from "@/lib/scan";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/action-state";
import type { CheckInResult } from "@/features/reception/types";
import {
  personalMinimumText,
  saleArguments,
  saleFieldsFrom,
} from "@/features/memberships/sale";
import {
  anonymizeSchema,
  registerSchema,
  replaceCardSchema,
  updateMemberSchema,
} from "./schemas";

/**
 * SUSPECT-02: AS-2 allows 01.01.1900 up to gym_today, and only the database knows that
 * date (BR-001). The schema therefore checks the shape and the lower bound, and the
 * upper bound is checked here — otherwise clean_member() rejects it as a general
 * "Provjerite unesene podatke." and the field's own message is never shown.
 */
async function futureDateOfBirth(
  gymId: string,
  dateOfBirth: string,
): Promise<boolean> {
  return dateOfBirth > (await gymToday(gymId));
}

function memberFieldsFrom(formData: FormData) {
  return {
    firstName: formData.get("firstName") ?? "",
    lastName: formData.get("lastName") ?? "",
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
    dateOfBirth: formData.get("dateOfBirth") ?? "",
  };
}

/**
 * US-06.1 AC4 and US-11.1 AC2: is the scanned card an unassigned card of this gym? The
 * answer is the BR-070 message for anything else, so the dialog can say why and stay
 * open. The save repeats the check inside its own transaction.
 */
export async function checkCard(input: string): Promise<ActionState<string>> {
  await requireStaff();
  const code = parseCardCode(input);
  if (!code) return { error: me.errors.E_CARD_INVALID };
  const supabase = await createClient();
  const { error } = await supabase.rpc("check_unassigned_card", {
    p_code: code,
  });
  if (error) return rpcFailure(error);
  return { success: me.members.cardReady, data: code };
}

export type Duplicate = {
  id: string;
  member_number: number;
  first_name: string;
  last_name: string;
};

/** BR-043 and AS-3: a warning when the phone or email is already on file. */
export async function findDuplicates(
  phone: string,
  email: string,
): Promise<Duplicate[]> {
  await requireStaff();
  if (!phone.trim() && !email.trim()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("find_duplicates", {
    p_phone: phone.slice(0, 40),
    p_email: email.slice(0, 254),
  });
  if (error) {
    rpcCode(error);
    return [];
  }
  return (data as Duplicate[]) ?? [];
}

export type RegisteredMember = {
  memberId: string;
  memberNumber: number;
  fullName: string;
  /** "Prijavi odmah": the BR-079 result S-03b/c/d shows next. */
  checkIn: CheckInResult | null;
};

/**
 * F-06: the member, the card, the membership, its payment and, with "Prijavi odmah"
 * (on by default, D-31), the check-in, all in one transaction (US-06.1 AC2).
 */
export async function registerMember(
  _state: ActionState<RegisteredMember>,
  formData: FormData,
): Promise<ActionState<RegisteredMember>> {
  const staff = await requireStaff();
  const parsed = registerSchema.safeParse({
    ...memberFieldsFrom(formData),
    ...saleFieldsFrom(formData),
    cardCode: formData.get("cardCode") ?? "",
  });
  if (!parsed.success)
    return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const value = parsed.data;
  if (await futureDateOfBirth(staff.gym_id, value.dateOfBirth))
    return { fieldErrors: { dateOfBirth: me.members.dateOfBirthInvalid } };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_member", {
    p_card_code: value.cardCode,
    p_first: value.firstName,
    p_last: value.lastName,
    p_phone: value.phone,
    p_email: value.email,
    p_dob: value.dateOfBirth,
    ...saleArguments(value),
    p_check_in: formData.get("checkInNow") === "on",
  });
  if (error) {
    const code = rpcCode(error);
    if (code === "E_AMOUNT_BELOW_MIN")
      return rpcFailure(error, { min: await personalMinimumText() });
    // The card is the one field the database can reject on its own (BR-070).
    if (code.startsWith("E_CARD_"))
      return { fieldErrors: { cardCode: getErrorMessage(code) } };
    return rpcFailure(error);
  }

  const member = data as {
    member_id: string;
    member_number: number;
    first_name: string;
    last_name: string;
    check_in: CheckInResult | null;
  };
  revalidatePath("/members");
  revalidatePath("/reception");
  return {
    success: me.memberships.saved,
    data: {
      memberId: member.member_id,
      memberNumber: member.member_number,
      fullName: `${member.first_name} ${member.last_name}`,
      checkIn: member.check_in,
    },
  };
}

/** BR-045: any role edits the personal data; the database audits it (BR-096). */
export async function updateMember(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await requireStaff();
  const parsed = updateMemberSchema.safeParse({
    ...memberFieldsFrom(formData),
    memberId: formData.get("memberId"),
  });
  if (!parsed.success)
    return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const value = parsed.data;
  if (await futureDateOfBirth(staff.gym_id, value.dateOfBirth))
    return { fieldErrors: { dateOfBirth: me.members.dateOfBirthInvalid } };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_member", {
    p_member: value.memberId,
    p_first: value.firstName,
    p_last: value.lastName,
    p_phone: value.phone,
    p_email: value.email,
    p_dob: value.dateOfBirth,
  });
  if (error) return rpcFailure(error);

  revalidatePath(`/members/${value.memberId}`);
  revalidatePath("/members");
  return { success: me.members.updated };
}

/**
 * US-07.4 and BR-046: the owner types the member number to confirm.
 *
 * SUSPECT-12: the number it is compared against comes from a hidden field of the same
 * form, so the typing guards against the wrong member being picked by mistake, not
 * against a determined browser. What actually protects the record is the role check
 * below and `assert_staff_role(array['owner','admin'])` inside anonymize_member.
 */
export async function anonymizeMember(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await requireStaff();
  if (staff.role !== "owner" && staff.role !== "admin")
    return { error: me.errors.E_FORBIDDEN };
  const parsed = anonymizeSchema.safeParse({
    memberId: formData.get("memberId"),
    memberNumber: formData.get("memberNumber"),
    confirmation: formData.get("confirmation") ?? "",
  });
  if (!parsed.success) return { error: me.errors.E_VALIDATION };
  if (parsed.data.confirmation !== parsed.data.memberNumber)
    return { fieldErrors: { confirmation: me.members.anonymizeMismatch } };

  const supabase = await createClient();
  const { error } = await supabase.rpc("anonymize_member", {
    p_member: parsed.data.memberId,
  });
  if (error) return rpcFailure(error);

  revalidatePath(`/members/${parsed.data.memberId}`);
  revalidatePath("/members");
  return { success: me.members.anonymized };
}

/** F-11 and BR-034: fee, old card deactivated, new card assigned, in one transaction. */
export async function replaceCard(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();
  const parsed = replaceCardSchema.safeParse({
    memberId: formData.get("memberId"),
    cardCode: formData.get("cardCode") ?? "",
    method: formData.get("method") ?? "",
  });
  if (!parsed.success)
    return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("replace_card", {
    p_member: parsed.data.memberId,
    p_new_code: parsed.data.cardCode,
    p_method: parsed.data.method,
  });
  if (error) {
    const code = rpcCode(error);
    if (code.startsWith("E_CARD_"))
      return { fieldErrors: { cardCode: getErrorMessage(code) } };
    return rpcFailure(error);
  }

  revalidatePath(`/members/${parsed.data.memberId}`);
  return { success: me.members.lostCardDone };
}
