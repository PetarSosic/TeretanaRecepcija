import { describe, expect, it } from "vitest";
import {
  changePasswordSchema,
  inAppRedirect,
  isEmail,
} from "@/features/auth/schemas";
import { createStaffSchema } from "@/features/settings/schemas";

describe("US-01.1 AC2: one field for a username or an email", () => {
  it("treats input with @ as an email", () => {
    expect(isEmail("matija@primjer.me")).toBe(true);
  });

  it("treats input without @ as a username", () => {
    expect(isEmail("recepcija.jedan")).toBe(false);
  });
});

describe("doc 08 §4: password rules", () => {
  it("rejects a password shorter than 8 characters", () => {
    const result = changePasswordSchema.safeParse({
      next: "kratka",
      repeat: "kratka",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a repeat that does not match", () => {
    const result = changePasswordSchema.safeParse({
      next: "dovoljnodugacka",
      repeat: "nesto drugo",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0].path).toEqual(["repeat"]);
  });

  it("accepts eight characters that match", () => {
    expect(
      changePasswordSchema.safeParse({ next: "osamzna1", repeat: "osamzna1" })
        .success,
    ).toBe(true);
  });
});

describe("US-01.3 AC1 and AC2: staff identity per role", () => {
  const base = { fullName: "Ana Anić", password: "privremena1" };

  it("gives a receptionist a username and no email", () => {
    const result = createStaffSchema.safeParse({
      ...base,
      role: "receptionist",
      username: "Ana.Anic",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.username).toBe("ana.anic");
      expect(result.data.email).toBeNull();
    }
  });

  it("rejects a username outside ^[a-z0-9._]{3,30}$", () => {
    for (const username of ["ab", "ana anić", "ana-anic", "a".repeat(31)]) {
      const result = createStaffSchema.safeParse({
        ...base,
        role: "receptionist",
        username,
      });
      expect(result.success, username).toBe(false);
    }
  });

  it("D-57: gives a manager and an owner a username too", () => {
    for (const role of ["manager", "owner"] as const) {
      const result = createStaffSchema.safeParse({
        ...base,
        role,
        username: "ana.anic",
      });
      expect(result.success, role).toBe(true);
      if (result.success) {
        expect(result.data.username).toBe("ana.anic");
        expect(result.data.email).toBeNull();
      }
    }
  });

  it("D-57: gives the admin an email and no username", () => {
    const result = createStaffSchema.safeParse({
      ...base,
      role: "admin",
      email: "Admin@Primjer.ME",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("admin@primjer.me");
      expect(result.data.username).toBeNull();
    }
  });

  it("D-57: rejects an admin without a valid email", () => {
    expect(
      createStaffSchema.safeParse({
        ...base,
        role: "admin",
        email: "nije-email",
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown role", () => {
    expect(
      createStaffSchema.safeParse({ ...base, role: "trener", email: "a@b.me" })
        .success,
    ).toBe(false);
  });
});

// AUTH-16 and finding N-03: the reset link's destination never leaves the app.
describe("AUTH-16: the callback destination stays in the app", () => {
  const origin = "https://teretana-recepcija.vercel.app";

  it("keeps an in-app path with its query", () => {
    expect(inAppRedirect("/change-password?a=1", origin)).toBe(
      "/change-password?a=1",
    );
  });

  it("rejects a backslash that the URL parser reads as a second slash", () => {
    // Before the fix this passed the startsWith("//") test and resolved to
    // https://example.org/.
    expect(inAppRedirect("/\\example.org", origin)).toBe("/change-password");
    expect(
      new URL(inAppRedirect("/\\example.org", origin), origin).origin,
    ).toBe(origin);
  });

  it("rejects a protocol-relative and an absolute foreign destination", () => {
    expect(inAppRedirect("//example.org", origin)).toBe("/change-password");
    expect(inAppRedirect("https://example.org/steal", origin)).toBe(
      "/change-password",
    );
  });

  it("rejects a non-http scheme and a missing destination", () => {
    expect(inAppRedirect("javascript:alert(1)", origin)).toBe(
      "/change-password",
    );
    expect(inAppRedirect(null, origin)).toBe("/change-password");
  });

  it("reduces a same-origin absolute destination to its path", () => {
    expect(inAppRedirect(`${origin}/finance`, origin)).toBe("/finance");
  });
});
