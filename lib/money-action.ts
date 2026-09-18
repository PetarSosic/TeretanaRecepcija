import { me } from "@/lib/i18n/me";

/**
 * BR-092 and F-27: whether a money action may be attempted right now, and the reason
 * when it may not. Money records are payments, sales and expenses paid from the till.
 *
 * The rule is a pure function so it can be tested on its own and so every money button
 * in the app answers the question the same way.
 */
export function moneyActionState({
  hasOpenShift,
  isOffline,
}: {
  hasOpenShift: boolean;
  isOffline: boolean;
}): { disabled: boolean; reason?: string } {
  // F-27 AC2: with no connection nothing can be saved, so that comes first.
  if (isOffline) return { disabled: true, reason: me.offline.banner };
  if (!hasOpenShift)
    return { disabled: true, reason: me.errors.E_NO_OPEN_SHIFT };
  return { disabled: false };
}
