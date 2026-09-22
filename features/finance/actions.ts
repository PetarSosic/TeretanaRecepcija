"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { gymToday } from "@/lib/gym-date";
import { me } from "@/lib/i18n/me";
import { fieldErrorsOf, rpcFailure } from "@/lib/rpc";
import { deliverShiftReport } from "@/lib/shift-report";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/action-state";
import {
  backdatedCardFeeSchema,
  backdatedDayPassSchema,
  backdatedMembershipSchema,
  backdatedVisitSchema,
  closeAnyShiftSchema,
  expenseSchema,
  resendShiftSchema,
  voidExpenseSchema,
} from "./schemas";

/** Doc 04 §2 point 3: the finance actions belong to the owner and the admin (D-58). */
async function requireOwner() {
  const staff = await requireStaff();
  if (staff.role !== "owner" && staff.role !== "admin")
    throw new Error("E_FORBIDDEN");
  return staff;
}

/**
 * SUSPECT-06: BR-120 and BR-133 stop every one of these dates at gym_today, and only
 * the database knows that date (BR-001). The schemas therefore check the shape and the
 * bound is checked here, so the message the form already carries lands under its field
 * instead of the general "Provjerite unesene podatke." the RPC would produce.
 */
async function futureDate(
  gymId: string,
  field: string,
  value: string,
): Promise<ActionState | null> {
  return value > (await gymToday(gymId))
    ? { fieldErrors: { [field]: me.finance.dateInvalid } }
    : null;
}

function revalidateFinance() {
  revalidatePath("/finance");
  revalidatePath("/finance/expenses");
  revalidatePath("/finance/trainers");
  revalidatePath("/finance/shifts");
  revalidatePath("/finance/storage");
  revalidatePath("/finance/audit");
}

/** S-17 [Novi trošak] (BR-133). */
export async function saveExpense(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await requireOwner();
  const parsed = expenseSchema.safeParse({
    categoryId: formData.get("categoryId") ?? "",
    description: formData.get("description") ?? "",
    amount: formData.get("amount") ?? "",
    spentOn: formData.get("spentOn") ?? "",
    method: formData.get("method") ?? "",
    fromTill: formData.get("fromTill") === "on",
    supplier: formData.get("supplier") ?? "",
    invoice: formData.get("invoice") ?? "",
    vat: formData.get("vat") ?? "unset",
    trainerId: formData.get("trainerId") ?? "",
  });
  if (!parsed.success)
    return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const tooLate = await futureDate(staff.gym_id, "spentOn", parsed.data.spentOn);
  if (tooLate) return tooLate;

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_expense", {
    p_category: parsed.data.categoryId,
    p_description: parsed.data.description,
    p_amount: parsed.data.amount,
    p_spent_on: parsed.data.spentOn,
    // AS-17: "Van kase" is stored as no method at all.
    p_method: parsed.data.method === "none" ? null : parsed.data.method,
    p_from_till: parsed.data.fromTill,
    p_supplier: parsed.data.supplier || null,
    p_invoice: parsed.data.invoice || null,
    p_vat: parsed.data.vat === "unset" ? null : parsed.data.vat === "yes",
    p_trainer: parsed.data.trainerId,
  });
  if (error) return rpcFailure(error);

  revalidateFinance();
  return { success: me.finance.expenseSaved };
}

/** S-17 (BR-135): the owner may void any expense, with a reason. */
export async function voidExpense(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireOwner();
  const parsed = voidExpenseSchema.safeParse({
    expenseId: formData.get("expenseId") ?? "",
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success)
    return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_expense", {
    p_expense: parsed.data.expenseId,
    p_reason: parsed.data.reason,
  });
  if (error) return rpcFailure(error);

  revalidateFinance();
  return { success: me.payments.voided };
}

/** S-22 tab Dolazak (BR-120, BR-083). */
export async function saveBackdatedVisit(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await requireOwner();
  const parsed = backdatedVisitSchema.safeParse({
    memberId: formData.get("memberId") ?? "",
    date: formData.get("date") ?? "",
    checkIn: formData.get("checkIn") ?? "",
    checkOut: formData.get("checkOut") ?? "",
    visitType: formData.get("visitType") ?? "gym",
    trainerId: formData.get("trainerId") ?? "",
    slotId: formData.get("slotId") ?? "",
  });
  if (!parsed.success)
    return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const tooLate = await futureDate(staff.gym_id, "date", parsed.data.date);
  if (tooLate) return tooLate;

  const supabase = await createClient();
  const { error } = await supabase.rpc("backdated_visit", {
    p_member: parsed.data.memberId,
    p_date: parsed.data.date,
    p_check_in: parsed.data.checkIn,
    p_check_out: parsed.data.checkOut,
    p_type: parsed.data.visitType,
    p_trainer: parsed.data.trainerId,
    p_slot: parsed.data.slotId,
  });
  if (error) return rpcFailure(error);

  revalidateFinance();
  revalidatePath("/members");
  return { success: me.finance.saved };
}

/** S-22 tab Članarina (BR-120). */
export async function saveBackdatedMembership(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await requireOwner();
  const parsed = backdatedMembershipSchema.safeParse({
    memberId: formData.get("memberId") ?? "",
    planId: formData.get("planId") ?? "",
    trainerId: formData.get("trainerId") ?? "",
    amount: formData.get("amount") ?? "",
    sessions: formData.get("sessions") ?? "",
    method: formData.get("method") ?? "",
    paidOn: formData.get("paidOn") ?? "",
    startDate: formData.get("startDate") ?? "",
  });
  if (!parsed.success)
    return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const tooLate = await futureDate(staff.gym_id, "paidOn", parsed.data.paidOn);
  if (tooLate) return tooLate;

  const supabase = await createClient();
  const { error } = await supabase.rpc("backdated_membership", {
    p_member: parsed.data.memberId,
    p_plan: parsed.data.planId,
    p_trainer: parsed.data.trainerId,
    p_amount: parsed.data.amount,
    p_sessions: parsed.data.sessions,
    p_method: parsed.data.method,
    p_paid_on: parsed.data.paidOn,
    p_start_date: parsed.data.startDate,
  });
  if (error) return rpcFailure(error);

  revalidateFinance();
  revalidatePath("/members");
  return { success: me.finance.saved };
}

/** S-22 tab Dnevne karte (BR-120, BR-100). */
export async function saveBackdatedDayPasses(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await requireOwner();
  const parsed = backdatedDayPassSchema.safeParse({
    quantity: formData.get("quantity") ?? "",
    method: formData.get("method") ?? "",
    paidOn: formData.get("paidOn") ?? "",
  });
  if (!parsed.success)
    return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const tooLate = await futureDate(staff.gym_id, "paidOn", parsed.data.paidOn);
  if (tooLate) return tooLate;

  const supabase = await createClient();
  const { error } = await supabase.rpc("backdated_day_passes", {
    p_qty: parsed.data.quantity,
    p_method: parsed.data.method,
    p_paid_on: parsed.data.paidOn,
  });
  if (error) return rpcFailure(error);

  revalidateFinance();
  return { success: me.finance.saved };
}

/** S-22 tab Zamjenska kartica (BR-120, BR-034). */
export async function saveBackdatedCardFee(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await requireOwner();
  const parsed = backdatedCardFeeSchema.safeParse({
    memberId: formData.get("memberId") ?? "",
    method: formData.get("method") ?? "",
    paidOn: formData.get("paidOn") ?? "",
  });
  if (!parsed.success)
    return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const tooLate = await futureDate(staff.gym_id, "paidOn", parsed.data.paidOn);
  if (tooLate) return tooLate;

  const supabase = await createClient();
  const { error } = await supabase.rpc("backdated_card_fee", {
    p_member: parsed.data.memberId,
    p_method: parsed.data.method,
    p_paid_on: parsed.data.paidOn,
  });
  if (error) return rpcFailure(error);

  revalidateFinance();
  return { success: me.finance.saved };
}

/**
 * S-19 [Zaključi smjenu] (BR-114, P-12): the owner closes an open shift, with the counted
 * cash optional, and the report goes out exactly as it does for a receptionist's own
 * close (BR-117). The owner's own session is untouched — only a receptionist is signed
 * out by a close.
 */
export async function closeAnyShift(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireOwner();
  const parsed = closeAnyShiftSchema.safeParse({
    shiftId: formData.get("shiftId") ?? "",
    countedCash: formData.get("countedCash") ?? "",
  });
  if (!parsed.success)
    return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("close_shift", {
    p_shift: parsed.data.shiftId,
    p_counted_cash: parsed.data.countedCash,
  });
  if (error) return rpcFailure(error);

  await deliverShiftReport(parsed.data.shiftId);
  revalidateFinance();
  return { success: me.finance.shiftClosed };
}

/** S-19 [Pošalji ponovo] (BR-118): another attempt at a report that did not go out. */
export async function resendShiftReport(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await requireOwner();
  // SUSPECT-10: a hand-rolled shape let through text that is not a UUID at all, and the
  // query then failed with 22P02 whose error nobody read, so a malformed identifier
  // answered "Nemate dozvolu" instead of saying the input was wrong.
  const parsed = resendShiftSchema.safeParse({ shiftId: formData.get("shiftId") });
  if (!parsed.success) return { error: me.errors.E_VALIDATION };

  // The report pipeline runs with the service role, so the shift is checked against the
  // owner's own gym first: a shift from anywhere else is simply not theirs to resend.
  const supabase = await createClient();
  const { data: shift, error } = await supabase
    .from("shifts")
    .select("id")
    .eq("id", parsed.data.shiftId)
    .eq("gym_id", staff.gym_id)
    .maybeSingle<{ id: string }>();
  if (error) return rpcFailure(error);
  if (!shift) return { error: me.errors.E_FORBIDDEN };

  const outcome = await deliverShiftReport(parsed.data.shiftId);
  revalidatePath("/finance/shifts");
  return outcome === "sent"
    ? { success: me.finance.resent }
    : { error: me.finance.resendFailed };
}
