import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  MemberProfile,
  type ProfileMembership,
  type ProfilePayment,
  type ProfileTab,
  type ProfileVisit,
} from "@/features/members/components/member-profile";
import { loadSaleCatalog } from "@/features/memberships/catalog";
import { requireStaff } from "@/lib/auth";
import { me } from "@/lib/i18n/me";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `${me.members.title} — ${me.app.name}`,
};

const VISITS_PER_PAGE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// S-07. P-22: every role opens a profile; RLS decides which payments each role sees.
export default async function MemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const query = await searchParams;
  const tab: ProfileTab =
    query.tab === "uplate" || query.tab === "dolasci" ? query.tab : "clanarine";
  const visitPage = Math.max(
    1,
    Number.parseInt(String(query.strana ?? "1"), 10) || 1,
  );

  const supabase = await createClient();
  const { data: member } = await supabase
    .from("members")
    .select(
      "id, member_number, first_name, last_name, phone, email, date_of_birth, is_anonymized",
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      member_number: number;
      first_name: string;
      last_name: string;
      phone: string | null;
      email: string | null;
      date_of_birth: string | null;
      is_anonymized: boolean;
    }>();
  if (!member) notFound();

  const from = (visitPage - 1) * VISITS_PER_PAGE;
  const [card, memberships, payments, visits, unpaid, catalog] =
    await Promise.all([
      supabase
        .from("cards")
        .select("code")
        .eq("member_id", id)
        .eq("status", "active")
        .maybeSingle<{ code: string }>(),
      supabase.rpc("member_memberships", { p_member: id }),
      // P-29: the owner sees every payment; the others see today's (doc 07 §6).
      supabase
        .from("payments")
        .select(
          "id, created_at, paid_on, kind, amount::text, method, is_backdated, voided_at, void_reason, created_by, plans(name)",
        )
        .eq("member_id", id)
        .order("created_at", { ascending: false })
        .returns<
          (Omit<ProfilePayment, "entered_by" | "plan_name"> & {
            created_by: string;
            plans: { name: string } | null;
          })[]
        >(),
      // US-07.2 AC2: 20 visits a page.
      supabase
        .from("visits")
        .select(
          "id, checked_in_at, checked_out_at, visit_type, is_unpaid, is_backdated, trainers(full_name)",
          { count: "exact" },
        )
        .eq("member_id", id)
        .order("checked_in_at", { ascending: false })
        .range(from, from + VISITS_PER_PAGE - 1)
        .returns<
          (Omit<ProfileVisit, "trainer_name"> & {
            trainers: { full_name: string } | null;
          })[]
        >(),
      // US-10.1: the unlinked unpaid visits (glossary, doc 02).
      supabase
        .from("visits")
        .select("id", { count: "exact", head: true })
        .eq("member_id", id)
        .eq("is_unpaid", true)
        .is("membership_id", null),
      loadSaleCatalog(staff),
    ]);
  if (memberships.error)
    console.error(`member_memberships: ${memberships.error.message}`);

  // Doc 07 §6 hides colleagues' staff rows from a receptionist; staff_names returns
  // exactly the names this list needs (migration 0012).
  const creatorIds = [
    ...new Set((payments.data ?? []).map((p) => p.created_by)),
  ];
  const names = new Map<string, string>();
  if (creatorIds.length) {
    const { data } = await supabase.rpc("staff_names", { p_ids: creatorIds });
    for (const row of (data ?? []) as { id: string; full_name: string }[])
      names.set(row.id, row.full_name);
  }

  return (
    <MemberProfile
      member={member}
      cardCode={card.data?.code ?? null}
      unpaidCount={unpaid.count ?? 0}
      memberships={(memberships.data ?? []) as ProfileMembership[]}
      payments={(payments.data ?? []).map(
        ({ plans, created_by, ...payment }) => ({
          ...payment,
          plan_name: plans?.name ?? null,
          entered_by: names.get(created_by) ?? "—",
        }),
      )}
      visits={(visits.data ?? []).map(({ trainers, ...visit }) => ({
        ...visit,
        trainer_name: trainers?.full_name ?? null,
      }))}
      visitTotal={visits.count ?? 0}
      visitPage={visitPage}
      visitsPerPage={VISITS_PER_PAGE}
      tab={tab}
      catalog={catalog}
    />
  );
}
