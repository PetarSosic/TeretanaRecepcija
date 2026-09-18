import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  TrainersScreen,
  type Assignment,
  type Program,
  type Slot,
  type Trainer,
} from "@/features/settings/components/trainers-screen";
import { requireStaff } from "@/lib/auth";
import { me } from "@/lib/i18n/me";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `${me.settings.trainersTitle} — ${me.app.name}`,
};

// S-24. P-60: owner, manager and admin. Doc 04 §2 point 3 answers others with 404.
export default async function TrainersPage() {
  const staff = await requireStaff();
  if (staff.role === "receptionist") notFound();
  // BR-026 and US-22.1 AC3: fees are for owners and admins only, and RLS enforces it
  // as well — trainer_finance simply returns nothing for a manager.
  const canSeeFees = staff.role === "owner" || staff.role === "admin";

  const supabase = await createClient();
  const [trainers, fees, programs, assignments, slots] = await Promise.all([
    supabase
      .from("trainers")
      .select("id, full_name, is_active")
      .order("full_name")
      .returns<Trainer[]>(),
    canSeeFees
      ? supabase
          .from("trainer_finance")
          // BR-003: read money as text, never as a JSON number.
          .select("trainer_id, personal_gym_fee::text, group_share_pct::text")
          .returns<
            {
              trainer_id: string;
              personal_gym_fee: string | null;
              group_share_pct: string | null;
            }[]
          >()
      : Promise.resolve({ data: null }),
    supabase
      .from("programs")
      .select("id, name, kind, is_active")
      .order("name")
      .returns<Program[]>(),
    supabase
      .from("trainer_programs")
      .select("trainer_id, program_id")
      .returns<Assignment[]>(),
    supabase
      .from("class_slots")
      .select("id, program_id, trainer_id, weekday, starts_at, is_active")
      .order("weekday")
      .order("starts_at")
      .returns<Slot[]>(),
  ]);

  const financeOf = new Map(
    (fees.data ?? []).map((row) => [row.trainer_id, row]),
  );

  return (
    <TrainersScreen
      trainers={(trainers.data ?? []).map((trainer) => ({
        ...trainer,
        personal_gym_fee: canSeeFees
          ? (financeOf.get(trainer.id)?.personal_gym_fee ?? null)
          : undefined,
        // D-62: null here means the plan's percentage applies.
        group_share_pct: canSeeFees
          ? (financeOf.get(trainer.id)?.group_share_pct ?? null)
          : undefined,
      }))}
      programs={programs.data ?? []}
      assignments={assignments.data ?? []}
      slots={slots.data ?? []}
      canSeeFees={canSeeFees}
    />
  );
}
