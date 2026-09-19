# M-08 Money at the desk (F-12, F-13, F-14) — 19.09.2026

Status: complete. All five checks pass, in development and against the production build. M-09 has not started.

## Built

### Migration `0015_desk_money.sql`

- **Table:** `expenses` from doc 07 §3, audited on insert, update and void (BR-096), with the BR-134 SELECT policy. `stock_movement_id` is created now without its foreign key; M-09 adds the key when `stock_movements` exists, the same pattern M-04 used for `cards.member_id`.
- **RPCs** from doc 07 §5:
  - `sell_day_passes(qty, method)` (BR-100): 1–20 passes at the price the database reads itself, with no member, on the open shift.
  - `correct_payment(payment, method, note, amount)` (BR-094).
  - `void_payment(payment, reason)` (BR-095): voiding a membership payment also voids the membership, and its visits become unlinked unpaid visits (E16, D-14).
  - `record_desk_expense(category, description, amount)` (BR-132): cash from the till, today, on the open shift, in an active category that is not a salary category.
  - `void_expense(expense, reason)` (BR-135).
- **One rule for who may edit (BR-094, BR-095, AS-14):** `record_editable` lets the owner and admin change any record; everyone else only records attached to the shift that is open now. So closed shift reports and back-dated entries never change behind the owner's back. Only the owner changes an amount, and a voided record never changes again.

### Screens

- **S-10** [Dnevna karta] on S-03: a 1–20 stepper, `Ukupno: <iznos>` at the current price, the method, and the toast `Prodato: <N> × dnevna karta = <iznos>`.
- **S-11** [Trošak] on S-03: category (active, non-salary only), description, amount, and the fixed note `Plaćeno iz kase · danas`.
- **S-12** `/payments/today`:
  - `Uplate`: today's payments that are not back-dated, newest first.
  - `Moji troškovi danas` (for the owner: `Troškovi danas`).
  - Each row shows time, description, method, amount and "Unio/la", with [Ispravi] and [Poništi] enabled per BR-094. A disabled button says why in its tooltip.
  - Voided rows stay, struck through, with the reason as the tooltip.
  - The owner's correction dialog also has the amount field. Voiding a membership payment warns first (US-13.1 AC3).
- The three money buttons are `MoneyButton`s (BR-092). Scans are ignored while S-10 or S-11 is open (doc 06 S-03).

## Verification

| Check | Result |
|---|---|
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run test` | Pass: 85 tests (8 new, for the S-10, S-11 and S-12 schemas) |
| `npm run test:db` | Pass: 260 assertions in nine files (41 new in `0008_desk_money.test.sql`) |
| `npm run test:e2e` | Pass: 82 checks (6 new), in development and against `next start` |
| `npm run build` | Pass |

**The "done when" list.**

- **pgTAP, E16:** a membership payment voided after three linked visits voids the membership, and the three visits become unlinked and unpaid (N = 3).
- **pgTAP, AS-14:**
  - A receptionist or manager cannot change an amount (`E_AMOUNT_LOCKED`).
  - They cannot correct or void a payment from a closed shift, a back-dated payment, or their own expense once its shift is closed (`E_RECORD_NOT_EDITABLE`).
  - The owner can do all of these.
- **pgTAP, BR-134:** a receptionist and a manager see only their own expenses of today (yesterday's own expense is gone); the owner sees all three.
- **pgTAP, other rules:** BR-100 (price, quantity limits, no member, open shift), BR-132 (salary and deactivated categories refused, description and amount limits), BR-135 (nobody but the owner voids someone else's expense), the void reason, double voids refused, every void and correction in the audit log, and no direct inserts.
- **Browser, flow 6:**
  - A day pass is sold from S-03 (3 × €10 = €30,00) and a desk expense recorded (salary category not offered).
  - On S-12 the closed shift's payment is read-only. The receptionist corrects the method and note (no amount field), and a reason that is too short is refused.
  - Voiding the day pass, then the membership payment (with its warning), leaves the membership voided and its visit unpaid.
  - The receptionist voids her own expense.
  - The owner then changes the amount of the closed-shift payment to €12,00.
  - The last test also checks S-12 fits 375 px.

## Interpretations — please confirm

- **The S-12 footer with the open-shift totals is not built yet.** It needs `shift_summary` (BR-115), which doc 09 places in M-10 together with the D-54 manager test. It will be added there rather than computing the totals twice.
- **`Prodaja iz magacina` on S-12** arrives with the bar sales in M-09.
- **New UI copy the spec doesn't give:**
  - Toasts: `Uplata je ispravljena.`, `Stavka je poništena.`, `Trošak je sačuvan.`
  - Empty text: `Danas još nema troškova.`
  - Void warning: `Poništavanjem ove uplate poništava se i članarina, a njeni dolasci postaju neplaćeni.`
  - Read-only tooltip: `Stavka iz zaključene smjene – samo vlasnik je može mijenjati.`
- **Expenses have [Poništi] only, no [Ispravi].** BR-094 describes corrections for payments and sales, and doc 07 lists no expense correction RPC.
- **An automatic stock-in expense cannot be voided on its own** (`void_expense` refuses one with a `stock_movement_id`). BR-095 voids it together with its stock-in (M-09), otherwise stock and expenses would disagree.

## Notes

- **Syncing the other database:** migration `0015` must be applied to the other developer's Supabase project with `npm run db:push`.
- **Test fix:** while writing the browser test, two identical toasts were visible at the same moment. The assertion now checks the latest, and the voided-row count proves each void.
