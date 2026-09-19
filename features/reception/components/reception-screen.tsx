"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  CircleAlert,
  Loader2,
  Receipt,
  ScanLine,
  Search,
  Ticket,
  UserPlus,
  Volume2,
} from "lucide-react";
import { MoneyButton } from "@/components/common/money-button";
import { useAppState } from "@/components/common/app-state";
import { useToast } from "@/components/common/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RegisterDialog } from "@/features/members/components/register-dialog";
import type { SaleCatalog } from "@/features/memberships/catalog";
import {
  DayPassDialog,
  DeskExpenseDialog,
  type ExpenseCategory,
} from "@/features/payments/components/desk-dialogs";
import { formatDuration, formatTime } from "@/lib/format";
import { getErrorMessage } from "@/lib/errors";
import { me } from "@/lib/i18n/me";
import { isAudioUnlocked, unlockAudio } from "@/lib/sounds";
import {
  beginCheckIn,
  checkOut,
  loadPanel,
  scanCard,
  searchMembers,
} from "../actions";
import type { ReceptionPanel, ScanOutcome, SearchResult } from "../types";
import { useCheckInFlow } from "./check-in-flow";

/** BR-070: the card answers S-03 shows in its status area (red, 5 s, no dialog). */
const CARD_MESSAGES: Record<string, string> = {
  invalid: getErrorMessage("E_CARD_INVALID"),
  unknown: getErrorMessage("E_CARD_UNKNOWN"),
  deactivated: getErrorMessage("E_CARD_DEACTIVATED"),
};

/** S-03 Recepcija (F-04, F-05, F-10). */
export function ReceptionScreen({
  initialPanel,
  catalog,
  dayPassPrice,
  expenseCategories,
}: {
  initialPanel: ReceptionPanel;
  catalog: SaleCatalog;
  /** BR-100: the current day-pass price, for S-10's live total. */
  dayPassPrice: string | null;
  /** BR-132: active, non-salary categories for S-11. */
  expenseCategories: ExpenseCategory[];
}) {
  const [panel, setPanel] = useState(initialPanel);
  const [status, setStatus] = useState<string | null>(null);
  const [registerCard, setRegisterCard] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [deskDialog, setDeskDialog] = useState<"dayPass" | "expense" | null>(
    null,
  );
  const [audioReady, setAudioReady] = useState(true);
  const [scanning, startScan] = useTransition();
  const { reportNetworkFailure, reportNetworkSuccess } = useAppState();
  const toast = useToast();

  const refreshPanel = useCallback(() => {
    void loadPanel().then((next) => next && setPanel(next));
  }, []);
  const flow = useCheckInFlow({ catalog, onChanged: refreshPanel });

  // S-03: the audio overlay appears once per browser session.
  useEffect(() => {
    // Reading sessionStorage is only possible after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAudioReady(isAudioUnlocked());
  }, []);

  // US-05.2 AC1: durations tick every minute; other desks' changes arrive too.
  useEffect(() => {
    const timer = setInterval(refreshPanel, 60_000);
    return () => clearInterval(timer);
  }, [refreshPanel]);

  // BR-070 messages stay for five seconds.
  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(null), 5000);
    return () => clearTimeout(timer);
  }, [status]);

  const show = useCallback(
    (outcome: ScanOutcome) => {
      if (flow.handle(outcome)) return;
      if (outcome.result === "unassigned") {
        // BR-070: an empty card opens registration with the card attached.
        setRegisterCard(outcome.code);
        return;
      }
      setStatus(CARD_MESSAGES[outcome.result] ?? me.errors.unexpected);
    },
    [flow],
  );

  const run = useCallback(
    (work: () => ReturnType<typeof scanCard>) =>
      startScan(async () => {
        try {
          const answer = await work();
          reportNetworkSuccess();
          if (answer.ok) show(answer.data);
          else toast({ tone: "error", message: answer.error });
        } catch {
          // F-27 AC1: two failed requests in a row show the offline banner.
          reportNetworkFailure();
          toast({ tone: "error", message: me.errors.unexpected });
        }
      }),
    [reportNetworkFailure, reportNetworkSuccess, show, toast],
  );

  // S-03 scan capture: while no field has focus, characters followed by Enter are a
  // scan. A result dialog does not stop it (the next scan replaces it); S-03a, S-03e and
  // the form dialogs do, and a field with focus keeps its own typing.
  const buffer = useRef("");
  const blocked =
    flow.scanBlocked ||
    registerCard !== null ||
    registering ||
    deskDialog !== null;
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (blocked || event.ctrlKey || event.altKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]"))
        return;
      if (event.key === "Enter") {
        if (!buffer.current) return;
        // The Enter belongs to the scan, not to a focused dialog button.
        event.preventDefault();
        event.stopPropagation();
        const code = buffer.current;
        buffer.current = "";
        run(() => scanCard(code));
        return;
      }
      // A scan starts with a digit; other characters only join a scan already under
      // way (so garbage becomes "Neispravan kod kartice"), and otherwise keep their
      // normal meaning, such as Space on a focused button (D-47).
      if (
        event.key.length === 1 &&
        (/[0-9]/.test(event.key) || buffer.current)
      ) {
        buffer.current = (buffer.current + event.key).slice(-40);
        event.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [blocked, run]);

  return (
    <div className="relative grid gap-6 lg:grid-cols-3">
      <section
        className="grid content-start gap-6 lg:col-span-2"
        aria-labelledby="scan-prompt"
      >
        <div className="grid place-items-center gap-3 rounded-2xl border bg-card px-6 py-10 text-center">
          <ScanLine
            aria-hidden="true"
            className="size-10 text-muted-foreground"
          />
          <h1
            id="scan-prompt"
            className="text-3xl font-semibold tracking-tight"
          >
            {me.reception.prompt}
          </h1>
          <div
            role="status"
            aria-live="assertive"
            className="flex min-h-7 items-center gap-2 text-lg font-medium text-danger"
          >
            {scanning ? (
              <Loader2
                aria-hidden="true"
                className="size-5 animate-spin text-muted-foreground"
              />
            ) : status ? (
              <>
                <CircleAlert aria-hidden="true" className="size-5" />
                {status}
              </>
            ) : null}
          </div>
        </div>

        <MemberSearch onPick={(id) => run(() => beginCheckIn(id))} />

        {/* S-03: [Dnevna karta] [Trošak] [Novi član]; the first two record money (BR-092). */}
        <div className="flex flex-wrap gap-2">
          <MoneyButton
            type="button"
            variant="outline"
            onClick={() => setDeskDialog("dayPass")}
          >
            <Ticket aria-hidden="true" />
            {me.dayPass.title}
          </MoneyButton>
          <MoneyButton
            type="button"
            variant="outline"
            onClick={() => setDeskDialog("expense")}
          >
            <Receipt aria-hidden="true" />
            {me.deskExpense.title}
          </MoneyButton>
          <Button
            type="button"
            variant="outline"
            onClick={() => setRegistering(true)}
          >
            <UserPlus aria-hidden="true" />
            {me.members.create}
          </Button>
        </div>
      </section>

      <InGymPanel
        panel={panel}
        onCheckOut={(visitId) => run(() => checkOut(visitId, true))}
      />

      {flow.element}

      <DayPassDialog
        open={deskDialog === "dayPass"}
        onOpenChange={(open) => !open && setDeskDialog(null)}
        price={dayPassPrice}
      />
      <DeskExpenseDialog
        open={deskDialog === "expense"}
        onOpenChange={(open) => !open && setDeskDialog(null)}
        categories={expenseCategories}
      />

      <RegisterDialog
        open={registerCard !== null || registering}
        onOpenChange={(open) => {
          if (!open) {
            setRegisterCard(null);
            setRegistering(false);
            refreshPanel();
          }
        }}
        catalog={catalog}
        initialCard={registerCard ?? undefined}
        onRegistered={(member) => {
          // S-05: with "Prijavi odmah", the check-in result follows (S-03b/c/d).
          if (member.checkIn)
            show({ result: "checked_in", check_in: member.checkIn });
        }}
      />

      {!audioReady ? (
        // It covers S-03 only: the header (sign-out, navigation) stays usable.
        <div className="absolute -inset-2 z-30 grid min-h-80 place-items-start justify-center rounded-2xl bg-foreground/60 p-4 pt-16">
          <div className="grid max-w-sm gap-4 rounded-2xl bg-card p-6 text-center shadow-lg">
            <Volume2 aria-hidden="true" className="mx-auto size-10" />
            <p className="text-sm text-muted-foreground">
              {me.reception.startWorkHint}
            </p>
            <Button
              type="button"
              autoFocus
              className="h-12 text-base"
              onClick={() => {
                unlockAudio();
                setAudioReady(true);
              }}
            >
              {me.reception.startWork}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** S-03 search (BR-044, F-05): up to eight members, check-in or the profile. */
function MemberSearch({ onPick }: { onPick: (memberId: string) => void }) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, startSearch] = useTransition();
  const latest = useRef(0);

  // Doc 08 §9: results 250 ms after typing stops.
  useEffect(() => {
    const query = text.trim();
    const request = ++latest.current;
    if (!query) return;
    const timer = setTimeout(
      () =>
        startSearch(async () => {
          const found = await searchMembers(query);
          if (request === latest.current) setResults(found);
        }),
      250,
    );
    return () => clearTimeout(timer);
  }, [text]);

  const open = text.trim() !== "" && results !== null;
  return (
    <div className="relative grid gap-2">
      <Label htmlFor="reception-search" className="sr-only">
        {me.members.search}
      </Label>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="absolute top-3 left-3 size-4 text-muted-foreground"
        />
        <Input
          id="reception-search"
          type="search"
          autoComplete="off"
          placeholder={me.members.search}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            if (!event.target.value.trim()) setResults(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setText("");
              setResults(null);
            }
          }}
          className="pl-9"
          aria-controls="reception-search-results"
        />
        {searching ? (
          <Loader2
            aria-hidden="true"
            className="absolute top-3 right-3 size-4 animate-spin text-muted-foreground"
          />
        ) : null}
      </div>
      {open ? (
        <ul
          id="reception-search-results"
          className="absolute top-full z-20 mt-1 grid w-full gap-1 rounded-xl border bg-card p-1 shadow-md"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              {me.reception.noResults}
            </li>
          ) : (
            results.map((member) => (
              <li
                key={member.id}
                className="flex items-center gap-2 rounded-lg hover:bg-muted"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left text-sm"
                  onClick={() => {
                    setText("");
                    setResults(null);
                    onPick(member.id);
                  }}
                >
                  <span className="w-12 shrink-0 text-muted-foreground tabular-nums">
                    #{member.member_number}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {member.first_name} {member.last_name}
                  </span>
                  <span className="hidden text-muted-foreground sm:inline">
                    {member.phone}
                  </span>
                </button>
                <Link
                  href={`/members/${member.id}`}
                  className="shrink-0 rounded-md px-3 py-2 text-sm underline-offset-2 hover:underline"
                >
                  {me.reception.openProfile}
                </Link>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

/** BR-081 and US-05.2: everyone in the gym now, oldest check-in first. */
function InGymPanel({
  panel,
  onCheckOut,
}: {
  panel: ReceptionPanel;
  onCheckOut: (visitId: string) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <aside
      className="grid content-start gap-3 rounded-2xl border bg-card p-4"
      aria-labelledby="in-gym-title"
    >
      <h2 id="in-gym-title" className="font-semibold">
        {me.reception.inGym
          .replace("{count}", String(panel.in_gym.length))
          .replace("{today}", String(panel.today_count))}
      </h2>
      {panel.in_gym.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {me.reception.inGymEmpty}
        </p>
      ) : (
        <ul className="grid gap-2">
          {panel.in_gym.map((row) => (
            <li
              key={row.visit_id}
              className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {row.first_name} {row.last_name}{" "}
                  <span className="text-muted-foreground">
                    #{row.member_number}
                  </span>
                </p>
                <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
                  <span className="rounded bg-muted px-1.5 text-xs font-medium text-foreground">
                    {me.visitTypes[row.visit_type]}
                  </span>
                  {formatTime(row.checked_in_at)} ·{" "}
                  {formatDuration(
                    Math.max(
                      0,
                      (now - new Date(row.checked_in_at).getTime()) / 1000,
                    ),
                  )}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label={`${me.reception.checkOut} ${row.first_name} ${row.last_name}`}
                onClick={() => onCheckOut(row.visit_id)}
              >
                {me.reception.checkOut}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
