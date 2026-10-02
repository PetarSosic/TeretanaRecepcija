import { z } from "zod";
import { parseDateInput, parseMoneyInput } from "@/lib/format";
import { me } from "@/lib/i18n/me";

// Doc 08 §6: the S-08 fields, validated before the RPC. The RPC stays the authority
// (BR-059 minimum, BR-058 trainer, owner-only overrides); these give field messages.

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

/** BR-003: a comma or a dot, at most two decimals, kept as a decimal string. */
const optionalMoney = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .refine((value) => /^\d{1,8}([.,]\d{1,2})?$/.test(value), {
      message: me.memberships.amountInvalid,
    })
    .transform((value) => parseMoneyInput(value))
    .nullable(),
);

/** D-101: the gym's fixed part, the one figure of a Personalni sale and its amount. */
const optionalGymFee = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .refine((value) => /^\d{1,8}([.,]\d{1,2})?$/.test(value), {
      message: me.memberships.gymFeeInvalid,
    })
    .transform((value) => parseMoneyInput(value))
    .nullable(),
);

const optionalUuid = z.preprocess(
  emptyToNull,
  z.string().uuid({ message: me.memberships.trainerPlaceholder }).nullable(),
);

/** D-71: a class start time as the schedule stores it, "08:00" or "08:00:00". */
export const classTimeValue = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, {
    message: me.errors.E_CLASS_TIME_REQUIRED,
  });

export const saleFieldsSchema = z
  .object({
    planId: z.string().uuid({ message: me.memberships.planRequired }),
    // Sent by the form so the Personalni rules can be reported on the right field.
    planKind: z.enum(["gym", "group", "combo", "personal"], {
      message: me.memberships.planRequired,
    }),
    requiresTrainer: z.enum(["true", "false"]).transform((v) => v === "true"),
    coversGroup: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => v === "true"),
    trainerId: optionalUuid,
    classTime: z.preprocess(emptyToNull, classTimeValue.nullable().optional()),
    sessions: z.preprocess(
      emptyToNull,
      z.coerce
        .number({ message: me.memberships.sessionsInvalid })
        .int(me.memberships.sessionsInvalid)
        .min(1, me.memberships.sessionsInvalid)
        .max(50, me.memberships.sessionsInvalid)
        .nullable(),
    ),
    amount: optionalMoney,
    gymFee: optionalGymFee.optional().transform((value) => value ?? null),
    method: z.enum(["cash", "card"], {
      message: me.memberships.methodRequired,
    }),
    startOverride: z.preprocess(
      emptyToNull,
      z
        .string()
        .transform((value, context) => {
          const date = parseDateInput(value);
          if (!date)
            context.addIssue({
              code: "custom",
              message: me.memberships.startInvalid,
            });
          return date ?? "";
        })
        .nullable(),
    ),
  })
  .superRefine((value, context) => {
    // BR-058: Grupni, G+T and Personalni need a trainer.
    if (value.requiresTrainer && !value.trainerId)
      context.addIssue({
        code: "custom",
        path: ["trainerId"],
        message: me.errors.E_TRAINER_REQUIRED,
      });
    // D-71: Grupni and G+T also need the member's fixed class time.
    if (value.requiresTrainer && value.coversGroup && !value.classTime)
      context.addIssue({
        code: "custom",
        path: ["classTime"],
        message: me.errors.E_CLASS_TIME_REQUIRED,
      });
    // BR-059: Personalni has no list price, so its sessions are entered, and D-101: the
    // gym's fixed part, which is also the amount paid.
    if (value.planKind === "personal") {
      if (value.sessions === null)
        context.addIssue({
          code: "custom",
          path: ["sessions"],
          message: me.memberships.sessionsInvalid,
        });
      if (value.gymFee === null)
        context.addIssue({
          code: "custom",
          path: ["gymFee"],
          message: me.memberships.gymFeeInvalid,
        });
    }
  });

export type SaleFields = z.infer<typeof saleFieldsSchema>;

export const sellSchema = saleFieldsSchema.and(
  z.object({ memberId: z.string().uuid() }),
);

/** D-71: S-07 [Promijeni termin]. */
export const classTimeChangeSchema = z.object({
  memberId: z.string().uuid(),
  membershipId: z.string().uuid(),
  classTime: classTimeValue,
});

/** D-100 (BR-056): S-07 [Pauziraj]; the RPC checks the dates and the 7 days in total. */
export const pauseSchema = z.object({
  memberId: z.string().uuid(),
  membershipId: z.string().uuid(),
  pauseFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: me.memberships.pauseFromInvalid }),
  days: z.coerce
    .number({ message: me.memberships.pauseDaysInvalid.replace("{max}", "7") })
    .int(me.memberships.pauseDaysInvalid.replace("{max}", "7"))
    .min(1, me.memberships.pauseDaysInvalid.replace("{max}", "7"))
    .max(7, me.memberships.pauseDaysInvalid.replace("{max}", "7")),
});

/** D-100: S-07 [Prekini pauzu]. */
export const endPauseSchema = z.object({
  memberId: z.string().uuid(),
  pauseId: z.string().uuid(),
});
