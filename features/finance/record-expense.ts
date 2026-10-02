import { gymToday } from "@/lib/gym-date";
import { me } from "@/lib/i18n/me";
import { fieldErrorsOf, rpcFailure } from "@/lib/rpc";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/action-state";
import { expenseSchema } from "./schemas";

/**
 * BR-133: the expense form's fields, checked and sent to record_expense. S-17 [Novi
 * trošak] and, since D-98, the desk's [Trošak] (S-11) share it; the RPC decides what each
 * role may record. Returns the failure to show, or null once the expense is saved.
 */
export async function submitExpense(
  gymId: string,
  formData: FormData,
): Promise<ActionState | null> {
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

  // SUSPECT-06: only the database knows the gym's today (BR-001), so the bound is checked
  // here and the message lands under its field.
  if (parsed.data.spentOn > (await gymToday(gymId)))
    return { fieldErrors: { spentOn: me.finance.dateInvalid } };

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
  return error ? rpcFailure(error) : null;
}
