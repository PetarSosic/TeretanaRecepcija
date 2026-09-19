import type { Metadata } from "next";
import {
  StorageScreen,
  type StorageProduct,
} from "@/features/storage/components/storage-screen";
import { requireStaff } from "@/lib/auth";
import { me } from "@/lib/i18n/me";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `${me.storage.title} — ${me.app.name}`,
};

// S-13. P-40 and P-41: every role sees the active products and records sales and
// stock-ins. storage_products (0016) carries no stock value or profit (BR-144).
export default async function StoragePage() {
  await requireStaff();
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("storage_products")
    .select("id, name, stock, current_purchase_price::text, sale_price::text");
  if (error) console.error(`storage_products: ${error.message}`);
  return <StorageScreen products={(data ?? []) as StorageProduct[]} />;
}
