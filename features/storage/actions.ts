"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
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

/** S-13 [Nova roba] (BR-141, D-55). */
export async function receiveStock(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();
  const parsed = stockInSchema.safeParse({
    productId: formData.get("productId"),
    quantity: formData.get("quantity"),
    unitCost: formData.get("unitCost") ?? "",
    payment: formData.get("payment") ?? "",
  });
  if (!parsed.success)
    return { fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("stock_in", {
    p_product: parsed.data.productId,
    p_qty: parsed.data.quantity,
    p_unit_cost: parsed.data.unitCost,
    p_from_till: parsed.data.payment === "till",
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
