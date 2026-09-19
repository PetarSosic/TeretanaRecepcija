import type { Metadata } from "next";
import {
  BackdatedScreen,
  type PlanOption,
  type SlotOption,
  type TrainerOption,
} from "@/features/finance/components/backdated-screen";
import type { PickableMember } from "@/features/finance/components/member-picker";
import { requireStaff } from "@/lib/auth";
import { gymToday } from "@/lib/gym-date";
import { me } from "@/lib/i18n/me";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `${me.finance.backdatedTitle} — ${me.app.name}`,
};

type SlotRow = {
  id: string;
  trainer_id: string;
  weekday: number;
  starts_at: string;
  programs: { name: string } | null;
  trainers: { full_name: string } | null;
};

/** S-22 (F-23). The layout has already refused every role but owner and admin. */
export default async function BackdatedPage() {
  const staff = await requireStaff();
  const today = await gymToday(staff.gym_id);

  const supabase = await createClient();
  const [members, plans, trainers, slots] = await Promise.all([
    supabase
      .from("members")
      .select("id, member_number, first_name, last_name, phone")
      .eq("is_anonymized", false)
      .order("member_number")
      .returns<PickableMember[]>(),
    supabase
      .from("plans")
      .select("id, name, kind, requires_trainer, price::text")
      .eq("is_active", true)
      .neq("kind", "day_pass")
      .order("sort_order")
      .order("name")
      .returns<PlanOption[]>(),
    supabase
      .from("trainers")
      .select("id, full_name")
      .eq("is_active", true)
      .order("full_name")
      .returns<TrainerOption[]>(),
    supabase
      .from("class_slots")
      .select("id, trainer_id, weekday, starts_at, programs(name), trainers(full_name)")
      .eq("is_active", true)
      .order("weekday")
      .order("starts_at")
      .returns<SlotRow[]>(),
  ]);

  const slotOptions: SlotOption[] = (slots.data ?? []).map((slot) => ({
    id: slot.id,
    trainer_id: slot.trainer_id,
    label: `${me.settings.weekdays[slot.weekday - 1]} ${slot.starts_at.slice(0, 5)} · ${slot.programs?.name ?? ""}`,
  }));

  return (
    <BackdatedScreen
      members={members.data ?? []}
      plans={plans.data ?? []}
      trainers={trainers.data ?? []}
      slots={slotOptions}
      today={today}
    />
  );
}
