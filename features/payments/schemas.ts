import { z } from "zod";
import { parseMoneyInput } from "@/lib/format";
import { me } from "@/lib/i18n/me";

// Doc 08 §6: the S-10, S-11 and S-12 forms, mirroring the RPC checks of migration 0015.

const method = z.enum(["cash", "card"], {
  message: me.memberships.methodRequired,
});

/** BR-003: a comma or a dot, at most two decimals, kept as a decimal string. */
const money = (message: string) =>
  z
    .string()
    .trim()
    .refine((value) => /^\d{1,8}([.,]\d{1,2})?$/.test(value), { message })
    .transform((value) => parseMoneyInput(value));

/** BR-100: 1–20 passes. */
export const dayPassSchema = z.object({
  quantity: z.coerce
    .number({ message: me.errors.E_VALIDATION })
    .int(me.errors.E_VALIDATION)
    .min(1, me.errors.E_VALIDATION)
    .max(20, me.errors.E_VALIDATION),
  method,
});

/** BR-094: method and note for everyone; the amount only when the owner sends one. */
export const correctPaymentSchema = z.object({
  paymentId: z.string().uuid(),
  method,
  note: z.string().trim().max(500, me.payments.noteInvalid),
  amount: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? null : value,
    money(me.memberships.amountInvalid).nullable(),
  ),
});

/** BR-095 and BR-135: a reason of 3–200 characters. */
export const voidSchema = z.object({
  id: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(3, me.errors.E_REASON_REQUIRED)
    .max(200, me.errors.E_REASON_REQUIRED),
});

/** BR-132: an active non-salary category, 2–200 characters, €0.01–10,000. */
export const deskExpenseSchema = z.object({
  categoryId: z.string().uuid({ message: me.deskExpense.categoryRequired }),
  description: z
    .string()
    .trim()
    .min(2, me.deskExpense.descriptionInvalid)
    .max(200, me.deskExpense.descriptionInvalid),
  amount: money(me.deskExpense.amountInvalid).refine(
    (value) => Number(value) >= 0.01 && Number(value) <= 10000,
    { message: me.deskExpense.amountInvalid },
  ),
});
