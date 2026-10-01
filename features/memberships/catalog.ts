import "server-only";
import type { Staff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ClassTime } from "./class-time";

export type SalePlan = {
  id: string;
  name: string;
  kind: "gym" | "group" | "combo" | "personal";
  /** Decimal text; null only for Personalni (doc 07 §3). */
  price: string | null;
  requires_trainer: boolean;
  /** D-71: with requires_trainer, the sale also needs a fixed class time. */
  covers_group: boolean;
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
  /** D-71: every trainer's active group class times, for the Fiksni termin select. */
  classTimes: ClassTime[];
  personalMin: string;
  cardFee: string;
  /**
   * BR-059: the owner (and admin, D-58) may change a list-price amount. The start date
   * (BR-052 step 4) is every role's since D-97.
   */
  isOwner: boolean;
};

export async function loadSaleCatalog(staff: Staff): Promise<SaleCatalog> {
  const supabase = await createClient();
  const [plans, trainers, settings, classTimes] = await Promise.all([
    // US-08.1 AC1: active plans, without the day pass, in the owner's order.
    supabase
      .from("plans")
      .select("id, name, kind, price::text, requires_trainer, covers_group")
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
    loadClassTimes(),
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
    classTimes,
    personalMin: settings.data?.personal_min_price ?? "0.00",
    cardFee: settings.data?.card_replacement_price ?? "0.00",
    isOwner: staff.role === "owner" || staff.role === "admin",
  };
}

/**
 * D-71: the active group class times, one per trainer and start time, with every day
 * that time is held. A slot counts only while its program is an active group program,
 * as class_time_active() decides in the database (BR-025).
 */
export async function loadClassTimes(): Promise<ClassTime[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("class_slots")
    .select("trainer_id, weekday, starts_at, programs!inner(kind, is_active)")
    .eq("is_active", true)
    .eq("programs.kind", "group")
    .eq("programs.is_active", true)
    .order("starts_at")
    .order("weekday")
    .returns<{ trainer_id: string; weekday: number; starts_at: string }[]>();
  if (error) console.error(`class_slots: ${error.message}`);

  const times = new Map<string, ClassTime>();
  for (const slot of data ?? []) {
    const key = `${slot.trainer_id}|${slot.starts_at}`;
    const time = times.get(key) ?? {
      trainer_id: slot.trainer_id,
      starts_at: slot.starts_at,
      weekdays: [],
    };
    if (!time.weekdays.includes(slot.weekday)) time.weekdays.push(slot.weekday);
    times.set(key, time);
  }
  return [...times.values()];
}
