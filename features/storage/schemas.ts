import { z } from "zod";
import { checkbox, isoDate } from "@/features/finance/schemas";
import { parseMoneyInput } from "@/lib/format";
import { me } from "@/lib/i18n/me";

// Doc 08 §6: the S-13 forms, mirroring stock_sale and stock_in (migration 0016).

const quantity = (max: number) =>
  z.coerce
    .number({
      message: me.storage.quantityInvalid.replace("{max}", String(max)),
    })
    .int(me.storage.quantityInvalid.replace("{max}", String(max)))
    .min(1, me.storage.quantityInvalid.replace("{max}", String(max)))
    .max(max, me.storage.quantityInvalid.replace("{max}", String(max)));

/** BR-142: at least one, a method; the stock limit is the RPC's (E17). */
export const saleSchema = z.object({
  productId: z.string().uuid(),
  quantity: quantity(10000),
  method: z.enum(["cash", "card"], { message: me.memberships.methodRequired }),
});

/**
 * BR-141 and D-55: 1–10,000 units at a purchase price of at least €0.01. D-95: the rest
 * is the owner's expense form (BR-133) without the category; an empty description is
 * written as "Nabavka: <proizvod> × <količina>", and an empty date means today.
 */
export const stockInSchema = z
  .object({
    productId: z.string().uuid(),
    quantity: quantity(10000),
    unitCost: z
      .string()
      .trim()
      .refine((value) => /^\d{1,8}([.,]\d{1,2})?$/.test(value), {
        message: me.errors.E_STOCK_COST_INVALID,
      })
      .transform((value) => parseMoneyInput(value))
      .refine((value) => Number(value) >= 0.01, {
        message: me.errors.E_STOCK_COST_INVALID,
      }),
    description: z
      .string()
      .trim()
      .refine((value) => value === "" || value.length >= 2, {
        message: me.finance.descriptionInvalid,
      })
      .refine((value) => value.length <= 200, {
        message: me.finance.descriptionInvalid,
      }),
    spentOn: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() === "" ? null : value,
      isoDate.nullable(),
    ),
    method: z.enum(["cash", "card", "none"], {
      message: me.errors.E_VALIDATION,
    }),
    fromTill: checkbox,
    supplier: z.string().trim().max(100, me.finance.supplierInvalid),
    invoice: z.string().trim().max(50, me.finance.invoiceInvalid),
    vat: z.enum(["yes", "no", "unset"]),
  })
  // BR-133: money out of the till is cash; the RPC forces it again.
  .refine((value) => !value.fromTill || value.method === "cash", {
    message: me.errors.E_VALIDATION,
    path: ["method"],
  });

export const correctSaleSchema = z.object({
  movementId: z.string().uuid(),
  method: z.enum(["cash", "card"], { message: me.memberships.methodRequired }),
});
