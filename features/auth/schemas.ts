import { z } from "zod";
import { me } from "@/lib/i18n/me";

// Doc 08 §4: at least 8 characters.
export const passwordSchema = z.string().min(8, me.password.tooShort);

// US-01.1 AC2: input with "@" is an email, without it a username.
export const loginSchema = z.object({
  identifier: z.string().trim().min(1, me.login.failed),
  password: z.string().min(1, me.login.failed),
});

export const resetRequestSchema = z.object({
  identifier: z.string().trim().min(1, me.users.emailInvalid),
});

export const changePasswordSchema = z
  .object({
    current: z.string().optional(),
    next: passwordSchema,
    repeat: z.string(),
  })
  .refine((value) => value.next === value.repeat, {
    path: ["repeat"],
    message: me.password.mismatch,
  });

export function isEmail(identifier: string): boolean {
  return identifier.includes("@");
}
