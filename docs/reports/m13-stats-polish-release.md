# M-13 Visit statistics, polish and release (F-20, F-27 complete) — 19.09.2026

Status: the code is complete and all five checks pass. **One "done when" item is not
done and cannot be done from here:** the production deployment and its smoke test need
Vercel, Resend and DNS accounts that only you have. Everything it depends on is written
down and ready; see "What is left for you" at the end.

## Built

### Migrations 0024 and 0025 — `visit_stats`

`visit_stats(from, to)` returns everything S-15 draws, in one call: the total, a count for
**every** day of the period and **every** hour from 06 to 23 (so neither bar chart
collapses around its quiet stretches), the split by visit type, the average duration, the
number of visits that average was measured over, and the ten members who came most often.

- Doc 06 §2 and doc 07 §5 put it in the hands of the owner, the admin **and the manager** —
  unlike the finance reports of doc 03 §14, which stay the owner's alone (BR-157). A
  receptionist gets `E_FORBIDDEN`.
- **BR-082:** an automatic check-out counts as a visit but never as a measurement. A visit
  the nightly job closed at 23:00 says nothing about how long the member stayed, so it is
  left out of the average, and the screen says how many visits the average rests on.
- **BR-046:** an anonymized member appears in no list.
- A period longer than about a year is refused, so one request can never pull a year and a
  half of history into a serverless function (doc 08 §9).

### S-15 `/stats/visits`

The period selector S-16 already had, two stat tiles (total and average duration), the two
bar charts of US-20.1, the split by type with a magnitude bar per row, and the top ten
members linking to their profiles. Empty state: `Nema dolazaka u izabranom periodu.`

Both charts are the same hand-written SVG as the finance ones: one hue, a hover target per
bar, and a line underneath naming the bar in words with its count — so the figures are
readable without measuring anything against an axis. Day labels thin out as the period
grows, because ninety labels in a row are no labels at all.

`Statistika dolazaka` is now in the navigation for the owner, the admin and the manager
(doc 06 §2).

### Loading, error and empty states (doc 06 §1)

- **Loading:** `app/(app)/loading.tsx` shows skeleton placeholders for every screen under
  the application layout while its data is on the way; the header and navigation stay put.
- **Errors:** `app/(app)/error.tsx`, `app/(auth)/error.tsx` and `app/global-error.tsx`
  show `Došlo je do greške. Pokušajte ponovo.` with the error's digest and a
  [Pokušaj ponovo] button, and log the digest — never the message, which could carry a
  member's data (doc 08 §9). **Until now there was no boundary at all:** a failing screen
  showed Next's own English "This page couldn't load", which is what the M-12 finance page
  showed the first time it met real data.
- **Empty:** every empty text doc 06 spells out is in `lib/i18n/me.ts` and is now asserted
  on a new gym by the browser tests — S-06 (`Još nema članova…`), S-12
  (`Danas još nema uplata.`) and S-15 (`Nema dolazaka…`).

### Accessibility and responsive pass (D-47, doc 08 §9)

`tests/e2e/screens.spec.ts` opens **all nineteen screens** as the role that may open them,
at the project's viewport, and checks four things on each: no horizontal overflow, a level-1
heading, no page error, and **no operable control without an accessible name** — every
input, select, textarea, button and link is read the way a screen reader would read it.
The desktop project runs at 1366×768 and the mobile one at 375 px, so one suite run covers
both sizes, and every screen's screenshot is saved to `test-results/`.

A separate check tabs through the reception screen and confirms the focus keeps moving
through real controls.

Colour contrast was measured against the WCAG AA threshold rather than judged by eye:

| Pair | Ratio | |
|---|---|---|
| foreground on background | 11.84 | AA |
| foreground on card | 12.95 | AA |
| muted-foreground on background | 5.70 | AA |
| muted-foreground on card | 6.23 | AA |
| muted-foreground on muted | 5.41 | AA |
| primary-foreground on primary | 9.77 | AA |
| danger on background | 7.45 | AA |
| success on background | 5.91 | AA |
| chart series 1 on card | 4.42 | graphic (needs 3:1) |
| chart series 2 on card | 3.20 | graphic (needs 3:1) |

Every text pair clears 4.5:1 and both chart marks clear the 3:1 a graphic needs. The
gridline is deliberately below that: it is decoration, and every value it would help
estimate is given as a label or in the hover line instead.

### Two gaps in doc 08 §9 that were still open

- **The backup now exports in pages of 5,000 rows** (`BACKUP_PAGE`), one table at a time,
  as doc 08 §9 requires. M-11 read each table in a single request, which is fine for this
  gym today and would not be for a year of visits.
- **`maxDuration` on the jobs route was 300 s**, which Vercel's Hobby plan does not allow;
  it is now 60, the real ceiling. A backup that would need longer fails and is reported
  rather than producing half a copy, which is what doc 08 §9 asks for.

### Production deployment guide

The README now carries the whole procedure: Supabase push, seeds and Resend SMTP in
Supabase Auth; Resend domain verification for `stamenkovicc.com`; the Vercel environment
variables of doc 08 §11 and which ones must **not** be set there; turning the jobs on with
`npm run jobs:secrets` and the three checks that prove they run; the smoke test; and the
restore procedure step by step.

## A bug this milestone found and fixed

**A new receptionist never got a shift.** A first login goes to S-01b before BR-111's shift
logic runs, and nothing ran it afterwards — so a receptionist who had just set their
password reached the reception screen with no shift of their own. Until M-11 that went
unnoticed; M-11's BR-116 rule (no open shift means the shift has ended) then signed them
straight back out, which is how the browser tests caught it. `changeOwnPassword` now
resolves the shift for a receptionist and sends them to S-02 or to reception, exactly as a
normal login does.

## Verification

| Check | Result |
|---|---|
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run test` | Pass: 110 tests |
| `npm run test:db` | Pass: 469 assertions in fourteen files (14 new in `0013_visit_stats.test.sql`) |
| `npm run test:e2e` | Pass: 150 checks (42 new) |
| `npm run build` | Pass |

**The eleven flows of doc 08 §10, and where each one lives.**

| Flow | Test |
|---|---|
| 1 receptionist login opens a shift | `shifts.spec.ts` US-02.1 |
| 2 unassigned card → register → check-in → check-out | `reception.spec.ts` Flow 2 |
| 3 expired member, yellow then red, renewal per E3 | `reception.spec.ts` Flow 3 |
| 4 G+T group visit with trainer and slot | `reception.spec.ts` Flow 4 |
| 5 day pass, bar sale, stock-in from till, desk expense | `payments.spec.ts` US-12.1/US-14.1 and `storage.spec.ts` E17/E18 |
| 6 correct and void a payment | `payments.spec.ts` Flow 6 |
| 7 close shift, PDF stored, logged out | `close-shift.spec.ts` Flow 7 |
| 8 second receptionist takeover | `shifts.spec.ts` US-02.2 and E19 |
| 9 owner finance pages show E9–E12 | `finance.spec.ts` Flow 9 |
| 10 manager cannot open `/finance` | `finance.spec.ts` Flow 10 |
| 11 offline banner disables save | `offline.spec.ts` Flow 11 |

**Screens at both sizes.** All nineteen screens pass at 1366×768 and at 375 px, and the
screenshots are in `test-results/screens-*`. There are forty folders: nineteen screens in
two projects, plus the two login shots the foundation test takes.

**The hosted database is clean.** Only the KP Fitness gym remains, with its two seeded
accounts, four trainers and twelve plans; every test gym was removed by its own cleanup.

## What is left for you

The last "done when" item — *a production deployment was completed with a smoke test* —
needs accounts I cannot reach. The steps are in the README, and in order they are:

1. Verify `stamenkovicc.com` in Resend and create the API key.
2. Create the Vercel project and set the environment variables of doc 08 §11.
3. Deploy, then set `APP_URL` in `.env.local` to the deployed address and run
   `npm run jobs:secrets`.
4. Check `cron.job_run_details` and the Vercel logs, and confirm that a job call without
   the secret answers 401.
5. Sign in, scan a member, close a shift, and confirm the report arrives by email.

Tell me what each step reports and I will work through anything that does not come out as
the guide says.

## Interpretations — please confirm

- **`visit_stats` refuses a period longer than 400 days.** Doc 06 gives S-15 the same
  period presets as S-16, whose longest is "Ova godina"; the limit only stops a
  hand-edited address from asking for ten years at once.
- **The day and hour charts return empty buckets.** A day with no visits is a zero-height
  bar, not a missing one, so the shape of a week is honest.
- **The average duration sits beside the number of visits it was measured over.** Without
  that line, an average over one visit reads the same as an average over a thousand.
- **S-15 counts a visit on the day it began.** A visit that runs past midnight belongs to
  the day the member arrived, which is also how BR-082 and the shift reports treat it.
