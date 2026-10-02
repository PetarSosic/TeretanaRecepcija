import type { Metadata } from "next";
import type { Trainer } from "@/features/finance/components/expense-dialog";
import { loadSaleCatalog } from "@/features/memberships/catalog";
import { ReceptionScreen } from "@/features/reception/components/reception-screen";
import type { ReceptionPanel } from "@/features/reception/types";
import type { Category } from "@/features/settings/components/categories-section";
import { requireStaff } from "@/lib/auth";
import { gymToday } from "@/lib/gym-date";
import { me } from "@/lib/i18n/me";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `${me.nav.reception} — ${me.app.name}`,
};

// S-03. P-20: every role scans, checks in and out, and sees "U teretani".
export default async function ReceptionPage() {
  const staff = await requireStaff();
  const supabase = await createClient();
  // D-37 and D-80: salaries, and so payouts to a trainer, are the owner's alone.
  const isOwner = staff.role === "owner" || staff.role === "admin";
  let categoryQuery = supabase
    .from("expense_categories")
    .select("id, name, is_salary, is_system, is_active")
    .eq("is_active", true)
    .eq("is_system", false);
  if (!isOwner) categoryQuery = categoryQuery.eq("is_salary", false);
  const [panel, catalog, dayPass, categories, trainers, today] =
    await Promise.all([
      supabase.rpc("reception_panel"),
      loadSaleCatalog(staff),
      // S-10 and BR-100: the current day-pass price (the RPC charges its own reading).
      supabase
        .from("plans")
        .select("price::text")
        .eq("kind", "day_pass")
        .eq("is_active", true)
        .order("sort_order")
        .limit(1)
        .maybeSingle<{ price: string }>(),
      // S-11 (D-98): the BR-133 form's active categories, never Roba za prodaju, which
      // only Nova roba writes (D-92).
      categoryQuery.order("name").returns<Category[]>(),
      isOwner
        ? supabase
            .from("trainers")
            .select("id, full_name")
            .eq("is_active", true)
            .order("full_name")
            .returns<Trainer[]>()
        : null,
      // D-89: comes with the session, so it costs no call of its own.
      gymToday(staff.gym_id),
    ]);
  if (panel.error) console.error(`reception_panel: ${panel.error.message}`);

  return (
    <ReceptionScreen
      initialPanel={
        (panel.data as ReceptionPanel | null) ?? { in_gym: [], today_count: 0 }
      }
      catalog={catalog}
      dayPassPrice={dayPass.data?.price ?? null}
      expenseForm={{
        categories: categories.data ?? [],
        trainers: trainers?.data ?? [],
        today,
      }}
    />
  );
}
