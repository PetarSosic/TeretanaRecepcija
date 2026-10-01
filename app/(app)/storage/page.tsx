import type { Metadata } from "next";
import {
  StorageScreen,
  type StorageProduct,
} from "@/features/storage/components/storage-screen";
import type { EditableProduct } from "@/features/storage/components/product-editor";
import { requireStaff } from "@/lib/auth";
import { gymToday } from "@/lib/gym-date";
import { me } from "@/lib/i18n/me";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `${me.storage.title} — ${me.app.name}`,
};

// S-13. P-40 and P-41: every role sees the active products and records sales and
// stock-ins. storage_products (0016) carries no stock value or profit (BR-144).
// D-76 (P-42): every role but the receptionist also adds and edits products here, and
// sees the deactivated ones, which only they can bring back.
export default async function StoragePage() {
  const staff = await requireStaff();
  const canEdit = staff.role !== "receptionist";
  const supabase = await createClient();
  const [{ data, error }, { data: inactive }, today] = await Promise.all([
    supabase
      .rpc("storage_products")
      .select(
        "id, name, stock, current_purchase_price::text, sale_price::text",
      ),
    canEdit
      ? supabase
          .from("products")
          // BR-003: both prices as text.
          .select(
            "id, name, current_purchase_price::text, sale_price::text, is_active",
          )
          .eq("is_active", false)
          .order("name")
          .returns<EditableProduct[]>()
      : Promise.resolve({ data: null }),
    gymToday(staff.gym_id),
  ]);
  if (error) console.error(`storage_products: ${error.message}`);
  return (
    <StorageScreen
      products={(data ?? []) as StorageProduct[]}
      inactive={inactive ?? []}
      canEdit={canEdit}
      today={today}
      // D-95: an earlier payment day for Nova roba is the owner's and the admin's.
      canBackdate={staff.role === "owner" || staff.role === "admin"}
    />
  );
}
