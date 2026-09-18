import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  UsersTable,
  type StaffRow,
} from "@/features/settings/components/users-table";
import { requireStaff } from "@/lib/auth";
import { me } from "@/lib/i18n/me";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `${me.users.title} — ${me.app.name}`,
};

// S-23. P-04: admins, owners and managers only; doc 04 §2 point 3 answers other roles
// with 404.
export default async function UsersPage() {
  const staff = await requireStaff();
  if (staff.role === "receptionist") notFound();

  // RLS already limits both queries to the caller's own gym (doc 07 §6), and
  // staff_credentials returns rows for an admin alone (D-59) — a manager or owner
  // asking for it gets nothing back, not someone else's password.
  const supabase = await createClient();
  const [{ data: rows }, { data: credentials }] = await Promise.all([
    supabase
      .from("staff")
      .select("id, full_name, username, email, role, is_active, created_at")
      .order("created_at", { ascending: true })
      .returns<StaffRow[]>(),
    staff.role === "admin"
      ? supabase
          .from("staff_credentials")
          .select("staff_id, password")
          .returns<{ staff_id: string; password: string }[]>()
      : Promise.resolve({ data: null }),
  ]);

  const passwords = new Map(
    (credentials ?? []).map((row) => [row.staff_id, row.password]),
  );

  return (
    <UsersTable
      rows={(rows ?? []).map((row) => ({
        ...row,
        password: passwords.get(row.id) ?? null,
      }))}
      callerRole={staff.role}
      callerStaffId={staff.id}
    />
  );
}
