import "server-only";
import { createClient } from "@supabase/supabase-js";

// Doc 04 §2 / doc 08 §2: only staff administration, trusted jobs and owner seeding.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("Supabase server credentials are not configured");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
