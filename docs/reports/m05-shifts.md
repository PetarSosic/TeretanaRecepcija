# M-05 shifts (F-02, part of F-27) — 18.09.2026

Status: complete. All five checks pass, in development and against the production build. M-06 has not started.

## Built

### Migrations

- `0010_shifts.sql` — `resolve_login_shift()` answers what a login means for the caller: `opened` when no shift was open, `resumed` when the open one is already theirs, `gate` when it belongs to someone else, and `none` for owners, managers and admins, who never have shifts (BR-110 to BR-112). `take_over_shift(p_counted_cash)` closes the other receptionist's shift as a `takeover` and opens the caller's, in one transaction — BR-110 allows only one open shift per gym, so the two steps can never be seen apart. The counted cash is optional (AS-10), and the closed shift keeps `email_status = 'not_sent'`, which is what marks it as still owing the BR-117 report that M-10 sends.
- `0011_open_shift_info.sql` — see "One conflict between two documents" below.

### Screens and shared pieces

- **Header shift badge** (doc 06 §1): `Smjena: <ime> od <HH:mm>`, or `Nema otvorene smjene` in grey. Visible at every width, because an owner or manager on a phone needs to know whether money actions will work at all.
- **S-02** `/shift/gate`: `Otvorena je smjena: <ime> (od <dd.mm.yyyy HH:mm>).`, the optional counted-cash field, [Preuzmi smjenu] and [Odjavi se]. If that shift was closed while the screen sat open, the RPC simply opens a new one and the receptionist continues to reception — the case doc 06 calls out.
- **Logout confirmation** (BR-113): a receptionist with an open shift is asked `Smjena ostaje otvorena. Odjaviti se?` before signing out. Owners, managers and admins sign out directly, since they leave nothing behind.
- **`MoneyButton`** (BR-092): the shared component the money screens of M-06 onward use instead of a plain button. It is disabled with no open shift and says why, in the tooltip and in the accessible name, so the reason is never hover or colour alone (D-47). The rule itself is a pure function, `moneyActionState`, so it is tested on its own and every money button answers the question identically.
- **Offline banner** (F-27): a red banner with an icon across the top when the browser reports offline or two consecutive requests fail, and every money action is disabled while it shows. The banner clears as soon as the connection returns, well inside the five seconds AC3 asks for.

## Verification

| Check | Result |
|---|---|
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run test` | Pass: 64 tests (5 new) |
| `npm run test:db` | Pass: 89 assertions, six files (18 new) |
| `npm run test:e2e` | Pass: 56 checks (5 new), in development and against `next start` |
| `npm run build` | Pass |

**The "done when" list.** pgTAP proves a second open shift in the same gym is impossible, that a closed one never blocks the next, and the whole of BR-111: opened, resumed, gate, and E19's takeover with the previous shift closed as `takeover`, the counted cash stored on it, its report still owing, and exactly one open shift left. Two more assertions prove an owner's login neither opens nor closes anything and that an owner cannot take a shift over.

The browser suite walks the same path through the screens: Ana logs in and the badge reads `Smjena: E2E Ana od HH:mm`; logging in again creates no second shift; Bojana meets S-02 naming Ana and the time, enters 120,50 and takes over; the badge then reads Bojana, Ana's shift is closed as a takeover with that cash recorded; signing out asks the BR-113 question and leaves the shift open; and an owner's login changes nothing. The mobile run also asserts the header does not overflow at 375 px.

After the full run the database holds one gym, two staff and no shifts: the fixtures clean up after themselves.

## One conflict between two documents, and how I resolved it

Doc 06 §1 and S-02 both have to **name** whoever holds the open shift. Doc 07 §6 limits a receptionist to **their own row** in `staff`. Those cannot both be satisfied by a table read: when Bojana asked, the name came back empty and S-02 read `Otvorena je smjena: (od …)`.

Widening the staff policy would expose every colleague's row to satisfy one label, so instead migration `0011` adds `open_shift_info()`, a security definer function that returns exactly the fields the two screens need — the shift, its holder's name, when it started, and whether it is mine. The table policy stays exactly as doc 07 §6 writes it.

Reporting it as the README asks: **doc 06 §1 and doc 07 §6 disagree**, doc 07 wins on the authority order, and the function is how both are honoured. If you would rather receptionists simply see each other's names, that is a one-line policy change instead.

## Notes

- **The takeover does not send an email yet.** Doc 09 puts that in M-10 ("E19, without the email for now"), and the closed shift carries `email_status = 'not_sent'` so M-10 can find it.
- **The two-failed-requests half of F-27 AC1 is wired but unused.** The provider exposes `reportNetworkFailure` and counts two in a row as offline; no action calls it yet, because the money actions that should arrive in M-06 and later. The browser-offline half is complete.
- `take_over_shift` revalidates the layout before redirecting, otherwise the header would keep showing the previous holder from its cached copy — worth remembering for every later action that changes something the header displays.
