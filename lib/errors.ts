import { me } from "@/lib/i18n/me";

export type RuleErrorCode = Exclude<
  keyof typeof me.errors,
  "unexpected" | "phone"
>;

// Doc 08 §5: never expose a raw database error or interpolate unknown details.
export function getErrorMessage(
  code: string,
  parameters: Record<string, string> = {},
): string {
  if (!code.startsWith("E_") || !Object.hasOwn(me.errors, code))
    return me.errors.unexpected;
  const template = me.errors[code as RuleErrorCode];
  let missingParameter = false;
  const message = template.replace(/\{(\w+)\}/g, (_, key: string) => {
    if (!Object.hasOwn(parameters, key)) {
      missingParameter = true;
      return "";
    }
    return parameters[key];
  });
  return missingParameter ? me.errors.unexpected : message;
}
