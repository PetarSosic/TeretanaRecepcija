import { z } from "zod";
import { saleFieldsSchema } from "@/features/memberships/schemas";
import { parseDateInput } from "@/lib/format";
import { me } from "@/lib/i18n/me";
import { phoneSchema } from "@/lib/phone";
import { parseCardCode } from "@/lib/scan";

/**
 * N-16 (MEM-07): the shift report's font has no emoji, so the owner decided a member's
 * name may not contain them. The same ranges as has_emoji() in migration 0028: the
 * emoji blocks, the older symbol blocks, and the joiners and selectors that build them.
 */
const EMOJI =
  /[\u{1F000}-\u{1FAFF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{3030}\u{303D}\u{3297}\u{3299}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}\u{E0000}-\u{E007F}]/u;

export function hasEmoji(value: string): boolean {
  return EMOJI.test(value);
}

// BR-040 and BR-041: the member fields, mirrored by clean_member() in the database.
export const memberFieldsSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, me.members.firstNameInvalid)
    .max(50, me.members.firstNameInvalid)
    .refine((value) => !hasEmoji(value), me.members.firstNameEmoji),
  lastName: z
    .string()
    .trim()
    .min(1, me.members.lastNameInvalid)
    .max(50, me.members.lastNameInvalid)
    .refine((value) => !hasEmoji(value), me.members.lastNameEmoji),
  phone: phoneSchema,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, me.members.emailInvalid)
    .email(me.members.emailInvalid),
  // AS-2: 01.01.1900 up to today; the RPC checks "today" against gym_today.
  dateOfBirth: z.string().transform((value, context) => {
    const date = parseDateInput(value);
    if (!date || date < "1900-01-01") {
      context.addIssue({
        code: "custom",
        message: me.members.dateOfBirthInvalid,
      });
      return z.NEVER;
    }
    return date;
  }),
});

export const updateMemberSchema = memberFieldsSchema.and(
  z.object({ memberId: z.string().uuid() }),
);

/** BR-033: a member is never created without a scanned unassigned card. */
export const cardCodeSchema = z.string().transform((value, context) => {
  const code = parseCardCode(value);
  if (!code) {
    context.addIssue({ code: "custom", message: me.members.cardRequired });
    return z.NEVER;
  }
  return code;
});

export const registerSchema = memberFieldsSchema
  .and(saleFieldsSchema)
  .and(z.object({ cardCode: cardCodeSchema }));

export const anonymizeSchema = z.object({
  memberId: z.string().uuid(),
  memberNumber: z.string(),
  confirmation: z.string().trim(),
});

export const replaceCardSchema = z.object({
  memberId: z.string().uuid(),
  cardCode: cardCodeSchema,
  method: z.enum(["cash", "card"], { message: me.memberships.methodRequired }),
});
