"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getErrorMessage } from "@/lib/errors";
import { me } from "@/lib/i18n/me";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/action-state";

const CARDS_PATH = "/settings/cards";

// BR-036: between 1 and 100 cards in one batch.
const batchSchema = z.object({
  quantity: z.coerce
    .number()
    .int()
    .min(1, me.cards.quantityInvalid)
    .max(100, me.cards.quantityInvalid),
});

export async function generateCardBatch(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = batchSchema.safeParse({ quantity: formData.get("quantity") });
  if (!parsed.success)
    return { fieldErrors: { quantity: me.cards.quantityInvalid } };

  const supabase = await createClient();
  const { error } = await supabase.rpc("generate_card_batch", {
    p_qty: parsed.data.quantity,
  });
  if (error) {
    const code = error.message.trim();
    if (!code.startsWith("E_")) console.error(`generate_card_batch: ${code}`);
    return { error: getErrorMessage(code) };
  }

  revalidatePath(CARDS_PATH);
  return { success: me.cards.generated };
}
