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
  const [panel, catalog] = await Promise.all([
    supabase.rpc("reception_panel"),
    loadSaleCatalog(staff),
  ]);
  if (panel.error) console.error(`reception_panel: ${panel.error.message}`);

  return (
    <ReceptionScreen
      initialPanel={
        (panel.data as ReceptionPanel | null) ?? { in_gym: [], today_count: 0 }
      }
      catalog={catalog}
    />
  );
}
