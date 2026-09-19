import { describe, expect, it } from "vitest";
import {
  correctPaymentSchema,
  dayPassSchema,
  deskExpenseSchema,
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

describe("deskExpenseSchema (BR-132)", () => {
  const base = { categoryId: id, description: "Deterdžent" };
  it("accepts €0.01 to €10,000.00", () => {
    expect(deskExpenseSchema.parse({ ...base, amount: "0,01" }).amount).toBe(
      "0.01",
    );
    expect(deskExpenseSchema.parse({ ...base, amount: "10000" }).amount).toBe(
      "10000.00",
    );
  });
  it("refuses zero and anything above the desk limit", () => {
    for (const amount of ["0", "0,00", "10000,01"])
      expect(
        deskExpenseSchema.safeParse({ ...base, amount }).error?.issues[0]
          ?.message,
      ).toBe(me.deskExpense.amountInvalid);
  });
  it("needs a category and a description of 2–200 characters", () => {
    const result = deskExpenseSchema.safeParse({
      categoryId: "",
      description: "x",
      amount: "5",
    });
    const fields = (result.error?.issues ?? []).map((issue) => issue.path[0]);
    expect(fields).toEqual(
      expect.arrayContaining(["categoryId", "description"]),
    );
  });
});
