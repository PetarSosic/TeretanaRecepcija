import { z } from "zod";
import { parseMoneyInput } from "@/lib/format";
import { me } from "@/lib/i18n/me";

// Doc 08 §6: the S-17 and S-22 forms, mirroring the checks of migrations 0020 and 0022.

const optionalUuid = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().uuid().nullable(),
);

const isoDate = z
  .string()
  .trim()
  .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: me.finance.dateInvalid,
  });

const time = z
  .string()
  .trim()
  .refine((value) => /^\d{2}:\d{2}$/.test(value), {
    message: me.finance.timeInvalid,
  });

/** The same tolerant checkbox reading the settings forms use (doc 08 §6). */
const checkbox = z
  .union([
    z.literal("on"),
    z.literal("true"),
    z.literal("false"),
    z.boolean(),
    z.null(),
    z.undefined(),
  ])
  .transform((value) => value === true || value === "on" || value === "true");

/** BR-133: €0.01 to €100,000.00, as a decimal string (BR-003). */
const expenseAmount = z
  .string()
  .trim()
  .refine((value) => /^\d{1,6}([.,]\d{1,2})?$/.test(value), {
    message: me.finance.amountInvalid,
  })
  .transform((value) => parseMoneyInput(value))
  .refine((value) => Number(value) >= 0.01 && Number(value) <= 100000, {
    message: me.finance.amountInvalid,
  });

/** BR-133: the owner's expense form. "none" is Van kase, which stores a null method. */
export const expenseSchema = z
  .object({
    categoryId: z.string().uuid({ message: me.errors.E_VALIDATION }),
    description: z
      .string()
      .trim()
      .min(2, me.finance.descriptionInvalid)
      .max(200, me.finance.descriptionInvalid),
    amount: expenseAmount,
    spentOn: isoDate,
    method: z.enum(["cash", "card", "none"], {
      message: me.errors.E_VALIDATION,
    }),
    // SUSPECT-08: z.coerce.boolean() turns every non-empty string into true, "false"
    // included. Only the checkbox's own values are accepted instead.
    fromTill: checkbox,
    supplier: z.string().trim().max(100, me.errors.E_VALIDATION),
    invoice: z.string().trim().max(50, me.errors.E_VALIDATION),
    vat: z.enum(["yes", "no", "unset"]),
    trainerId: optionalUuid,
  })
  // BR-133: money out of the till is cash, today, and needs an open shift; the RPC
  // enforces all three again, but the form should not offer a contradiction first.
  .refine((value) => !value.fromTill || value.method === "cash", {
    message: me.errors.E_VALIDATION,
    path: ["method"],
  });

/** BR-135: a void always carries a reason. */
export const voidExpenseSchema = z.object({
  expenseId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(3, me.errors.E_REASON_REQUIRED)
    .max(200, me.errors.E_REASON_REQUIRED),
});

/** BR-120 and BR-083: a visit entered after the fact. */
export const backdatedVisitSchema = z
  .object({
    memberId: z.string().uuid({ message: me.finance.noMember }),
    date: isoDate,
    checkIn: time,
    checkOut: time,
    visitType: z.enum(["gym", "group", "personal"]),
    trainerId: optionalUuid,
    slotId: optionalUuid,
  })
  .refine((value) => value.checkOut > value.checkIn, {
    message: me.finance.timeInvalid,
    path: ["checkOut"],
  });

/** BR-120: a membership sold on a past day, with its own start and payment dates. */
export const backdatedMembershipSchema = z.object({
  memberId: z.string().uuid({ message: me.finance.noMember }),
  planId: z.string().uuid({ message: me.errors.E_VALIDATION }),
  trainerId: optionalUuid,
  amount: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? null : value,
    z
      .string()
      .trim()
      .refine((value) => /^\d{1,6}([.,]\d{1,2})?$/.test(value), {
        message: me.memberships.amountInvalid,
      })
      .transform((value) => parseMoneyInput(value))
      .nullable(),
  ),
  sessions: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? null : value,
    z.coerce.number().int().min(1).max(50).nullable(),
  ),
  method: z.enum(["cash", "card"], { message: me.memberships.methodRequired }),
  paidOn: isoDate,
  startDate: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? null : value,
    isoDate.nullable(),
  ),
});

/** BR-120 and BR-100: day passes sold on a past day. */
export const backdatedDayPassSchema = z.object({
  quantity: z.coerce
    .number({ message: me.finance.quantityInvalid })
    .int(me.finance.quantityInvalid)
    .min(1, me.finance.quantityInvalid)
    .max(20, me.finance.quantityInvalid),
  method: z.enum(["cash", "card"], { message: me.memberships.methodRequired }),
  paidOn: isoDate,
});

/** BR-120 and BR-034: a card replacement fee taken on a past day. */
export const backdatedCardFeeSchema = z.object({
  memberId: z.string().uuid({ message: me.finance.noMember }),
  method: z.enum(["cash", "card"], { message: me.memberships.methodRequired }),
  paidOn: isoDate,
});

/** S-19 [Pošalji ponovo] (BR-118): the shift whose report goes out again. */
export const resendShiftSchema = z.object({ shiftId: z.string().uuid() });

/** S-19: the owner closes an open shift, with the counted cash optional (BR-114). */
export const closeAnyShiftSchema = z.object({
  shiftId: z.string().uuid(),
  countedCash: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? null : value,
    z
      .string()
      .trim()
      .refine((value) => /^\d{1,8}([.,]\d{1,2})?$/.test(value), {
        message: me.shift.cashInvalid,
      })
      .transform((value) => parseMoneyInput(value))
      .nullable(),
  ),
});
