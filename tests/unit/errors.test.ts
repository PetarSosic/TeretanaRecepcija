import { expect, it } from "vitest";
import { getErrorMessage } from "@/lib/errors";
import { me } from "@/lib/i18n/me";

it("BR-059 interpolates known parameters (D-101: the Personalni fixed part)", () => {
  expect(getErrorMessage("E_AMOUNT_BELOW_MIN", { min: "40,00" })).toBe(
    "Fiksni dio za teretanu ne može biti manji od 40,00 €.",
  );
});
it("doc 08 §5 hides raw database errors and missing parameters", () => {
  expect(getErrorMessage("sensitive database detail")).toBe(
    me.errors.unexpected,
  );
  expect(getErrorMessage("E_STOCK_INSUFFICIENT")).toBe(me.errors.unexpected);
});
it("D-55 explains invalid stock-in cost", () => {
  expect(getErrorMessage("E_STOCK_COST_INVALID")).toBe(
    "Nabavna cijena mora biti najmanje 0,01 €.",
  );
});
