import { describe, expect, it } from "vitest";
import {
  correctPaymentSchema,
  dayPassSchema,
  voidSchema,
} from "@/features/payments/schemas";
import { me } from "@/lib/i18n/me";

const id = "11111111-1111-4111-8111-111111111111";

describe("dayPassSchema (BR-100)", () => {
  it("accepts 1–20 passes with a method", () => {
    expect(dayPassSchema.parse({ quantity: "3", method: "cash" })).toEqual({
      quantity: 3,
      method: "cash",
    });
  });
  it("refuses 0, 21 and a missing method", () => {
    expect(
      dayPassSchema.safeParse({ quantity: "0", method: "cash" }).success,
    ).toBe(false);
    expect(
      dayPassSchema.safeParse({ quantity: "21", method: "cash" }).success,
    ).toBe(false);
    expect(dayPassSchema.safeParse({ quantity: "1", method: "" }).success).toBe(
      false,
    );
  });
});

describe("correctPaymentSchema (BR-094)", () => {
  it("sends no amount unless one is typed", () => {
    expect(
      correctPaymentSchema.parse({
        paymentId: id,
        method: "card",
        note: " x ",
        amount: "",
      }),
    ).toEqual({ paymentId: id, method: "card", note: "x", amount: null });
  });
  it("keeps a typed amount as a decimal string (BR-003)", () => {
    expect(
      correctPaymentSchema.parse({
        paymentId: id,
        method: "cash",
        note: "",
        amount: "12,5",
      }).amount,
    ).toBe("12.50");
  });
});

describe("voidSchema (BR-095, BR-135)", () => {
  it("needs a reason of 3–200 characters", () => {
    expect(
      voidSchema.safeParse({ id, reason: " ab " }).error?.issues[0]?.message,
    ).toBe(me.errors.E_REASON_REQUIRED);
    expect(voidSchema.safeParse({ id, reason: "x".repeat(201) }).success).toBe(
      false,
    );
    expect(voidSchema.parse({ id, reason: " Pogrešno " }).reason).toBe(
      "Pogrešno",
    );
  });
});
