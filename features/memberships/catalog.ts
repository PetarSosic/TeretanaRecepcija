import "server-only";
import type { Staff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type SalePlan = {
  id: string;
  name: string;
  kind: "gym" | "group" | "combo" | "personal";
  /** Decimal text; null only for Personalni (doc 07 §3). */
  price: string | null;
  requires_trainer: boolean;
};

export type SaleTrainer = {
  id: string;
  full_name: string;
  /** BR-023: assigned to an active program of that kind. */
  group: boolean;
  personal: boolean;
};

/** What S-05 and S-08 need to offer a sale, loaded once per page. */
export type SaleCatalog = {
  plans: SalePlan[];
  trainers: SaleTrainer[];
  personalMin: string;
  cardFee: string;
  /** BR-059 and BR-052 step 4: the owner (and admin, D-58) may change amount and start. */
  isOwner: boolean;
};

export async function loadSaleCatalog(staff: Staff): Promise<SaleCatalog> {
  const supabase = await createClient();
  const [plans, trainers, settings] = await Promise.all([
    // US-08.1 AC1: active plans, without the day pass, in the owner's order.
    supabase
      .from("plans")
      .select("id, name, kind, price::text, requires_trainer")
      .eq("is_active", true)
      .neq("kind", "day_pass")
      .order("sort_order")
      .order("name")
      .returns<SalePlan[]>(),
    supabase
      .from("trainers")
      .select("id, full_name, trainer_programs(programs(kind, is_active))")
      .eq("is_active", true)
      .order("full_name")
      .returns<
        {
          id: string;
          full_name: string;
          trainer_programs: {
            programs: { kind: "group" | "personal"; is_active: boolean } | null;
          }[];
        }[]
      >(),
    supabase
      .from("gym_settings")
      .select("personal_min_price::text, card_replacement_price::text")
      .maybeSingle<{
        personal_min_price: string;
        card_replacement_price: string;
      }>(),
  ]);

  return {
    plans: plans.data ?? [],
    trainers: (trainers.data ?? []).map((trainer) => {
      const kinds = trainer.trainer_programs
        .map((assignment) => assignment.programs)
        .filter((program) => program?.is_active)
        .map((program) => program?.kind);
      return {
        id: trainer.id,
        full_name: trainer.full_name,
        group: kinds.includes("group"),
        personal: kinds.includes("personal"),
      };
    }),
    personalMin: settings.data?.personal_min_price ?? "0.00",
    cardFee: settings.data?.card_replacement_price ?? "0.00",
    isOwner: staff.role === "owner" || staff.role === "admin",
  };
}
