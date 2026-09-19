"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { me } from "@/lib/i18n/me";
import { deliverShiftReport } from "@/lib/shift-report";
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
  const { data, error } = await supabase.rpc("take_over_shift", {
    p_counted_cash: parsed.data.countedCash,
  });
  if (error) {
    const code = error.message.trim();
    if (!code.startsWith("E_")) console.error(`take_over_shift: ${code}`);
    return { error: getErrorMessage(code) };
  }

  // BR-111 and M-10: the shift that was taken over gets its report and email (BR-117).
  const closed = (data as { closed_shift?: { id: string } | null })
    .closed_shift;
  if (closed?.id) await deliverShiftReport(closed.id);

  // The header badge lives in the app layout, so it must be re-rendered with the
  // shift that was just opened.
  revalidatePath("/", "layout");
  redirect("/reception");
}

// BR-114: the counted cash is required when a receptionist closes her shift.
const closeSchema = z.object({
  shiftId: z.string().uuid(),
  countedCash: z
    .string()
    .trim()
    .transform((value) => value.replace(",", "."))
    .refine((value) => /^\d{1,8}(\.\d{1,2})?$/.test(value), {
      message: me.closeShift.countedInvalid,
    }),
});

/**
 * Doc 08 §6 closeShiftAndReport (BR-114): close the shift with the caller's session, then
 * build, store and email the report (BR-117; a failed email never undoes the close,
 * BR-118), sign out, and land on the login page with `Smjena je zaključena.`
 */
export async function closeShiftAndReport(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireStaff();
  const parsed = closeSchema.safeParse({
    shiftId: formData.get("shiftId"),
    countedCash: formData.get("countedCash") ?? "",
  });
  if (!parsed.success)
    return { fieldErrors: { countedCash: me.closeShift.countedInvalid } };

  const supabase = await createClient();
  const { error } = await supabase.rpc("close_shift", {
    p_shift: parsed.data.shiftId,
    p_counted_cash: parsed.data.countedCash,
  });
  if (error) {
    const code = error.message.trim();
    if (!code.startsWith("E_")) console.error(`close_shift: ${code}`);
    return { error: getErrorMessage(code) };
  }

  await deliverShiftReport(parsed.data.shiftId);
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login?closed=1");
}
