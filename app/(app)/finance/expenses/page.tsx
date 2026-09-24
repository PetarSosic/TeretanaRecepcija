import type { Metadata } from "next";
import { PeriodPicker } from "@/features/finance/components/period-picker";
import {
  ExpensesScreen,
  type ExpenseRow,
  type StaffOption,
  type Trainer,
} from "@/features/finance/components/expenses-screen";
import { periodFromParams } from "@/features/finance/period";
import type { Category } from "@/features/settings/components/categories-section";
import { requireStaff } from "@/lib/auth";
import { gymToday } from "@/lib/gym-date";
import { me } from "@/lib/i18n/me";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `${me.finance.expensesTitle} — ${me.app.name}`,
};

/** S-17 (F-18). The finance layout has already refused every role but owner and admin. */
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
    categoryId?: string;
    method?: string;
    createdBy?: string;
    payoutTrainer?: string;
    payoutAmount?: string;
  }>;
}) {
  const staff = await requireStaff();
  const params = await searchParams;
  const today = await gymToday(staff.gym_id);
  const period = periodFromParams(params, today);

  const filters = {
    categoryId: params.categoryId ?? "",
    method: params.method ?? "",
    createdBy: params.createdBy ?? "",
  };

  const supabase = await createClient();
  const [expenses, categories, trainers, people] = await Promise.all([
    supabase.rpc("fin_expenses", {
      p_from: period.from,
      p_to: period.to,
      p_category: filters.categoryId || null,
      p_method: filters.method || null,
      p_created_by: filters.createdBy || null,
    }),
    supabase
      .from("expense_categories")
      .select("id, name, is_salary, is_system, is_active")
      .order("name")
      .returns<Category[]>(),
    supabase
      .from("trainers")
      .select("id, full_name")
      .eq("is_active", true)
      .order("full_name")
      .returns<Trainer[]>(),
    supabase
      .from("staff")
      .select("id, full_name")
      .order("full_name")
      .returns<StaffOption[]>(),
  ]);

  const categoryList = categories.data ?? [];
  // US-19.1 AC2: S-18 sends the payout here with the salary category already chosen.
  const salary = categoryList.find((category) => category.is_salary);
  const prefill =
    params.payoutTrainer && params.payoutAmount && salary
      ? {
          categoryId: salary.id,
          trainerId: params.payoutTrainer,
          // N-20: the field shows a decimal comma, as the rest of the UI (doc 02).
          amount: params.payoutAmount.replace(".", ","),
          description: me.finance.recordPayout,
        }
      : undefined;

  return (
    <div className="grid grid-cols-1 gap-6">
      <PeriodPicker period={period} />
      <ExpensesScreen
        rows={(expenses.data as ExpenseRow[] | null) ?? []}
        categories={categoryList}
        trainers={trainers.data ?? []}
        staff={people.data ?? []}
        filters={filters}
        period={period}
        today={today}
        prefill={prefill}
      />
    </div>
  );
}
