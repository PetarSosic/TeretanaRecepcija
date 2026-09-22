import { NextResponse, type NextRequest } from "next/server";
import { inAppRedirect } from "@/features/auth/schemas";
import { createClient } from "@/lib/supabase/server";

// Landing route for the Supabase password-reset link (US-01.2). The code is exchanged
// for a session, then the user sets a new password on S-01b.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  // N-03: only in-app destinations, decided by the resolved origin rather than by the
  // shape of the string, so the link cannot be pointed at another site.
  const target = inAppRedirect(searchParams.get("next"), origin);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(target, origin));
  }
  return NextResponse.redirect(new URL("/login", origin));
}
