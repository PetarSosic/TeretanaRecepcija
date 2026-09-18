# M-07 Check-in and check-out (F-04, F-05, F-10) — 19.09.2026

Status: complete. All five checks pass, in development and against the production build. M-08 has not started.

## Built

### Migration `0014_check_in.sql`

- **RPCs** from doc 07 §5:
  - `scan_card`: the BR-070 table. Card problems come back as answers rather than errors, and nothing is recorded for them. An active card checks the member out, or asks first inside the double-scan guard (BR-072), or starts the check-in.
  - `check_in`: BR-071 to BR-079.
  - `check_out`: BR-072; `p_confirmed` skips the guard.
  - `unlinked_unpaid_count`: BR-079's N.
- **One place for the BR-073 to BR-076 decisions:** `check_in_options` returns the offered types, the preselection, the candidates (earliest end first), the group and personal trainers, each group trainer's default class for today (±90 min, AS-12), today's slots, the fallback trainer for an unpaid group visit, and the BR-058 trainer defaults for [Produži članarinu]. The screen only displays these; it decides nothing.
- **US-04.2, one scan and zero clicks:** a scan checks the member in without a question when Teretana is the only option and at most one membership covers it.
- **Additions not listed in doc 07:**
  - `begin_check_in(member)`: the manual start from the search and from [Ručna prijava] (BR-080). It answers exactly like a scan.
  - `reception_panel()`: the "U teretani" list and today's count (BR-081, US-05.2).
  - Internal functions nobody can call directly: `perform_check_in`, `start_check_in`, `perform_check_out`, `default_class_slot`, `member_brief`, `check_in_options`.
- **"Prijavi odmah" (US-06.1 AC2, D-31):** `register_member` is replaced (same signature) and now checks the new member in inside the same transaction. A new member holds only the membership just sold, so the visit takes BR-073's preselected type, that membership, its trainer and the default class, and no question is needed.

### Screens

- **S-03** `/reception`:
  - Scan capture while no field has focus.
  - The [Počni rad] audio overlay, shown once per browser session.
  - The status area (red for 5 s) for invalid, unknown and deactivated cards.
  - Search (up to 8 results, with [Otvori profil]).
  - [Novi član].
  - The "U teretani" panel: live durations refreshed every minute, [Odjavi] per row, and `U teretani: N · Danas dolazaka: M`.
- **Registration from a scan:** an empty card opens S-05 with the card shown read-only. After the success notice, the check-in result follows.
- **Dialogs:**
  - S-03a: visit type, membership selector when there are two or more, trainer, class. Enter confirms, Esc cancels.
  - S-03b green: closes after 5 s (AS-13), or on Esc, or when the next scan arrives.
  - S-03c yellow and S-03d red: the red one is full screen with 48 px white text. Both offer [Produži članarinu] (opens S-08) and [Zatvori], and neither closes by itself.
  - S-03e: the double-scan confirmation.
  - Check-out shows the toast `Odjavljen/a: <ime> – <trajanje>`.
- **S-07:** [Ručna prijava] or [Ručna odjava], depending on the open visit.
- **S-06:** after a registration with "Prijavi odmah", the check-in result follows here too.
- **Sounds:** `public/sounds/ok.mp3` (0.35 s), `warning.mp3` (1.0 s) and `alarm.mp3` (2.0 s), generated as simple tones.

## Verification

| Check | Result |
|---|---|
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run test` | Pass: 77 tests |
| `npm run test:db` | Pass: 219 assertions in eight files (52 new in `0007_check_in.test.sql`) |
| `npm run test:e2e` | Pass: 76 checks (8 new), in development and against `next start` |
| `npm run build` | Pass |

**The "done when" list.**

- **pgTAP, E3 end to end:** the first unpaid visit gives N = 1, the second N = 2, and the renewal links both and starts at the first.
- **pgTAP, E6:** two gym visits on the same day leave 11, then 10.
- **pgTAP, E7:** Grupni is offered with its sessions used up, gives an unpaid visit, and the G+T stays Aktivna; Teretana is covered.
- **pgTAP, E8:** a Grupni-only member picking Teretana gets an unpaid visit with N = 1.
- **pgTAP, BR-070:** every row has its own assertion (invalid, unknown and trimmed input, deactivated, unassigned, check-out past the guard, S-03e inside the guard, check-in), and none of the card errors records anything.
- **pgTAP, other rules:** BR-071, BR-074 (earliest end first, and another candidate may be picked), BR-075 (the class starting now, not the one in three hours), BR-076, BR-077, BR-080, "Prijavi odmah", the panel, and the doc 04 §2 rejections.
- **Browser, flow 2:** an empty-card scan leads to registration, then the green dialog, then `U teretani: 1`, then a second scan, S-03e and the check-out toast.
- **Browser, flow 3:** the yellow dialog, [Odjavi], then the red `PAŽNJA: 2. neplaćeni dolazak!`, then [Produži članarinu] with `Počinje od prvog neplaćenog dolaska <danas>`. Both visits end up linked.
- **Browser, flow 4:** a G+T member gets S-03a with Teretana preselected; choosing Grupni preselects the membership's trainer and `Čas: <sada>`, and the green dialog shows `Grupni: 11 preostalo`.
- **Browser, BR-070 status area:** invalid and unknown cards, and no sideways scrolling at 375 px.
- **Performance** (`npm run perf:scan`): 3,000 members, 36,000 memberships and 150,000 visits generated inside one transaction and rolled back. Over 300 full check-in scans, `scan_card` took **p50 11.3 ms, p95 38.3 ms, max 153.5 ms** of database time. The round trip from this machine was p50 102 ms and p95 147 ms. The limit is 300 ms.

## Interpretations — please confirm

- **[Dnevna karta] and [Trošak] are not on S-03 yet.** They open S-10 and S-11, which doc 09 places in M-08.
- **Scan capture listens at the window** rather than through a hidden focused input. The behaviour doc 06 describes is the same: scans are taken while no field has focus, pass through the result dialogs, and are ignored while S-03a, S-03e or a form dialog is open. Only a digit starts a scan, so Space and Enter on focused buttons keep working (D-47).
- **The audio overlay covers the S-03 content, not the header,** so a receptionist can still sign out before pressing [Počni rad].
- **Manual check-out skips the guard.** [Odjavi] in the panel and [Ručna odjava] check out at once. The guard is described for scans (BR-072), and a click is deliberate.
- **When a member already in the gym is picked in the search,** the answer is `Član je već u teretani.`. Manual check-out is the panel's [Odjavi] (BR-080).

## Changes outside M-07, and why

- **The M-06 E2E registration test** now expects the green check-in result after the success notice, and checks that the visit exists, because "Prijavi odmah" is on by default.
- **The M-06 pgTAP assertion** that "Prijavi odmah" is refused was replaced with an email check, since the flag now works.
- **The M-02 first-login test** gives the redirect to `/reception` 15 s instead of 5 s. The password change and the S-03 render share one response, and S-03 now loads the panel and the sale catalogue, so a parallel production-mode run occasionally went just over 5 s. It had failed this way once in M-06 and once here.

## Notes

- **Syncing the other database:** migration `0014` must be applied to the other developer's Supabase project with `npm run db:push`.
- **Unexplained one-off failure:** in one production-mode run, two sales in two different test gyms failed at the same moment with a foreign-key error on `memberships.shift_id`, as if their open shift had vanished. Nothing in the code or the fixtures deletes another gym's shifts, and two full reruns passed 76 of 76. I couldn't find a cause. If it comes back, it's worth a closer look.
- **Sounds:** the three files are synthesised tones, so real recordings can replace them later without code changes.
