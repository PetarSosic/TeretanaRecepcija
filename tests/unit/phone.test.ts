import { describe, expect, it } from "vitest";
import { normalizePhone, phoneSchema } from "@/lib/phone";

describe("BR-041 phone normalization", () => {
  it.each([
    ["067 123 456", "+38267123456"],
    ["(067)/123-456", "+38267123456"],
    ["00382 67 123456", "+38267123456"],
    ["+381 64 1234567", "+381641234567"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
    expect(phoneSchema.parse(input)).toBe(expected);
  });
  it.each([
    "/",
    "",
    "67123456",
    "+1234567",
    "+1234567890123456",
    "067abc123456",
  ])("rejects %s", (input) => {
    expect(phoneSchema.safeParse(input).success).toBe(false);
  });
});
