import { describe, expect, it } from "vitest";
import { saleSchema, stockInSchema } from "@/features/storage/schemas";
import { me } from "@/lib/i18n/me";

const productId = "11111111-1111-4111-8111-111111111111";

describe("stockInSchema (BR-141, D-55)", () => {
  const base = { productId, quantity: "24", payment: "till" };
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
  it("needs 1–10,000 units and a payment choice", () => {
    expect(
      stockInSchema.safeParse({ ...base, unitCost: "1", quantity: "0" })
        .success,
    ).toBe(false);
    expect(
      stockInSchema.safeParse({ ...base, unitCost: "1", quantity: "10001" })
        .success,
    ).toBe(false);
    expect(
      stockInSchema.safeParse({ ...base, unitCost: "1", payment: "" }).success,
    ).toBe(false);
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
