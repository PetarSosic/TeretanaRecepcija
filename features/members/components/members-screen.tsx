"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableWrapper, Td, Th } from "@/components/ui/table";
import type { SaleCatalog } from "@/features/memberships/catalog";
import { useCheckInFlow } from "@/features/reception/components/check-in-flow";
import { formatDate } from "@/lib/format";
import { me } from "@/lib/i18n/me";
import { RegisterDialog } from "./register-dialog";

export type MemberRow = {
  id: string;
  member_number: number;
  first_name: string;
  last_name: string;
  phone: string | null;
  status: keyof typeof me.memberships.status | null;
  status_date: string | null;
  last_visit: string | null;
};

export type MemberFilter = "all" | "active" | "inactive";

const PAGE_SIZE = 25;

/** BR-054 in one line: the member's best status today and the date that goes with it. */
export function statusSummary(
  status: MemberRow["status"],
  date: string | null,
): string {
  if (!status) return me.members.noStatus;
  const label = me.memberships.status[status];
  if (!date || status === "voided") return label;
  const template =
    status === "upcoming" ? me.members.statusFrom : me.members.statusUntil;
  return template
    .replace("{status}", label)
    .replace("{date}", formatDate(date));
}

/** S-06 (US-07.1): search, status filter, 25 rows a page, and [Novi član]. */
export function MembersScreen({
  rows,
  total,
  query,
  filter,
  page,
  hasAnyMember,
  catalog,
}: {
  rows: MemberRow[];
  total: number;
  query: string;
  filter: MemberFilter;
  page: number;
  hasAnyMember: boolean;
  catalog: SaleCatalog;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [text, setText] = useState(query);
  const [registering, setRegistering] = useState(false);
  const [navigating, startNavigation] = useTransition();
  const flow = useCheckInFlow({ catalog, onChanged: () => router.refresh() });

  function go(next: { q?: string; status?: MemberFilter; page?: number }) {
    const params = new URLSearchParams();
    const q = next.q ?? query;
    const status = next.status ?? filter;
    const target = next.page ?? 1;
    if (q) params.set("q", q);
    if (status !== "all") params.set("status", status);
    if (target > 1) params.set("page", String(target));
    const search = params.toString();
    startNavigation(() =>
      router.replace(search ? `${pathname}?${search}` : pathname),
    );
  }

  // Doc 08 §9: results follow typing after a 250 ms pause.
  useEffect(() => {
    if (text.trim() === query) return;
    const timer = setTimeout(() => go({ q: text.trim() }), 250);
    return () => clearTimeout(timer);
    // `go` reads the current URL state; re-running on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, query]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const emptyText = hasAnyMember ? me.members.empty : me.members.emptyDatabase;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {me.members.title}
        </h1>
        <Button type="button" onClick={() => setRegistering(true)}>
          <UserPlus aria-hidden="true" />
          {me.members.create}
        </Button>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_16rem]">
        <div className="grid gap-2">
          <Label htmlFor="member-search" className="sr-only">
            {me.members.search}
          </Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute top-3 left-3 size-4 text-muted-foreground"
            />
            <Input
              id="member-search"
              type="search"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={me.members.search}
              autoComplete="off"
              className="pl-9"
            />
            {navigating ? (
              <Loader2
                aria-hidden="true"
                className="absolute top-3 right-3 size-4 animate-spin text-muted-foreground"
              />
            ) : null}
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="member-filter" className="sr-only">
            {me.members.filter}
          </Label>
          <Select
            id="member-filter"
            value={filter}
            onChange={(event) =>
              go({ status: event.target.value as MemberFilter })
            }
          >
            <option value="all">{me.members.filterAll}</option>
            <option value="active">{me.members.filterActive}</option>
            <option value="inactive">{me.members.filterInactive}</option>
          </Select>
        </div>
      </div>

      <TableWrapper className="rounded-2xl border bg-card">
        <Table>
          <thead>
            <tr>
              <Th>{me.members.columnNumber}</Th>
              <Th>{me.members.columnName}</Th>
              <Th>{me.members.columnPhone}</Th>
              <Th>{me.members.columnStatus}</Th>
              <Th>{me.members.columnLastVisit}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <Td colSpan={5} className="text-muted-foreground">
                  {emptyText}
                </Td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer hover:bg-muted"
                  onClick={() => router.push(`/members/${row.id}`)}
                >
                  <Td className="tabular-nums">{row.member_number}</Td>
                  <Td>
                    {/* The link keeps the row reachable by keyboard (D-47). */}
                    <Link
                      href={`/members/${row.id}`}
                      className="font-medium hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {row.first_name} {row.last_name}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap">{row.phone}</Td>
                  <Td className="whitespace-nowrap">
                    {statusSummary(row.status, row.status_date)}
                  </Td>
                  <Td>{row.last_visit ? formatDate(row.last_visit) : "—"}</Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </TableWrapper>

      {pages > 1 ? (
        <nav
          className="mt-4 flex items-center justify-between gap-2 text-sm"
          aria-label={me.members.title}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => go({ page: page - 1 })}
          >
            {me.members.previous}
          </Button>
          <span>
            {me.members.page
              .replace("{page}", String(page))
              .replace("{pages}", String(pages))}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => go({ page: page + 1 })}
          >
            {me.members.next}
          </Button>
        </nav>
      ) : null}

      <RegisterDialog
        open={registering}
        onOpenChange={setRegistering}
        catalog={catalog}
        onRegistered={(member) => {
          // S-05: with "Prijavi odmah", the check-in result follows (S-03b/c/d).
          if (member.checkIn)
            flow.handle({ result: "checked_in", check_in: member.checkIn });
        }}
      />
      {flow.element}
    </>
  );
}
