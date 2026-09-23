import { describe, expect, it } from "vitest";
import { expenseSchema, resendShiftSchema } from "@/features/finance/schemas";
import {
  gymSettingsSchema,
  planSchema,
} from "@/features/settings/catalog-schemas";

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

const plan = {
  id: "",
  name: "Mjesečna",
  kind: "gym",
  durationValue: "1",
  durationUnit: "month",
  price: "79",
  // FormData.get gives null for an unticked checkbox.
  coversGym: "on",
  coversGroup: null,
  coversPersonal: null,
  requiresTrainer: null,
  isActive: "on",
  gymVisitLimit: "",
  groupSessionLimit: "",
  sortOrder: "1",
  gymFixedAmount: "0",
  trainerSharePct: "",
};

describe("N-14 and N-15: plan duration and order (SET-14)", () => {
  it("accepts a gym plan with value and unit, and a day pass with neither", () => {
    expect(planSchema.safeParse(plan).success).toBe(true);
    expect(
      planSchema.safeParse({
        ...plan,
        kind: "day_pass",
        durationValue: "",
        durationUnit: "",
      }).success,
    ).toBe(true);
  });
  it.each([
    ["a gym plan with a unit but no number", { durationValue: "" }],
    ["a gym plan with a number but no unit", { durationUnit: "" }],
    ["a day pass with a duration", { kind: "day_pass", durationValue: "1" }],
  ])("refuses %s under the duration field", (_label, change) => {
    const result = planSchema.safeParse({ ...plan, ...change });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path[0]).toBe("durationValue");
    expect(result.error?.issues[0]?.message).toBe(
      "Dnevna karta nema trajanje; svi ostali planovi ga moraju imati.",
    );
  });
  it.each(["1000", "-1", "abc"])(
    "refuses the order %s in Montenegrin",
    (value) => {
      const result = planSchema.safeParse({ ...plan, sortOrder: value });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe(
        "Unesite cijeli broj od 0 do 999.",
      );
    },
  );
});

describe("N-17: whole-number gym settings answer in Montenegrin (SET-18)", () => {
  it.each([
    ["expiryReminderDays", "0", "Unesite broj dana od 1 do 14."],
    ["expiryReminderDays", "15", "Unesite broj dana od 1 do 14."],
    ["expiryReminderDays", "abc", "Unesite broj dana od 1 do 14."],
    ["doubleScanSeconds", "-1", "Unesite broj sekundi od 0 do 600."],
    ["doubleScanSeconds", "601", "Unesite broj sekundi od 0 do 600."],
  ])("%s %s", (field, value, message) => {
    const result = gymSettingsSchema.safeParse({ ...settings, [field]: value });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path[0]).toBe(field);
    expect(result.error?.issues[0]?.message).toBe(message);
  });
  it("keeps the bounds themselves", () => {
    for (const [field, value] of [
      ["expiryReminderDays", "1"],
      ["expiryReminderDays", "14"],
      ["doubleScanSeconds", "0"],
      ["doubleScanSeconds", "600"],
    ])
      expect(
        gymSettingsSchema.safeParse({ ...settings, [field]: value }).success,
      ).toBe(true);
  });
});
