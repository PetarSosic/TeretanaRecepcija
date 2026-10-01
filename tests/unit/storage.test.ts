import { describe, expect, it } from "vitest";
import { saleSchema, stockInSchema } from "@/features/storage/schemas";
import { me } from "@/lib/i18n/me";

const productId = "11111111-1111-4111-8111-111111111111";

describe("stockInSchema (BR-141, D-55, D-95)", () => {
  // D-95: the owner's expense form (BR-133) without the category, as FormData sends it.
  const base = {
    productId,
    quantity: "24",
    description: "",
    spentOn: "",
    method: "cash",
    fromTill: true,
    supplier: "",
    invoice: "",
    vat: "unset",
  };
  it("accepts €0.01 and keeps the price as a decimal string", () => {
    expect(stockInSchema.parse({ ...base, unitCost: "0,01" }).unitCost).toBe(
      "0.01",
    );
    expect(stockInSchema.parse({ ...base, unitCost: "0,35" }).unitCost).toBe(
      "0.35",
    );
  });
  it("refuses a free or negative delivery with the D-55 message", () => {
    for (const unitCost of ["0", "0,00", "-1", ""])
      expect(
        stockInSchema.safeParse({ ...base, unitCost }).error?.issues[0]
          ?.message,
      ).toBe(me.errors.E_STOCK_COST_INVALID);
  });
  it("needs 1–10,000 units and a method", () => {
    expect(
      stockInSchema.safeParse({ ...base, unitCost: "1", quantity: "0" })
        .success,
    ).toBe(false);
    expect(
      stockInSchema.safeParse({ ...base, unitCost: "1", quantity: "10001" })
        .success,
    ).toBe(false);
    expect(
      stockInSchema.safeParse({ ...base, unitCost: "1", method: "" }).success,
    ).toBe(false);
  });
  it("D-95: an empty description and date are left to the database", () => {
    const value = stockInSchema.parse({ ...base, unitCost: "0,35" });
    expect(value.description).toBe("");
    expect(value.spentOn).toBeNull();
    expect(
      stockInSchema.parse({ ...base, unitCost: "1", spentOn: "2026-09-28" })
        .spentOn,
    ).toBe("2026-09-28");
  });
  it("D-95: refuses a one-letter description and an overlong supplier or invoice", () => {
    const issue = (patch: Record<string, string>) =>
      stockInSchema.safeParse({ ...base, unitCost: "1", ...patch }).error
        ?.issues[0]?.message;
    expect(issue({ description: "X" })).toBe(me.finance.descriptionInvalid);
    expect(issue({ description: "x".repeat(201) })).toBe(
      me.finance.descriptionInvalid,
    );
    expect(issue({ supplier: "a".repeat(101) })).toBe(
      me.finance.supplierInvalid,
    );
    expect(issue({ invoice: "1".repeat(51) })).toBe(me.finance.invoiceInvalid);
  });
  it("BR-133: from the till is cash only; outside it any method", () => {
    expect(
      stockInSchema.safeParse({ ...base, unitCost: "1", method: "card" })
        .success,
    ).toBe(false);
    for (const method of ["cash", "card", "none"])
      expect(
        stockInSchema.safeParse({
          ...base,
          unitCost: "1",
          method,
          fromTill: false,
        }).success,
      ).toBe(true);
  });
});

describe("saleSchema (BR-142)", () => {
  it("needs a whole quantity of at least one and a method", () => {
    expect(
      saleSchema.parse({ productId, quantity: "2", method: "card" }),
    ).toEqual({ productId, quantity: 2, method: "card" });
    expect(
      saleSchema.safeParse({ productId, quantity: "0", method: "cash" })
        .success,
    ).toBe(false);
    expect(
      saleSchema.safeParse({ productId, quantity: "1.5", method: "cash" })
        .success,
    ).toBe(false);
    expect(
      saleSchema.safeParse({ productId, quantity: "1", method: "" }).success,
    ).toBe(false);
  });
});
