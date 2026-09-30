import "server-only";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * BR-001: "today" is `gym_today(gym_id)` in Europe/Podgorica, never the server's date.
 * Every screen that resolves a period or defaults a date field starts from this. D-89:
 * the signed-in session already carries its gym's `gym_today()`, so a render asks the
 * database only for another gym's day.
 */
export async function gymToday(gymId: string): Promise<string> {
  const session = await getSessionContext();
  if (session && session.staff.gym_id === gymId) return session.today;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gym_today", { p_gym: gymId });
  if (error || typeof data !== "string")
    throw new Error(`gym_today: ${error?.message ?? "unexpected answer"}`);
  return data;
}
