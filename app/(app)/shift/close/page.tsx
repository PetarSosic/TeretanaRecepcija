import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CloseShiftScreen } from "@/features/shifts/components/close-shift-screen";
import type { ShiftReport } from "@/features/shifts/types";
import { requireStaff } from "@/lib/auth";
import { me } from "@/lib/i18n/me";
import { getOpenShift } from "@/lib/shift";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `${me.closeShift.title} — ${me.app.name}`,
};

// S-14. P-11 and doc 06 §2: only a receptionist closes her own shift here; the owner
// closes any shift from S-19 (M-12).
export default async function CloseShiftPage() {
  const staff = await requireStaff();
  if (staff.role !== "receptionist") notFound();

  const shift = await getOpenShift();
  if (!shift?.is_mine)
    return (
      <>
        <h1 className="mb-4 text-2xl font-semibold tracking-tight">
          {me.closeShift.title}
        </h1>
        <p className="text-muted-foreground">{me.closeShift.noShift}</p>
      </>
    );

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("shift_summary", {
    p_shift: shift.id,
  });
  if (error || !data) {
    console.error(`shift_summary: ${error?.message}`);
    throw new Error("E_UNEXPECTED");
  }
  return <CloseShiftScreen shiftId={shift.id} summary={data as ShiftReport} />;
}
