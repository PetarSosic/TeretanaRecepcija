import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** The gym's open shift as the header badge and S-02 need it (BR-110). */
export type OpenShift = {
  id: string;
  staff_id: string;
  staff_name: string;
  started_at: string;
  is_mine: boolean;
};

/**
 * Doc 07 §6 hides another receptionist's staff row, so the holder's name comes from
 * the open_shift_info function rather than from a join (see migration 0011). The layout
 * and some pages both ask during one render, and `cache` lets them share the answer.
 */
export const getOpenShift = cache(async (): Promise<OpenShift | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_shift_info");
  if (error) {
    console.error(`open_shift_info: ${error.message}`);
    return null;
  }
  return (data as OpenShift | null) ?? null;
});
