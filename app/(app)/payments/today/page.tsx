import type { Metadata } from "next";
import {
  PaymentsToday,
  type TodayExpense,
  type TodayPayment,
} from "@/features/payments/components/payments-today";
import { requireStaff } from "@/lib/auth";
import { me } from "@/lib/i18n/me";
import { getOpenShift } from "@/lib/shift";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `${me.payments.title} — ${me.app.name}`,
};

type MemberRef = {
  member_number: number;
  first_name: string;
  last_name: string;
} | null;

// S-12. P-29: every role sees today's payments that are not back-dated; P-33 and BR-134:
// the owner sees today's expenses of everyone, the others only their own (RLS).
export default async function PaymentsTodayPage() {
  const staff = await requireStaff();
  const isOwner = staff.role === "owner" || staff.role === "admin";
  const supabase = await createClient();
  const [{ data: today }, shift] = await Promise.all([
    supabase.rpc("gym_today", { p_gym: staff.gym_id }),
    getOpenShift(),
  ]);

  const [payments, expenses] = await Promise.all([
    supabase
      .from("payments")
      .select(
        "id, created_at, kind, quantity, amount::text, method, note, shift_id, voided_at, void_reason, created_by, plans(name), members(member_number, first_name, last_name)",
      )
      .eq("paid_on", today as string)
      .eq("is_backdated", false)
      .order("created_at", { ascending: false })
      .returns<
        (Omit<TodayPayment, "plan_name" | "member" | "entered_by"> & {
          created_by: string;
          plans: { name: string } | null;
          members: MemberRef;
        })[]
      >(),
    supabase
      .from("expenses")
      .select(
        "id, created_at, description, amount::text, method, shift_id, created_by, voided_at, void_reason, expense_categories(name)",
      )
      .eq("spent_on", today as string)
      .order("created_at", { ascending: false })
      .returns<
        (Omit<TodayExpense, "category" | "entered_by"> & {
          expense_categories: { name: string } | null;
        })[]
      >(),
  ]);

  // Doc 07 §6 hides colleagues' staff rows; staff_names gives only the names needed.
  const ids = [
    ...new Set([
      ...(payments.data ?? []).map((row) => row.created_by),
      ...(expenses.data ?? []).map((row) => row.created_by),
    ]),
  ];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data } = await supabase.rpc("staff_names", { p_ids: ids });
    for (const row of (data ?? []) as { id: string; full_name: string }[])
      names.set(row.id, row.full_name);
  }
  const memberLabel = (member: MemberRef) =>
    member
      ? `#${member.member_number} ${member.first_name} ${member.last_name}`
      : null;

  return (
    <PaymentsToday
      payments={(payments.data ?? []).map(({ plans, members, ...row }) => ({
        ...row,
        plan_name: plans?.name ?? null,
        member: memberLabel(members),
        entered_by: names.get(row.created_by) ?? "—",
      }))}
      expenses={(expenses.data ?? []).map(({ expense_categories, ...row }) => ({
        ...row,
        category: expense_categories?.name ?? "—",
        entered_by: names.get(row.created_by) ?? "—",
      }))}
      openShiftId={shift?.id ?? null}
      isOwner={isOwner}
      staffId={staff.id}
    />
  );
}
