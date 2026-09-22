import { z } from "zod";
import { me } from "@/lib/i18n/me";

// Doc 08 §6: every action validates its input before it reaches the RPC. The rules
// mirror the database constraints of doc 07 §3, so a bad value is caught twice.
const uuid = z.string().uuid();
const optionalUuid = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .refine((value) => value === null || uuid.safeParse(value).success, {
    message: me.errors.E_VALIDATION,
  });

const name = (min: number, max: number, message: string) =>
  z.string().trim().min(min, message).max(max, message);

/**
 * BR-003: the money input accepts a comma or a dot.
 *
 * SUSPECT-11: six digits before the decimal point. Every price column is numeric(10,2),
 * so a longer number used to reach the database and come back as a general error with
 * nothing under the field; €999,999.99 is far above any price this gym charges.
 */
const money = (message: string) =>
  z
    .string()
    .trim()
    .transform((value) => value.replace(",", "."))
    .refine((value) => /^\d{1,6}(\.\d{1,2})?$/.test(value), { message })
    .transform(Number);

const checkbox = z
  .union([
    z.literal("on"),
    z.literal("true"),
    z.literal("false"),
    z.null(),
    z.undefined(),
  ])
  .transform((value) => value === "on" || value === "true");

export const trainerSchema = z.object({
  id: optionalUuid,
  fullName: name(2, 100, me.settings.trainerNameInvalid),
  isActive: checkbox,
});

export const trainerFeeSchema = z.object({
  trainerId: uuid,
  // BR-020 and OQ-1: an empty fee means "nije definisano".
  fee: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value.replace(",", ".")))
    // SUSPECT-11: the same six-digit bound as money() (numeric(10,2)).
    .refine((value) => value === null || /^\d{1,6}(\.\d{1,2})?$/.test(value), {
      message: me.settings.feeInvalid,
    })
    .transform((value) => (value === null ? null : Number(value))),
  // D-62: an empty group share means the plan's percentage applies.
  groupSharePct: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value.replace(",", ".")))
    .refine(
      (value) =>
        value === null ||
        (/^\d+(\.\d{1,2})?$/.test(value) && Number(value) <= 100),
      { message: me.settings.groupShareInvalid },
    )
    .transform((value) => (value === null ? null : Number(value))),
});

export const programSchema = z.object({
  id: optionalUuid,
  name: name(2, 50, me.settings.programNameInvalid),
  kind: z.enum(["group", "personal"], { message: me.errors.E_VALIDATION }),
  isActive: checkbox,
});

export const assignmentSchema = z.object({
  trainerId: uuid,
  programId: uuid,
  assigned: checkbox,
});

export const classSlotSchema = z.object({
  id: optionalUuid,
  programId: uuid,
  trainerId: uuid,
  // ISO weekday, 1 = Monday (doc 07 §3).
  weekday: z.coerce.number().int().min(1).max(7),
  startsAt: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, me.settings.timeInvalid),
  isActive: checkbox,
});

export const planSchema = z
  .object({
    id: optionalUuid,
    name: name(2, 50, me.settings.planNameInvalid),
    kind: z.enum(["gym", "group", "combo", "personal", "day_pass"], {
      message: me.errors.E_VALIDATION,
    }),
    durationValue: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : Number(value)))
      .refine(
        (value) => value === null || (Number.isInteger(value) && value > 0),
        {
          message: me.settings.durationInvalid,
        },
      ),
    durationUnit: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : value))
      .refine(
        (value) => value === null || value === "day" || value === "month",
        {
          message: me.settings.durationInvalid,
        },
      ),
    price: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : value.replace(",", ".")))
      // SUSPECT-11: the same six-digit bound as money() above (numeric(10,2)).
      .refine((value) => value === null || /^\d{1,6}(\.\d{1,2})?$/.test(value), {
        message: me.settings.priceInvalid,
      })
      .transform((value) => (value === null ? null : Number(value))),
    coversGym: checkbox,
    coversGroup: checkbox,
    coversPersonal: checkbox,
    gymVisitLimit: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : Number(value)))
      .refine(
        (value) => value === null || (Number.isInteger(value) && value > 0),
        {
          message: me.settings.limitInvalid,
        },
      ),
    groupSessionLimit: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : Number(value)))
      .refine(
        (value) => value === null || (Number.isInteger(value) && value > 0),
        {
          message: me.settings.limitInvalid,
        },
      ),
    requiresTrainer: checkbox,
    sortOrder: z.coerce.number().int().min(0).max(999),
    isActive: checkbox,
    gymFixedAmount: money(me.settings.priceInvalid),
    trainerSharePct: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : value.replace(",", ".")))
      .refine(
        (value) =>
          value === null ||
          (/^\d+(\.\d{1,2})?$/.test(value) && Number(value) <= 100),
        { message: me.settings.shareInvalid },
      )
      .transform((value) => (value === null ? null : Number(value))),
  })
  // Doc 07 §3: the two plan check constraints, reported on the field that is wrong.
  .refine(
    (value) =>
      (value.kind === "day_pass") ===
      (value.durationValue === null && value.durationUnit === null),
    { path: ["durationValue"], message: me.settings.durationForKind },
  )
  .refine((value) => (value.kind === "personal") === (value.price === null), {
    path: ["price"],
    message: me.settings.priceForKind,
  });

export const productSchema = z.object({
  id: optionalUuid,
  name: name(2, 50, me.settings.productNameInvalid),
  purchasePrice: money(me.settings.priceInvalid),
  salePrice: money(me.settings.priceInvalid).refine((value) => value > 0, {
    message: me.settings.salePriceInvalid,
  }),
  isActive: checkbox,
});

export const categorySchema = z.object({
  id: optionalUuid,
  name: name(2, 50, me.settings.categoryNameInvalid),
  isActive: checkbox,
});

const emailList = z
  .string()
  .trim()
  .transform((value) =>
    value
      .split(/[\n,;]+/)
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  )
  .refine((list) => list.length >= 1, { message: me.settings.emailsRequired })
  .refine(
    (list) =>
      list.every((entry) => z.string().email().safeParse(entry).success),
    {
      message: me.settings.emailsInvalid,
    },
  );

export const gymSettingsSchema = z.object({
  cardReplacementPrice: money(me.settings.priceInvalid),
  personalMinPrice: money(me.settings.priceInvalid),
  expiryReminderDays: z.coerce.number().int().min(1).max(14),
  autoCloseTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, me.settings.timeInvalid),
  doubleScanSeconds: z.coerce.number().int().min(0).max(600),
  shiftReportEmails: emailList,
  backupEmails: emailList,
});

/** US-21.1: the gym logo is a PNG or JPG of at most 1 MB. */
export const LOGO_MAX_BYTES = 1_048_576;
