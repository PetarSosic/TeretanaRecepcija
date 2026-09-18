import { z } from "zod";
import { me } from "@/lib/i18n/me";

// BR-041: normalization also belongs in the member RPCs when implemented in M-06.
export function normalizePhone(input: string): string {
  let value = input.replace(/[\s\-/()]/g, "");
  if (value.startsWith("00")) value = `+${value.slice(2)}`;
  else if (value.startsWith("0")) value = `+382${value.slice(1)}`;
  if (!/^\+[0-9]{8,15}$/.test(value)) throw new RangeError(me.errors.phone);
  return value;
}

export const phoneSchema = z.string().transform((value, context) => {
  try {
    return normalizePhone(value);
  } catch {
    context.addIssue({ code: "custom", message: me.errors.phone });
    return z.NEVER;
  }
});
