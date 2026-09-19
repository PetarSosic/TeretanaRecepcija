import type { Metadata } from "next";
import {
  PaymentsToday,
  type TodayExpense,
  type TodayPayment,
  type TodaySale,
} from "@/features/payments/components/payments-today";
import { formatDate } from "@/lib/format";
import { requireStaff } from "@/lib/auth";
import { me } from "@/lib/i18n/me";
import { getOpenShift } from "@/lib/shift";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `${me.payments.title} — ${me.app.name}`,
};

/** Midnight UTC of the day before the gym's today: safely earlier than its local start. */
function dayBefore(today: string): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString();
}

/** BR-003: quantity × unit price, in cents, never floats. */
function saleAmount(unitPrice: string, quantity: number): string {
  const [whole, fraction = ""] = unitPrice.split(".");
  const cents =
    (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2))) *
    BigInt(quantity);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

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

  const [payments, expenses, sales] = await Promise.all([
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
        "id, created_at, description, amount::text, method, shift_id, created_by, voided_at, void_reason, stock_movement_id, expense_categories(name)",
      )
      .eq("spent_on", today as string)
      .order("created_at", { ascending: false })
      .returns<
        (Omit<TodayExpense, "category" | "entered_by"> & {
          expense_categories: { name: string } | null;
        })[]
      >(),
    // BR-142 and BR-144: bar sales since yesterday, narrowed below to the gym's
    // today (the RLS already limits everyone but the owner to today).
    supabase
      .from("stock_movements")
      .select(
        "id, created_at, quantity, unit_price::text, method, shift_id, created_by, voided_at, void_reason, products(name)",
      )
      .eq("type", "out")
      .gte("created_at", dayBefore(today as string))
      .order("created_at", { ascending: false })
      .returns<
        {
          id: string;
          created_at: string;
          quantity: number;
          unit_price: string;
          method: "cash" | "card";
          shift_id: string | null;
          created_by: string;
          voided_at: string | null;
          void_reason: string | null;
          products: { name: string } | null;
        }[]
      >(),
  ]);

  // Doc 07 §6 hides colleagues' staff rows; staff_names gives only the names needed.
  const ids = [
    ...new Set([
      ...(payments.data ?? []).map((row) => row.created_by),
      ...(expenses.data ?? []).map((row) => row.created_by),
      ...(sales.data ?? []).map((row) => row.created_by),
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
      sales={(sales.data ?? [])
        .filter(
          (row) => formatDate(row.created_at) === formatDate(today as string),
        )
        .map(({ products, unit_price, created_by, ...row }): TodaySale => ({
          ...row,
          product: products?.name ?? "—",
          amount: saleAmount(unit_price, row.quantity),
          entered_by: names.get(created_by) ?? "—",
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
