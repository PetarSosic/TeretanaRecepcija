import { z } from "zod";
import { passwordSchema } from "@/features/auth/schemas";
import { me } from "@/lib/i18n/me";

const fullName = z
  .string()
  .trim()
  .min(2, me.users.nameInvalid)
  .max(100, me.users.nameInvalid);

// Doc 07 §3: the same pattern the staff table enforces.
const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._]{3,30}$/, me.users.usernameInvalid);

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email(me.users.emailInvalid)
  .max(254, me.users.emailInvalid);

const role = z.enum(["admin", "owner", "manager", "receptionist"], {
  message: me.users.roleInvalid,
});

/**
 * D-57: every new account signs in with a username, whatever its role. The admin is
 * the exception and uses an email, so a forgotten admin password can be reset.
 */
export const createStaffSchema = z
  .object({
    role,
    fullName,
    username: z.string().optional(),
    email: z.string().optional(),
    password: passwordSchema,
  })
  .transform((value, context) => {
    if (value.role === "admin") {
      const parsed = email.safeParse(value.email ?? "");
      if (!parsed.success) {
        context.addIssue({
          code: "custom",
          path: ["email"],
          message: me.users.emailInvalid,
        });
        return z.NEVER;
      }
      return { ...value, email: parsed.data, username: null };
    }
    const parsed = username.safeParse(value.username ?? "");
    if (!parsed.success) {
      context.addIssue({
        code: "custom",
        path: ["username"],
        message: me.users.usernameInvalid,
      });
      return z.NEVER;
    }
    return { ...value, username: parsed.data, email: null };
  });

/** US-01.3 AC4: only the name is editable; the login identity stays fixed. */
export const updateStaffSchema = z.object({
  staffId: z.string().uuid(),
  fullName,
});

export const setPasswordSchema = z.object({
  staffId: z.string().uuid(),
  password: passwordSchema,
});

export const setActiveSchema = z.object({
  staffId: z.string().uuid(),
  active: z.boolean(),
});
