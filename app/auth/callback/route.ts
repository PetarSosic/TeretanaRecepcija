import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Landing route for the Supabase password-reset link (US-01.2). The code is exchanged
// for a session, then the user sets a new password on S-01b.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/change-password";
  // Only in-app destinations, so the link cannot be pointed at another site.
  const target =
    next.startsWith("/") && !next.startsWith("//") ? next : "/change-password";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(target, origin));
  }
  return NextResponse.redirect(new URL("/login", origin));
}
