import type { Metadata } from "next";
import { PeriodPicker } from "@/features/finance/components/period-picker";
import {
  ShiftsScreen,
  type ShiftRow,
} from "@/features/finance/components/shifts-screen";
import { periodFromParams, presetsFor } from "@/features/finance/period";
import { requireStaff } from "@/lib/auth";
import { gymToday } from "@/lib/gym-date";
import { me } from "@/lib/i18n/me";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `${me.finance.shiftsTitle} — ${me.app.name}`,
};

/**
 * S-19 (F-16 for the owner). The layout has already refused the receptionist. D-80: a
 * manager lists the shifts of Danas, Ova sedmica or Ovaj mjesec, without the report or
 * its email (`fin_shifts` does not send them), and closes nothing (P-12).
 */
export default async function ShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const staff = await requireStaff();
  const presets = presetsFor(staff.role);
  const period = periodFromParams(
    await searchParams,
    await gymToday(staff.gym_id),
    presets,
  );

  const supabase = await createClient();
  const shifts = await supabase.rpc("fin_shifts", {
    p_from: period.from,
    p_to: period.to,
  });

  return (
    <div className="grid grid-cols-1 gap-6">
      <PeriodPicker period={period} presets={presets} />
      <ShiftsScreen
        rows={(shifts.data as ShiftRow[] | null) ?? []}
        readOnly={staff.role === "manager"}
      />
    </div>
  );
}
