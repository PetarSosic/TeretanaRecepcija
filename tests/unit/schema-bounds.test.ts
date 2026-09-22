import { describe, expect, it } from "vitest";
import { expenseSchema, resendShiftSchema } from "@/features/finance/schemas";
import { gymSettingsSchema } from "@/features/settings/catalog-schemas";

/**
 * TEST_PLAN §6: the input bounds that used to let a bad value reach the database and
 * come back as the general "Došlo je do greške." with nothing under the field.
 */

const settings = {
  cardReplacementPrice: "5",
  personalMinPrice: "80",
  expiryReminderDays: "3",
  autoCloseTime: "23:30",
  doubleScanSeconds: "30",
  shiftReportEmails: "kasa@kpfitness.me",
  backupEmails: "kasa@kpfitness.me",
};

const expense = {
  categoryId: "3f1b6a1e-1f4c-4a1e-9c1e-8a0d2c5b7e11",
  description: "Struja za mart",
  amount: "123,45",
  spentOn: "2026-03-01",
  method: "card" as const,
  fromTill: false,
  supplier: "",
  invoice: "",
  vat: "unset" as const,
  trainerId: "",
};

describe("SUSPECT-11: prices stop at what numeric(10,2) holds", () => {
  it("accepts an ordinary price with either separator", () => {
    expect(
      gymSettingsSchema.parse({ ...settings, cardReplacementPrice: "5,50" })
        .cardReplacementPrice,
    ).toBe(5.5);
    expect(
      gymSettingsSchema.parse({ ...settings, personalMinPrice: "999999.99" })
        .personalMinPrice,
    ).toBe(999999.99);
  });
  it("refuses a number too long for the column, on its own field", () => {
    const result = gymSettingsSchema.safeParse({
      ...settings,
      cardReplacementPrice: "99999999999",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path[0]).toBe("cardReplacementPrice");
  });
});

describe("SUSPECT-08: 'Iz kase' reads only the checkbox's own values", () => {
  it.each([
    ["on", true],
    [true, true],
    ["false", false],
    [false, false],
    [null, false],
  ])("reads %s as %s", (input, expected) => {
    // BR-133: money out of the till is cash, so the pair has to agree.
    const parsed = expenseSchema.parse({
      ...expense,
      method: "cash",
      fromTill: input,
    });
    expect(parsed.fromTill).toBe(expected);
  });
});

describe("SUSPECT-10: the shift of a resend is a real UUID", () => {
  it("accepts a UUID", () => {
    const id = "9a7c1d2e-3b4f-4a5b-8c6d-7e8f9a0b1c2d";
    expect(resendShiftSchema.parse({ shiftId: id }).shiftId).toBe(id);
  });
  it.each([["-".repeat(36)], ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"], [""]])(
    "refuses %s",
    (value) => {
      expect(resendShiftSchema.safeParse({ shiftId: value }).success).toBe(
        false,
      );
    },
  );
});
