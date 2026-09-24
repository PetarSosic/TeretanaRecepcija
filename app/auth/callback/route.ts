import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// D-69: S-01b, with the sentence that says a reset link opened it.
const RESET_TARGET = "/change-password?reset=1";

/**
 * D-69: a reset link ends on S-01b like a first login, so the user sets a new password
 * without the one they forgot. staff is not writable by `authenticated` (doc 04 §2), so
 * the flag is raised with the service role. Anyone who is not active staff is signed out.
 */
async function requirePasswordChange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<boolean> {
  const { data } = await createAdminClient()
    .from("staff")
    .update({ must_change_password: true })
    .eq("user_id", userId)
    .eq("is_active", true)
    .select("id");
  if (data?.length) return true;
  await supabase.auth.signOut();
  return false;
}

/**
 * Landing route for the Supabase password-reset link (US-01.2), the only link the
 * application ever sends to this route. A valid link opens a session and continues on
 * S-01b; anything else ends on /login. No destination is read from the URL, so the
 * link cannot be pointed at another site (N-03, AUTH-16).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const supabase = await createClient();
  let userId: string | null = null;

  const tokenHash = searchParams.get("token_hash");
  const code = searchParams.get("code");
  if (tokenHash && searchParams.get("type") === "recovery") {
    // D-69: the reset mail carries a one-time token hash. Unlike the PKCE code below
    // it needs no verifier cookie, so the link works in any browser and on any device.
    const { data, error } = await supabase.auth.verifyOtp({
      type: "recovery",
      token_hash: tokenHash,
    });
    if (!error) userId = data.user?.id ?? null;
  } else if (code) {
    // A PKCE code works only in the browser that asked for the reset, whose cookies
    // hold the verifier. Kept for mails sent before the D-69 template.
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) userId = data.user.id;
  }

  // A relative Location keeps the host the browser used, which holds the new session
  // cookies; the handler's own URL can name another host (localhost in development).
  redirect(
    userId && (await requirePasswordChange(supabase, userId))
      ? RESET_TARGET
      : "/login",
  );
}
