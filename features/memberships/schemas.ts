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

const optionalUuid = z.preprocess(
  emptyToNull,
  z.string().uuid({ message: me.memberships.trainerPlaceholder }).nullable(),
);

export const saleFieldsSchema = z
  .object({
    planId: z.string().uuid({ message: me.memberships.planRequired }),
    // Sent by the form so the Personalni rules can be reported on the right field.
    planKind: z.enum(["gym", "group", "combo", "personal"], {
      message: me.memberships.planRequired,
    }),
    requiresTrainer: z.enum(["true", "false"]).transform((v) => v === "true"),
    trainerId: optionalUuid,
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
    // BR-059: Personalni has no list price, so its amount and sessions are entered.
    if (value.planKind === "personal") {
      if (value.amount === null)
        context.addIssue({
          code: "custom",
          path: ["amount"],
          message: me.memberships.amountInvalid,
        });
      if (value.sessions === null)
        context.addIssue({
          code: "custom",
          path: ["sessions"],
          message: me.memberships.sessionsInvalid,
        });
    }
  });

export type SaleFields = z.infer<typeof saleFieldsSchema>;

export const sellSchema = saleFieldsSchema.and(
  z.object({ memberId: z.string().uuid() }),
);
