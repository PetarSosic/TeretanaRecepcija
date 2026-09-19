"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { me } from "@/lib/i18n/me";
import { fieldErrorsOf, rpcFailure } from "@/lib/rpc";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/action-state";
import {
  correctPaymentSchema,
  dayPassSchema,
  deskExpenseSchema,
  voidSchema,
} from "./schemas";

const TODAY_PATH = "/payments/today";

function revalidateMoney(memberId?: string | null) {
  revalidatePath(TODAY_PATH);
  revalidatePath("/reception");
  if (memberId) revalidatePath(`/members/${memberId}`);
}

/** S-10 and BR-100: day passes at the current price, on the open shift. */
export async function sellDayPasses(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();
  const parsed = dayPassSchema.safeParse({
    quantity: formData.get("quantity"),
    method: formData.get("method") ?? "",
  });
  if (!parsed.success)
    return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("sell_day_passes", {
      p_qty: parsed.data.quantity,
      p_method: parsed.data.method,
    })
    .select("quantity, amount::text")
    .single<{ quantity: number; amount: string }>();
  if (error || !data)
    return error ? rpcFailure(error) : { error: me.errors.unexpected };

  revalidateMoney();
  // US-12.1 AC1: `Prodato: <N> × dnevna karta = <iznos>`.
  return {
    success: me.dayPass.sold
      .replace("{qty}", String(data.quantity))
      .replace("{amount}", formatMoney(data.amount)),
  };
}

/** S-12 [Ispravi] (BR-094): the RPC decides who may change what (AS-14). */
export async function correctPayment(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();
  const parsed = correctPaymentSchema.safeParse({
    paymentId: formData.get("paymentId"),
    method: formData.get("method") ?? "",
    note: formData.get("note") ?? "",
    amount: formData.get("amount") ?? "",
  });
  if (!parsed.success)
    return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("correct_payment", {
      p_payment: parsed.data.paymentId,
      p_method: parsed.data.method,
      p_note: parsed.data.note,
      p_amount: parsed.data.amount,
    })
    .select("member_id")
    .single<{ member_id: string | null }>();
  if (error) return rpcFailure(error);

  revalidateMoney(data?.member_id);
  return { success: me.payments.corrected };
}

/** S-12 [Poništi] on a payment (BR-095, E16). */
export async function voidPayment(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();
  const parsed = voidSchema.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success)
    return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("void_payment", {
      p_payment: parsed.data.id,
      p_reason: parsed.data.reason,
    })
    .select("member_id")
    .single<{ member_id: string | null }>();
  if (error) return rpcFailure(error);

  revalidateMoney(data?.member_id);
  revalidatePath("/members");
  return { success: me.payments.voidedDone };
}

/** S-11 and BR-132: a small expense paid from the till. */
export async function recordDeskExpense(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();
  const parsed = deskExpenseSchema.safeParse({
    categoryId: formData.get("categoryId") ?? "",
    description: formData.get("description") ?? "",
    amount: formData.get("amount") ?? "",
  });
  if (!parsed.success)
    return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_desk_expense", {
    p_category: parsed.data.categoryId,
    p_description: parsed.data.description,
    p_amount: parsed.data.amount,
  });
  if (error) return rpcFailure(error);

  revalidateMoney();
  return { success: me.deskExpense.saved };
}

/** S-12 [Poništi] on an expense (BR-135). */
export async function voidExpense(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();
  const parsed = voidSchema.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success)
    return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_expense", {
    p_expense: parsed.data.id,
    p_reason: parsed.data.reason,
  });
  if (error) return rpcFailure(error);

  revalidateMoney();
  return { success: me.payments.voidedDone };
}
