import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import { getErrorMessage } from "@/lib/errors";
import type { ActionState } from "@/lib/action-state";

/** Doc 06 §1: a Zod issue becomes the message under its field. */
export function fieldErrorsOf(
  issues: { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] ??= issue.message;
  }
  return fieldErrors;
}

/** The coded RPC error (doc 08 §5); a raw database error is logged, never shown. */
export function rpcCode(error: PostgrestError): string {
  const code = error.message.trim();
  if (!code.startsWith("E_")) console.error(`RPC failed: ${error.message}`);
  return code;
}

export function rpcFailure<T>(
  error: PostgrestError,
  parameters: Record<string, string> = {},
): ActionState<T> {
  return { error: getErrorMessage(rpcCode(error), parameters) };
}
