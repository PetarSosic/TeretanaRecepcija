"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { gymToday } from "@/lib/gym-date";
import { me } from "@/lib/i18n/me";
import { fieldErrorsOf, rpcCode, rpcFailure } from "@/lib/rpc";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/action-state";
import { voidSchema } from "@/features/payments/schemas";
import { correctSaleSchema, saleSchema, stockInSchema } from "./schemas";

function revalidateStorage() {
  revalidatePath("/storage");
  revalidatePath("/payments/today");
}

/** S-13 [Prodaja] (BR-142). E17: the stock level arrives in the error detail. */
export async function sellProduct(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();
  const parsed = saleSchema.safeParse({
    productId: formData.get("productId"),
    quantity: formData.get("quantity"),
    method: formData.get("method") ?? "",
  });
  if (!parsed.success)
    return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("stock_sale", {
    p_product: parsed.data.productId,
    p_qty: parsed.data.quantity,
    p_method: parsed.data.method,
  });
  if (error) {
    const code = rpcCode(error);
    if (code === "E_STOCK_INSUFFICIENT")
      return {
        fieldErrors: {
          quantity: getErrorMessage(code, { qty: error.details ?? "0" }),
        },
      };
    return rpcFailure(error);
  }

  revalidateStorage();
  return { success: me.storage.sold };
}

/** S-13 [Nova roba] (BR-141, D-55, D-95). */
export async function receiveStock(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await requireStaff();
  const parsed = stockInSchema.safeParse({
    productId: formData.get("productId"),
    quantity: formData.get("quantity"),
    unitCost: formData.get("unitCost") ?? "",
    description: formData.get("description") ?? "",
    spentOn: formData.get("spentOn") ?? "",
    method: formData.get("method") ?? "",
    fromTill: formData.get("fromTill") === "on",
    supplier: formData.get("supplier") ?? "",
    invoice: formData.get("invoice") ?? "",
    vat: formData.get("vat") ?? "unset",
  });
  if (!parsed.success)
    return { fieldErrors: fieldErrorsOf(parsed.error.issues) };
  const value = parsed.data;

  // D-95: an earlier payment day is the owner's and the admin's; for everyone else, and
  // from the till, it is today. SUSPECT-06: the future is refused here, under the field.
  const spentOn =
    (staff.role === "owner" || staff.role === "admin") && !value.fromTill
      ? value.spentOn
      : null;
  if (spentOn && spentOn > (await gymToday(staff.gym_id)))
    return { fieldErrors: { spentOn: me.finance.dateInvalid } };

  const supabase = await createClient();
  const { error } = await supabase.rpc("stock_in", {
    p_product: value.productId,
    p_qty: value.quantity,
    p_unit_cost: value.unitCost,
    p_from_till: value.fromTill,
    // AS-17: "Van kase" is stored as no method at all.
    p_method: value.method === "none" ? null : value.method,
    p_spent_on: spentOn,
    p_description: value.description || null,
    p_supplier: value.supplier || null,
    p_invoice: value.invoice || null,
    p_vat: value.vat === "unset" ? null : value.vat === "yes",
  });
  if (error) {
    if (rpcCode(error) === "E_STOCK_COST_INVALID")
      return {
        fieldErrors: { unitCost: getErrorMessage("E_STOCK_COST_INVALID") },
      };
    return rpcFailure(error);
  }

  revalidateStorage();
  return { success: me.storage.received };
}

/** S-12 [Ispravi] on a bar sale: the method only (BR-094). */
export async function correctSale(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();
  const parsed = correctSaleSchema.safeParse({
    movementId: formData.get("movementId"),
    method: formData.get("method") ?? "",
  });
  if (!parsed.success)
    return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("correct_sale", {
    p_movement: parsed.data.movementId,
    p_method: parsed.data.method,
  });
  if (error) return rpcFailure(error);

  revalidateStorage();
  return { success: me.payments.corrected };
}

/** S-12 [Poništi] on a bar sale (BR-095): the quantity returns to stock. */
export async function voidSale(
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
  const { error } = await supabase.rpc("void_stock_movement", {
    p_movement: parsed.data.id,
    p_reason: parsed.data.reason,
  });
  if (error) return rpcFailure(error);

  revalidateStorage();
  return { success: me.payments.voidedDone };
}
