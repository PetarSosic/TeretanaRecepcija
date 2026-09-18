import "server-only";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { SaleFields } from "./schemas";

// Server-only helpers shared by sellMembership and registerMember. They live outside the
// "use server" files so they never become actions the browser could call.

/** The S-08 field values as FormData carries them. */
export function saleFieldsFrom(formData: FormData) {
  return {
    planId: formData.get("planId") ?? "",
    planKind: formData.get("planKind") ?? "",
    requiresTrainer: formData.get("requiresTrainer") ?? "false",
    trainerId: formData.get("trainerId") ?? "",
    sessions: formData.get("sessions") ?? "",
    amount: formData.get("amount") ?? "",
    method: formData.get("method") ?? "",
    startOverride: formData.get("startOverride") ?? "",
  };
}

/** The RPC arguments sell_membership and register_member have in common. */
export function saleArguments(value: SaleFields) {
  return {
    p_plan: value.planId,
    p_trainer: value.requiresTrainer ? value.trainerId : null,
    p_amount: value.amount,
    p_sessions: value.planKind === "personal" ? value.sessions : null,
    p_method: value.method,
  };
}

/**
 * E_AMOUNT_BELOW_MIN names the minimum (doc 08 §5), which the RPC does not return, so
 * it is read from the settings every role may see (BR-012).
 */
export async function personalMinimumText(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("gym_settings")
    .select("personal_min_price::text")
    .maybeSingle<{ personal_min_price: string }>();
  return data ? formatMoney(data.personal_min_price).replace(" €", "") : "";
}
