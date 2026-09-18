import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ProductsScreen,
  type Product,
} from "@/features/settings/components/products-screen";
import { requireStaff } from "@/lib/auth";
import { me } from "@/lib/i18n/me";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `${me.settings.productsTitle} — ${me.app.name}`,
};

// S-26. P-42: only the owner and admin add products or change the sale price.
export default async function ProductsPage() {
  const staff = await requireStaff();
  if (staff.role !== "owner" && staff.role !== "admin") notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    // BR-003: both prices as text.
    .select(
      "id, name, current_purchase_price::text, sale_price::text, is_active",
    )
    .order("name")
    .returns<Product[]>();

  return <ProductsScreen products={data ?? []} />;
}
