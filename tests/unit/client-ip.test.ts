import { describe, expect, it } from "vitest";
import { clientIp } from "@/lib/client-ip";

// D-75 (US-01.1 AC7): the address the per-address sign-in limit counts.
describe("clientIp", () => {
  const from = (entries: Record<string, string>) =>
    clientIp(new Headers(entries));

  it("takes the client, the first entry Vercel puts in x-forwarded-for", () => {
    expect(from({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })).toBe(
      "203.0.113.7",
    );
    expect(from({ "x-forwarded-for": "2001:db8::1" })).toBe("2001:db8::1");
  });

  it("falls back to x-real-ip", () => {
    expect(from({ "x-real-ip": " 198.51.100.9 " })).toBe("198.51.100.9");
  });

  it("gives no address for a loopback or missing one, so only the login is limited", () => {
    expect(from({})).toBeNull();
    expect(from({ "x-forwarded-for": "127.0.0.1" })).toBeNull();
    expect(from({ "x-forwarded-for": "::1" })).toBeNull();
    expect(from({ "x-forwarded-for": "::ffff:127.0.0.1" })).toBeNull();
    expect(from({ "x-forwarded-for": " , " })).toBeNull();
  });
});
