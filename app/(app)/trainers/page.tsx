import type { Metadata } from "next";
import { TrainerRoster } from "@/features/trainers/components/trainer-roster";
import { buildRoster, type RosterData } from "@/features/trainers/roster";
import { requireStaff } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { me } from "@/lib/i18n/me";
import { rpcCode } from "@/lib/rpc";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `${me.trainerRoster.title} — ${me.app.name}`,
};

/**
 * S-29 (D-72, BR-027): every role. The amounts are asked for only for the owner and the
 * admin, through the owner-only fin_roster_prices (BR-157, doc 08 §2); trainer_roster
 * itself never returns them.
 */
export default async function TrainerRosterPage() {
  const staff = await requireStaff();
  const isOwner = staff.role === "owner" || staff.role === "admin";
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("trainer_roster");
  if (error) {
    return (
      <p className="text-sm text-danger">{getErrorMessage(rpcCode(error))}</p>
    );
  }
  const roster = data as RosterData;

  let prices: Map<string, string> | undefined;
  if (isOwner) {
    const { data: rows, error: pricesError } = await supabase.rpc(
      "fin_roster_prices",
      { p_memberships: roster.members.map((row) => row.membership_id) },
    );
    if (pricesError) console.error(`fin_roster_prices: ${pricesError.message}`);
    prices = new Map(
      ((rows ?? []) as { membership_id: string; amount: string }[]).map(
        (row) => [row.membership_id, row.amount],
      ),
    );
  }

  return (
    <TrainerRoster
      trainers={buildRoster(roster, prices)}
      showPrices={isOwner}
    />
  );
}
