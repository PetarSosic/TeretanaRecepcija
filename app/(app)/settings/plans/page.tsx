import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  PlansScreen,
  type Plan,
} from "@/features/settings/components/plans-screen";
import { requireStaff } from "@/lib/auth";
import { me } from "@/lib/i18n/me";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `${me.settings.plansTitle} — ${me.app.name}`,
};

type PlanRow = Omit<Plan, "gym_fixed_amount" | "trainer_share_pct">;

// S-25. P-62: owner and admin only.
export default async function PlansPage() {
  const staff = await requireStaff();
  if (staff.role !== "owner" && staff.role !== "admin") notFound();

  const supabase = await createClient();
  const [plans, finance] = await Promise.all([
    supabase
      .from("plans")
      .select(
        // BR-003: price as text, so no money value passes through a float.
        "id, name, kind, duration_value, duration_unit, price::text, covers_gym, covers_group, covers_personal, gym_visit_limit, group_session_limit, requires_trainer, sort_order, is_active",
      )
      // Doc 06: the table shows every plan, inactive ones included.
      .order("sort_order")
      .returns<PlanRow[]>(),
    supabase
      .from("plan_finance")
      .select("plan_id, gym_fixed_amount::text, trainer_share_pct::text")
      .returns<
        {
          plan_id: string;
          gym_fixed_amount: string;
          trainer_share_pct: string | null;
        }[]
      >(),
  ]);

  const financeOf = new Map(
    (finance.data ?? []).map((row) => [row.plan_id, row]),
  );

  return (
    <PlansScreen
      plans={(plans.data ?? []).map((plan) => ({
        ...plan,
        gym_fixed_amount: financeOf.get(plan.id)?.gym_fixed_amount ?? "0.00",
        trainer_share_pct: financeOf.get(plan.id)?.trainer_share_pct ?? null,
      }))}
    />
  );
}
