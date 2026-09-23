import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes reachable without a session. Everything else requires active staff.
// Doc 08 §8: pg_cron posts to /api/jobs/* with no cookies at all, so the session check
// must not stand in front of it; the handler authorises those calls with CRON_SECRET.
const PUBLIC_ROUTES = ["/login", "/auth/callback", "/api/jobs"];
const PASSWORD_ROUTE = "/change-password";

function securityHeaders(request: NextRequest) {
  // Doc 08 §9: per-request nonce.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const development = process.env.NODE_ENV === "development";
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
    : "";
  const websocket = supabase
    .replace(/^https:/, "wss:")
    .replace(/^http:/, "ws:");
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${development ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' ${development ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    `connect-src 'self' ${supabase} ${websocket} https://api.resend.com${development ? " ws://127.0.0.1:* ws://localhost:*" : ""}`,
    `img-src 'self' data: blob: ${supabase}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  return { policy, requestHeaders };
}

/**
 * Doc 08 §4: refresh the Supabase cookie session on every request, sign out staff that
 * are no longer active (doc 04 §2 point 5), and hold anyone with a temporary password
 * on S-01b until they set their own (AS-18).
 */
export async function proxy(request: NextRequest) {
  const { policy, requestHeaders } = securityHeaders(request);
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_ROUTES.some(
    (route) => path === route || path.startsWith(`${route}/`),
  );

  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({
            request: { headers: requestHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });

    // getUser revalidates the token with Supabase; getSession would trust the cookie.
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;

    if (!user) {
      if (!isPublic) return redirect(request, "/login", policy);
    } else {
      const { data: staff, error } = await supabase
        .from("staff")
        .select("role, is_active, must_change_password")
        .eq("user_id", user.id)
        .maybeSingle<{
          role: string;
          is_active: boolean;
          must_change_password: boolean;
        }>();

      // A banned or deactivated account loses its session on the next request.
      if (error || !staff || !staff.is_active) {
        await supabase.auth.signOut();
        // The sign-out wrote cleared cookies onto `response`; carry them to the redirect.
        if (!isPublic) return redirect(request, "/login", policy, response);
      } else if (staff.must_change_password && path !== PASSWORD_ROUTE) {
        if (!isPublic)
          return redirect(request, PASSWORD_ROUTE, policy, response);
      } else if (
        staff.role === "receptionist" &&
        !isPublic &&
        // A first login opens the shift only after S-01b (AS-18).
        path !== PASSWORD_ROUTE &&
        request.method === "GET"
      ) {
        // BR-116 and BR-119 (N-09): once the owner or the nightly job has closed the
        // shift, the receptionist's next request ends the session. The app layout
        // checks this too, but a click in the menu is a client navigation that keeps
        // the shared layout and never re-runs it; this proxy sees every navigation.
        // Server actions (POST) are left alone: the RPC answers them with BR-092's
        // message instead of a redirect the action cannot follow.
        const { data: shift, error: shiftError } =
          await supabase.rpc("open_shift_info");
        if (!shiftError && !shift) {
          await supabase.auth.signOut();
          return redirect(request, "/login", policy, response, "auto=1");
        }
      } else if (path === "/login") {
        const home = staff.must_change_password
          ? PASSWORD_ROUTE
          : staff.role === "owner" || staff.role === "admin"
            ? "/finance"
            : "/reception";
        return redirect(request, home, policy, response);
      }
    }
  }

  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function redirect(
  request: NextRequest,
  path: string,
  policy: string,
  carry?: NextResponse,
  search = "",
) {
  const target = request.nextUrl.clone();
  target.pathname = path;
  target.search = search;
  const response = NextResponse.redirect(target);
  // Refreshed or cleared session cookies must reach the browser with the redirect.
  carry?.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  // Every matched request costs two Supabase round trips (token check plus the staff
  // row), so only real navigations and route handlers are matched. Framework assets
  // and static files are served by a document that already carries the CSP, and the
  // headers in next.config.ts still apply to them.
  matcher: [
    "/((?!_next/|favicon.ico|.*\\.(?:png|jpe?g|svg|ico|webp|avif|mp3|css|js|woff2?)$).*)",
  ],
};
