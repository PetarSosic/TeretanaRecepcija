import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  RecurringScreen,
  type RecurringOverview,
} from "@/features/finance/components/recurring-screen";
import type { Category } from "@/features/settings/components/categories-section";
import { requireStaff } from "@/lib/auth";
import { gymToday } from "@/lib/gym-date";
import { me } from "@/lib/i18n/me";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `${me.finance.recurringTitle} — ${me.app.name}`,
};

/**
 * S-30 (D-93, BR-136). The layout has already refused the receptionist; fixed expenses
 * hold salaries, which never reach a manager (D-80), so a manager gets 404 here and
 * `fin_recurring_expenses` refuses them again.
 */
export default async function RecurringExpensesPage() {
  const staff = await requireStaff();
  if (staff.role !== "owner" && staff.role !== "admin") notFound();

  const supabase = await createClient();
  const [overview, categories, today] = await Promise.all([
    supabase.rpc("fin_recurring_expenses"),
    supabase
      .from("expense_categories")
      .select("id, name, is_salary, is_system, is_active")
      .order("name")
      .returns<Category[]>(),
    gymToday(staff.gym_id),
  ]);
  const data = (overview.data as RecurringOverview | null) ?? {
    items: [],
    salary_total: "0.00",
    other_total: "0.00",
    total: "0.00",
  };

  return (
    <RecurringScreen
      overview={data}
      categories={categories.data ?? []}
      thisMonth={today.slice(0, 7)}
    />
  );
}
