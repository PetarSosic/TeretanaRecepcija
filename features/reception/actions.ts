"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { rpcCode } from "@/lib/rpc";
import { createClient } from "@/lib/supabase/server";
import type {
  ReceptionPanel,
  ScanOutcome,
  SearchResult,
  VisitType,
} from "./types";

// Doc 08 §6: each action calls one RPC with the caller's session. They answer with the
// outcome or a ready message, never a raw database error (doc 08 §5).

type Answer<T> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(
  rpc: string,
  args: Record<string, unknown>,
  paths: string[] = [],
): Promise<Answer<T>> {
  await requireStaff();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(rpc, args);
  if (error) return { ok: false, error: getErrorMessage(rpcCode(error)) };
  for (const path of paths) revalidatePath(path);
  return { ok: true, data: data as T };
}

const uuid = z.string().uuid();

/** BR-070: the scanner's input, decided by scan_card (≤ 1 s to the screen, D-46). */
export async function scanCard(code: string): Promise<Answer<ScanOutcome>> {
  return call<ScanOutcome>("scan_card", { p_code: code.slice(0, 40) });
}

/** F-05 and BR-080: a manual check-in, from the search or [Ručna prijava]. */
export async function beginCheckIn(
  memberId: string,
): Promise<Answer<ScanOutcome>> {
  if (!uuid.safeParse(memberId).success)
    return { ok: false, error: getErrorMessage("E_VALIDATION") };
  return call<ScanOutcome>("begin_check_in", { p_member: memberId });
}

const checkInSchema = z.object({
  memberId: uuid,
  type: z.enum(["gym", "group", "personal"]),
  membershipId: uuid.nullable(),
  trainerId: uuid.nullable(),
  slotId: uuid.nullable(),
  manual: z.boolean(),
});

/** S-03a [Prijavi] (BR-073 to BR-076). */
export async function checkIn(input: {
  memberId: string;
  type: VisitType;
  membershipId: string | null;
  trainerId: string | null;
  slotId: string | null;
  manual: boolean;
}): Promise<Answer<ScanOutcome>> {
  const parsed = checkInSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: getErrorMessage("E_VALIDATION") };
  const value = parsed.data;
  const answer = await call<unknown>("check_in", {
    p_member: value.memberId,
    p_type: value.type,
    p_membership: value.membershipId,
    p_trainer: value.type === "gym" ? null : value.trainerId,
    p_slot: value.type === "group" ? value.slotId : null,
    p_manual: value.manual,
  });
  if (!answer.ok) return answer;
  return {
    ok: true,
    data: { result: "checked_in", check_in: answer.data } as ScanOutcome,
  };
}

/** BR-072 and BR-080: [Odjavi], or S-03e's confirmation. */
export async function checkOut(
  visitId: string,
  confirmed: boolean,
): Promise<Answer<ScanOutcome>> {
  if (!uuid.safeParse(visitId).success)
    return { ok: false, error: getErrorMessage("E_VALIDATION") };
  return call<ScanOutcome>("check_out", {
    p_visit: visitId,
    p_confirmed: confirmed,
  });
}

/** S-03 search (BR-044): up to eight members. */
export async function searchMembers(query: string): Promise<SearchResult[]> {
  const text = query.trim().slice(0, 100);
  if (!text) return [];
  const answer = await call<SearchResult[]>("member_search", {
    p_query: text,
    p_filter: "all",
    p_limit: 8,
    p_offset: 0,
  });
  return answer.ok ? answer.data : [];
}

/** BR-081: the "U teretani" list and today's count, refreshed after every action. */
export async function loadPanel(): Promise<ReceptionPanel | null> {
  const answer = await call<ReceptionPanel>("reception_panel", {});
  return answer.ok ? answer.data : null;
}
