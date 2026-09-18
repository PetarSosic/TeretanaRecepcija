"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CircleAlert,
  CreditCard,
  Pencil,
  LogIn,
  LogOut,
  Plus,
  ShieldOff,
  UserX,
} from "lucide-react";
import { MoneyButton } from "@/components/common/money-button";
import { Button } from "@/components/ui/button";
import { Table, TableWrapper, Td, Th } from "@/components/ui/table";
import type { SaleCatalog } from "@/features/memberships/catalog";
import type { TrainerDefaults } from "@/features/memberships/components/membership-fields";
import { SellDialog } from "@/features/memberships/components/sell-dialog";
import { beginCheckIn, checkOut } from "@/features/reception/actions";
import { useCheckInFlow } from "@/features/reception/components/check-in-flow";
import { useToast } from "@/components/common/toast";
import { formatDate, formatMoney, formatTime } from "@/lib/format";
import { me } from "@/lib/i18n/me";
import { cn } from "@/lib/utils";
import {
  AnonymizeDialog,
  EditMemberDialog,
  LostCardDialog,
} from "./member-dialogs";

export type ProfileTab = "clanarine" | "uplate" | "dolasci";

type VisitType = keyof typeof me.visitTypes;

export type ProfileMembership = {
  id: string;
  plan_id: string;
  plan_name: string;
  plan_kind: "gym" | "group" | "combo" | "personal";
  plan_is_active: boolean;
  trainer_id: string | null;
  trainer_name: string | null;
  start_date: string;
  end_date: string;
  status: keyof typeof me.memberships.status;
  covers_gym: boolean;
  covers_group: boolean;
  covers_personal: boolean;
  gym_visit_limit: number | null;
  gym_used: number;
  group_session_limit: number | null;
  group_used: number;
  personal_session_limit: number | null;
  personal_used: number;
  is_backdated: boolean;
};

export type ProfilePayment = {
  id: string;
  created_at: string;
  paid_on: string;
  kind: "membership" | "day_pass" | "card_replacement";
  amount: string;
  method: "cash" | "card";
  is_backdated: boolean;
  voided_at: string | null;
  void_reason: string | null;
  plan_name: string | null;
  entered_by: string;
};

export type ProfileVisit = {
  id: string;
  checked_in_at: string;
  checked_out_at: string | null;
  visit_type: VisitType;
  is_unpaid: boolean;
  is_backdated: boolean;
  trainer_name: string | null;
};

type Member = {
  id: string;
  member_number: number;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  date_of_birth: string | null;
  is_anonymized: boolean;
};

const KIND_LABEL: Record<ProfilePayment["kind"], string> = {
  membership: me.members.kindMembership,
  day_pass: me.members.kindDayPass,
  card_replacement: me.members.kindCardReplacement,
};

/** BR-055: remaining sessions per limited type, or Neograničeno. */
function remainingText(membership: ProfileMembership): string {
  const limited = (
    [
      [
        "gym",
        membership.covers_gym,
        membership.gym_visit_limit,
        membership.gym_used,
      ],
      [
        "group",
        membership.covers_group,
        membership.group_session_limit,
        membership.group_used,
      ],
      [
        "personal",
        membership.covers_personal,
        membership.personal_session_limit,
        membership.personal_used,
      ],
    ] as const
  ).filter(([, covers, limit]) => covers && limit !== null);
  if (!limited.length) return me.members.unlimited;
  return limited
    .map(([type, , limit, used]) =>
      me.members.remaining
        .replace("{type}", me.visitTypes[type])
        .replace("{count}", String(Math.max((limit ?? 0) - used, 0))),
    )
    .join(" · ");
}

/** BR-058: the trainer of the member's latest membership of each kind. */
function trainerDefaultsOf(memberships: ProfileMembership[]): TrainerDefaults {
  const defaults: TrainerDefaults = {};
  const latestFirst = [...memberships]
    .filter((membership) => membership.trainer_id)
    .sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  for (const membership of latestFirst) {
    const kind = membership.plan_kind === "personal" ? "personal" : "group";
    defaults[kind] ??= membership.trainer_id ?? undefined;
  }
  return defaults;
}

/** S-07 (US-07.2): the member, their card, and the three history tabs. */
export function MemberProfile({
  member,
  cardCode,
  unpaidCount,
  openVisitId,
  memberships,
  payments,
  visits,
  visitTotal,
  visitPage,
  visitsPerPage,
  tab,
  catalog,
}: {
  member: Member;
  cardCode: string | null;
  unpaidCount: number;
  /** BR-071: the member's open visit, if they are in the gym. */
  openVisitId: string | null;
  memberships: ProfileMembership[];
  payments: ProfilePayment[];
  visits: ProfileVisit[];
  visitTotal: number;
  visitPage: number;
  visitsPerPage: number;
  tab: ProfileTab;
  catalog: SaleCatalog;
}) {
  const [selling, setSelling] = useState<{ planId?: string } | null>(null);
  const [dialog, setDialog] = useState<
    "edit" | "anonymize" | "lostCard" | null
  >(null);
  const readOnly = member.is_anonymized;
  const router = useRouter();
  const toast = useToast();
  const [checking, startChecking] = useTransition();
  const flow = useCheckInFlow({ catalog, onChanged: () => router.refresh() });

  // BR-080: [Ručna prijava] runs the S-03 flow with is_manual; [Ručna odjava] is the
  // deliberate check-out of "U teretani".
  function manual(work: ReturnType<typeof beginCheckIn>) {
    startChecking(async () => {
      const answer = await work;
      if (answer.ok) flow.handle(answer.data);
      else toast({ tone: "error", message: answer.error });
    });
  }
  const fullName = `${member.first_name} ${member.last_name}`;
  const trainerDefaults = trainerDefaultsOf(memberships);
  const visitPages = Math.max(1, Math.ceil(visitTotal / visitsPerPage));

  const tabs: { id: ProfileTab; label: string }[] = [
    { id: "clanarine", label: me.members.tabMemberships },
    { id: "uplate", label: me.members.tabPayments },
    { id: "dolasci", label: me.members.tabVisits },
  ];

  return (
    <>
      <header className="mb-6 grid gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{fullName}</h1>
          <span className="text-lg text-muted-foreground tabular-nums">
            #{member.member_number}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1">
            <CreditCard aria-hidden="true" className="size-4" />
            {cardCode
              ? me.members.cardActive.replace("{code}", cardCode)
              : me.members.cardNone}
          </span>
          {/* US-10.1: red, with an icon, only when there are unpaid visits (D-47). */}
          {unpaidCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-danger px-3 py-1 font-medium text-primary-foreground">
              <CircleAlert aria-hidden="true" className="size-4" />
              {me.members.unpaidBadge.replace("{count}", String(unpaidCount))}
            </span>
          ) : null}
        </div>
        {!readOnly ? (
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">{me.members.phone}</dt>
              <dd>{member.phone}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{me.members.email}</dt>
              <dd className="break-all">{member.email}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {me.members.dateOfBirth}
              </dt>
              <dd>
                {member.date_of_birth ? formatDate(member.date_of_birth) : ""}
              </dd>
            </div>
          </dl>
        ) : (
          // S-07: an anonymized profile is read-only, with this banner.
          <p
            role="status"
            className="flex items-center gap-2 rounded-lg border bg-muted px-3 py-2 text-sm"
          >
            <ShieldOff aria-hidden="true" className="size-4" />
            {me.members.anonymizedBanner}
          </p>
        )}
        {!readOnly ? (
          <div className="flex flex-wrap gap-2">
            <MoneyButton type="button" onClick={() => setSelling({})}>
              <Plus aria-hidden="true" />
              {me.members.newMembership}
            </MoneyButton>
            <MoneyButton
              type="button"
              variant="outline"
              onClick={() => setDialog("lostCard")}
            >
              {me.members.lostCard}
            </MoneyButton>
            {openVisitId ? (
              <Button
                type="button"
                variant="outline"
                disabled={checking}
                onClick={() => manual(checkOut(openVisitId, true))}
              >
                <LogOut aria-hidden="true" />
                {me.reception.manualCheckOut}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={checking}
                onClick={() => manual(beginCheckIn(member.id))}
              >
                <LogIn aria-hidden="true" />
                {me.reception.manualCheckIn}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialog("edit")}
            >
              <Pencil aria-hidden="true" />
              {me.members.edit}
            </Button>
            {catalog.isOwner ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setDialog("anonymize")}
              >
                <UserX aria-hidden="true" />
                {me.members.anonymize}
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

      <nav
        aria-label={me.members.tabs}
        className="mb-4 flex gap-1 overflow-x-auto border-b"
      >
        {tabs.map((item) => (
          <Link
            key={item.id}
            href={
              item.id === "clanarine"
                ? `/members/${member.id}`
                : `/members/${member.id}?tab=${item.id}`
            }
            scroll={false}
            aria-current={tab === item.id ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground",
              tab === item.id && "border-primary text-foreground",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {tab === "clanarine" ? (
        <TableWrapper className="rounded-2xl border bg-card">
          <Table>
            <thead>
              <tr>
                <Th>{me.members.columnPlan}</Th>
                <Th>{me.members.columnTrainer}</Th>
                <Th>{me.members.columnFrom}</Th>
                <Th>{me.members.columnUntil}</Th>
                <Th>{me.members.columnStatus}</Th>
                <Th>{me.members.columnRemaining}</Th>
                <Th>
                  <span className="sr-only">{me.users.actions}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {memberships.length === 0 ? (
                <tr>
                  <Td colSpan={7} className="text-muted-foreground">
                    {me.members.noMemberships}
                  </Td>
                </tr>
              ) : (
                memberships.map((membership) => (
                  <tr
                    key={membership.id}
                    className={cn(
                      membership.status === "voided" &&
                        "text-muted-foreground line-through",
                    )}
                  >
                    <Td className="font-medium">
                      {membership.plan_name}
                      {membership.is_backdated ? (
                        <span className="ml-2 rounded border px-1.5 text-xs no-underline">
                          {me.members.backdated}
                        </span>
                      ) : null}
                    </Td>
                    <Td>{membership.trainer_name ?? "—"}</Td>
                    <Td>{formatDate(membership.start_date)}</Td>
                    <Td>{formatDate(membership.end_date)}</Td>
                    <Td>{me.memberships.status[membership.status]}</Td>
                    <Td>{remainingText(membership)}</Td>
                    <Td className="text-right">
                      {/* US-08.2: [Produži] on every membership that is not voided. */}
                      {membership.status !== "voided" && !readOnly ? (
                        <MoneyButton
                          type="button"
                          size="sm"
                          variant="outline"
                          aria-label={`${me.members.renew} ${membership.plan_name}`}
                          onClick={() =>
                            setSelling({
                              planId: membership.plan_is_active
                                ? membership.plan_id
                                : undefined,
                            })
                          }
                        >
                          {me.members.renew}
                        </MoneyButton>
                      ) : null}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </TableWrapper>
      ) : null}

      {tab === "uplate" ? (
        <TableWrapper className="rounded-2xl border bg-card">
          <Table>
            <thead>
              <tr>
                <Th>{me.members.columnDate}</Th>
                <Th>{me.members.columnKind}</Th>
                <Th>{me.members.columnPlan}</Th>
                <Th className="text-right">{me.members.columnAmount}</Th>
                <Th>{me.members.columnMethod}</Th>
                <Th>{me.members.columnEnteredBy}</Th>
                <Th>{me.members.columnStatus}</Th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <Td colSpan={7} className="text-muted-foreground">
                    {me.members.noPayments}
                  </Td>
                </tr>
              ) : (
                payments.map((payment) => (
                  <tr
                    key={payment.id}
                    className={cn(
                      payment.voided_at && "text-muted-foreground line-through",
                    )}
                    title={payment.void_reason ?? undefined}
                  >
                    <Td>{formatDate(payment.paid_on)}</Td>
                    <Td>
                      {KIND_LABEL[payment.kind]}
                      {payment.is_backdated ? (
                        <span className="ml-2 rounded border px-1.5 text-xs">
                          {me.members.backdated}
                        </span>
                      ) : null}
                    </Td>
                    <Td>{payment.plan_name ?? "—"}</Td>
                    <Td className="text-right tabular-nums whitespace-nowrap">
                      {formatMoney(payment.amount)}
                    </Td>
                    <Td>
                      {payment.method === "cash"
                        ? me.memberships.cash
                        : me.memberships.card}
                    </Td>
                    <Td>{payment.entered_by}</Td>
                    <Td>{payment.voided_at ? me.members.voided : ""}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </TableWrapper>
      ) : null}

      {tab === "dolasci" ? (
        <>
          <TableWrapper className="rounded-2xl border bg-card">
            <Table>
              <thead>
                <tr>
                  <Th>{me.members.columnDate}</Th>
                  <Th>{me.members.columnCheckIn}</Th>
                  <Th>{me.members.columnCheckOut}</Th>
                  <Th>{me.members.columnVisitType}</Th>
                  <Th>{me.members.columnTrainer}</Th>
                  <Th>
                    <span className="sr-only">{me.members.unpaid}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {visits.length === 0 ? (
                  <tr>
                    <Td colSpan={6} className="text-muted-foreground">
                      {me.members.noVisits}
                    </Td>
                  </tr>
                ) : (
                  visits.map((visit) => (
                    <tr key={visit.id}>
                      <Td>{formatDate(visit.checked_in_at)}</Td>
                      <Td>{formatTime(visit.checked_in_at)}</Td>
                      <Td>
                        {visit.checked_out_at
                          ? formatTime(visit.checked_out_at)
                          : "—"}
                      </Td>
                      <Td>{me.visitTypes[visit.visit_type]}</Td>
                      <Td>{visit.trainer_name ?? "—"}</Td>
                      <Td>
                        {visit.is_unpaid ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-danger px-2 py-0.5 text-xs font-medium text-danger">
                            <CircleAlert
                              aria-hidden="true"
                              className="size-3"
                            />
                            {me.members.unpaid}
                          </span>
                        ) : null}
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </TableWrapper>
          {visitPages > 1 ? (
            <nav
              className="mt-4 flex items-center justify-between gap-2 text-sm"
              aria-label={me.members.tabVisits}
            >
              <Button
                asChild={visitPage > 1}
                variant="outline"
                size="sm"
                disabled={visitPage <= 1}
              >
                {visitPage > 1 ? (
                  <Link
                    href={`/members/${member.id}?tab=dolasci&strana=${visitPage - 1}`}
                    scroll={false}
                  >
                    {me.members.previous}
                  </Link>
                ) : (
                  me.members.previous
                )}
              </Button>
              <span>
                {me.members.page
                  .replace("{page}", String(visitPage))
                  .replace("{pages}", String(visitPages))}
              </span>
              <Button
                asChild={visitPage < visitPages}
                variant="outline"
                size="sm"
                disabled={visitPage >= visitPages}
              >
                {visitPage < visitPages ? (
                  <Link
                    href={`/members/${member.id}?tab=dolasci&strana=${visitPage + 1}`}
                    scroll={false}
                  >
                    {me.members.next}
                  </Link>
                ) : (
                  me.members.next
                )}
              </Button>
            </nav>
          ) : null}
        </>
      ) : null}

      {flow.element}
      <SellDialog
        open={selling !== null}
        onOpenChange={(open) => !open && setSelling(null)}
        memberId={member.id}
        catalog={catalog}
        defaultPlanId={selling?.planId}
        trainerDefaults={trainerDefaults}
      />
      <EditMemberDialog
        open={dialog === "edit"}
        onOpenChange={(open) => !open && setDialog(null)}
        memberId={member.id}
        defaults={{
          firstName: member.first_name,
          lastName: member.last_name,
          phone: member.phone ?? "",
          email: member.email ?? "",
          dateOfBirth: member.date_of_birth
            ? formatDate(member.date_of_birth)
            : "",
        }}
      />
      <LostCardDialog
        open={dialog === "lostCard"}
        onOpenChange={(open) => !open && setDialog(null)}
        memberId={member.id}
        fee={catalog.cardFee}
      />
      {catalog.isOwner ? (
        <AnonymizeDialog
          open={dialog === "anonymize"}
          onOpenChange={(open) => !open && setDialog(null)}
          memberId={member.id}
          memberNumber={member.member_number}
        />
      ) : null}
    </>
  );
}
