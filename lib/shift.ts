import "server-only";
import { getSessionContext, type OpenShift } from "@/lib/auth";

export type { OpenShift };

/**
 * The gym's open shift (BR-110), or null. Doc 07 §6 hides another receptionist's staff
 * row, so the holder's name comes from the database function (migration 0011); since
 * D-89 it arrives with the rest of the session, so the layout and the page of one render
 * share it with no call of their own.
 */
export async function getOpenShift(): Promise<OpenShift | null> {
  return (await getSessionContext())?.open_shift ?? null;
}
