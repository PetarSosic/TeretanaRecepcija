import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * BR-001: "today" is `gym_today(gym_id)` in Europe/Podgorica, never the server's date.
 * Every screen that resolves a period or defaults a date field starts from this.
 */
export async function gymToday(gymId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gym_today", { p_gym: gymId });
  if (error || typeof data !== "string")
    throw new Error(`gym_today: ${error?.message ?? "unexpected answer"}`);
  return data;
}
