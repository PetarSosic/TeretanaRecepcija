/**
 * D-75 (US-01.1 AC7): the address a sign-in came from, for the per-address limit. On
 * Vercel the platform sets `x-forwarded-for` itself, overwriting whatever the client
 * sent, and its first entry is the client. A loopback address (a local server, the E2E
 * runs) or none at all gives null, so only the per-login limit applies there.
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headers.get("x-real-ip")?.trim() || "";
  if (!ip || /^(127\.|::1$|::ffff:127\.)/.test(ip)) return null;
  return ip;
}
