"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { me } from "@/lib/i18n/me";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/action-state";

/** BR-111: the state the login flow and S-02 both work from. */
export type ShiftState = "opened" | "resumed" | "gate" | "none" | "taken_over";

export async function resolveLoginShift(): Promise<ShiftState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolve_login_shift");
  if (error) {
    console.error(`resolve_login_shift: ${error.message}`);
    return "none";
  }
  return (data as { state: ShiftState }).state;
}

// AS-10: the counted cash for the shift being taken over is optional.
const takeOverSchema = z.object({
  countedCash: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value.replace(",", ".")))
    .refine((value) => value === null || /^\d+(\.\d{1,2})?$/.test(value), {
      message: me.shift.cashInvalid,
    })
    .transform((value) => (value === null ? null : Number(value))),
});

/**
 * BR-111 and E19: close the other receptionist's shift as a takeover and open mine.
 * S-02 also covers the case where that shift was closed while the screen was open:
 * the RPC then simply opens a new shift and the user continues to reception.
 */
export async function takeOverShift(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();
  const parsed = takeOverSchema.safeParse({
    countedCash: formData.get("countedCash") ?? "",
  });
  if (!parsed.success)
    return { fieldErrors: { countedCash: me.shift.cashInvalid } };

  const supabase = await createClient();
  const { error } = await supabase.rpc("take_over_shift", {
    p_counted_cash: parsed.data.countedCash,
  });
  if (error) {
    const code = error.message.trim();
    if (!code.startsWith("E_")) console.error(`take_over_shift: ${code}`);
    return { error: getErrorMessage(code) };
  }

  // The header badge lives in the app layout, so it must be re-rendered with the
  // shift that was just opened.
  revalidatePath("/", "layout");
  redirect("/reception");
}
