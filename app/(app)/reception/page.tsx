import type { Metadata } from "next";
import { loadSaleCatalog } from "@/features/memberships/catalog";
import { ReceptionScreen } from "@/features/reception/components/reception-screen";
import type { ReceptionPanel } from "@/features/reception/types";
import { requireStaff } from "@/lib/auth";
import { me } from "@/lib/i18n/me";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `${me.nav.reception} — ${me.app.name}`,
};

// S-03. P-20: every role scans, checks in and out, and sees "U teretani".
export default async function ReceptionPage() {
  const staff = await requireStaff();
  const supabase = await createClient();
  const [panel, catalog, dayPass, categories] = await Promise.all([
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
    // S-11 and BR-132: active categories that are not salary categories (D-37).
    supabase
      .from("expense_categories")
      .select("id, name")
      .eq("is_active", true)
      .eq("is_salary", false)
      .order("name")
      .returns<{ id: string; name: string }[]>(),
  ]);
  if (panel.error) console.error(`reception_panel: ${panel.error.message}`);

  return (
    <ReceptionScreen
      initialPanel={
        (panel.data as ReceptionPanel | null) ?? { in_gym: [], today_count: 0 }
      }
      catalog={catalog}
      dayPassPrice={dayPass.data?.price ?? null}
      expenseCategories={categories.data ?? []}
    />
  );
}
