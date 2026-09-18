import type { Metadata } from "next";
import {
  MembersScreen,
  type MemberFilter,
  type MemberRow,
} from "@/features/members/components/members-screen";
import { loadSaleCatalog } from "@/features/memberships/catalog";
import { requireStaff } from "@/lib/auth";
import { me } from "@/lib/i18n/me";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `${me.members.title} — ${me.app.name}`,
};

const PAGE_SIZE = 25;

// S-06. P-22: every role searches and lists members (BR-044 lives in member_search).
export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const filter: MemberFilter =
    params.status === "active" || params.status === "inactive"
      ? params.status
      : "all";
  const page = Math.max(
    1,
    Number.parseInt(String(params.page ?? "1"), 10) || 1,
  );

  const supabase = await createClient();
  const [result, anyMember, catalog] = await Promise.all([
    supabase.rpc("member_search", {
      p_query: query,
      p_filter: filter,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
    // S-06 has its own empty text for a gym that has no members at all yet.
    supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("is_anonymized", false),
    loadSaleCatalog(staff),
  ]);
  if (result.error) console.error(`member_search: ${result.error.message}`);

  const rows = (result.data ?? []) as (MemberRow & { total: number })[];
  return (
    <MembersScreen
      rows={rows}
      total={rows[0]?.total ?? 0}
      query={query}
      filter={filter}
      page={page}
      hasAnyMember={(anyMember.count ?? 0) > 0}
      catalog={catalog}
    />
  );
}
