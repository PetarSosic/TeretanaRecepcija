import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  CardsScreen,
  type Batch,
} from "@/features/settings/components/cards-screen";
import { requireStaff } from "@/lib/auth";
import { me } from "@/lib/i18n/me";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `${me.cards.title} — ${me.app.name}`,
};

// S-28. P-64: owners, managers and admins; RLS hides batches from receptionists too.
export default async function CardsPage() {
  const staff = await requireStaff();
  if (staff.role === "receptionist") notFound();

  const supabase = await createClient();
  const [batches, cards] = await Promise.all([
    supabase
      .from("card_batches")
      .select("id, created_at, quantity")
      .order("created_at", { ascending: false })
      .returns<Omit<Batch, "unassigned">[]>(),
    // US-03.1 AC3: how many of each batch are still empty (BR-031).
    supabase
      .from("cards")
      .select("batch_id, status")
      .eq("status", "unassigned")
      .returns<{ batch_id: string; status: string }[]>(),
  ]);

  const unassigned = new Map<string, number>();
  for (const card of cards.data ?? [])
    unassigned.set(card.batch_id, (unassigned.get(card.batch_id) ?? 0) + 1);

  return (
    <CardsScreen
      batches={(batches.data ?? []).map((batch) => ({
        ...batch,
        unassigned: unassigned.get(batch.id) ?? 0,
      }))}
    />
  );
}
