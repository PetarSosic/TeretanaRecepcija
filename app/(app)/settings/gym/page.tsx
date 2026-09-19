import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  GymScreen,
  type BackupStatus,
  type Category,
  type GymSettings,
} from "@/features/settings/components/gym-screen";
import { requireStaff } from "@/lib/auth";
import { me } from "@/lib/i18n/me";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `${me.settings.gymTitle} — ${me.app.name}`,
};

// S-27. P-63: owner and admin only.
export default async function GymPage() {
  const staff = await requireStaff();
  if (staff.role !== "owner" && staff.role !== "admin") notFound();

  const supabase = await createClient();
  const [settings, categories, backup] = await Promise.all([
    supabase
      .from("gym_settings")
      .select(
        // BR-003: the two prices as text.
        "card_replacement_price::text, personal_min_price::text, expiry_reminder_days, auto_close_time, double_scan_seconds, shift_report_emails, backup_emails, logo_path",
      )
      .eq("gym_id", staff.gym_id)
      .single<GymSettings>(),
    supabase
      .from("expense_categories")
      .select("id, name, is_salary, is_system, is_active")
      .order("name")
      .returns<Category[]>(),
    // BR-163: the newest attempt, whatever came of it. RLS keeps this to the gym.
    supabase
      .from("backup_runs")
      .select("run_date, status, error, started_at, finished_at")
      .order("run_date", { ascending: false })
      .order("attempt", { ascending: false })
      .limit(1)
      .maybeSingle<BackupStatus>(),
  ]);

  if (!settings.data) notFound();

  // The bucket is private (doc 07 §6), so the logo is shown through a short-lived
  // signed URL rather than a public link.
  let logoUrl: string | null = null;
  if (settings.data.logo_path) {
    const signed = await createAdminClient()
      .storage.from("gym-assets")
      .createSignedUrl(settings.data.logo_path, 60 * 10);
    logoUrl = signed.data?.signedUrl ?? null;
  }

  return (
    <GymScreen
      settings={settings.data}
      categories={categories.data ?? []}
      logoUrl={logoUrl}
      backup={backup.data ?? null}
    />
  );
}
