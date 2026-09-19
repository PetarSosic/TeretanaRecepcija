# M-10 Shift close and report (F-16) — 19.09.2026

Status: complete. All five checks pass, in development and against the production build. M-11 has not started.

## Built

### Migration `0017_shift_close.sql`

- **`shift_totals`** (BR-115): cash income (cash payments + cash bar sales), card income, till expenses, expected cash, counted cash, and the difference, which is null when no cash was counted. Only non-voided records attached to the shift count, so back-dated ones never do (BR-120).
- **`shift_summary(shift)`** (BR-115, D-54, P-14):
  - The owner and admin read any shift of the gym in full.
  - The shift's receptionist reads her own, with only her own expenses listed (BR-134) while the totals count every till expense.
  - A manager gets exactly the four totals of the shift open now. A closed shift, another gym's shift, or anything else is `E_FORBIDDEN`.
- **`close_shift(shift, counted_cash)`** (BR-114):
  - The shift's receptionist closes it with the counted cash (required, ≥ 0); the owner may close any open shift with the cash optional.
  - A manager is refused.
  - A shift already closed (taken over, or later auto-closed) is `E_RECORD_NOT_EDITABLE`.
- **Report data** (`shift_report_json`) and **`record_shift_report`** are callable by the service role only:
  - The data is the whole BR-117 content: header, payments, day passes per method, card replacements, bar sales, till expenses, totals, voided records with reasons, and members still inside at close.
  - `record_shift_report` stores the PDF path and the email outcome, counting every real attempt towards BR-118's five.
- **The private `shift-reports` bucket:** the owner and admin read their gym's folder (doc 07 §6).

### Report pipeline

- **`lib/shift-report.ts` → `deliverShiftReport(shift)`:** renders the PDF, stores it at `shift-reports/<gym>/<shift>.pdf`, emails it to `shift_report_emails`, and records the outcome. It runs after the shift is closed and never throws, so a report or email problem can never undo a close (BR-118).
- **Email outcomes:** `sent`, or `failed` (BR-118), or `not_sent` when `EMAIL_FROM` is unset (BR-161).
- **PDF (`lib/pdf/shift-report.tsx`):** A4, Noto Sans, `Strana X od Y`, every BR-117 section, and the BR-116 note for an automatic close.
- **Email (doc 08 §7):**
  - Subject: `Izvještaj smjene – <ime> – <dd.mm.yyyy> <HH:mm>–<HH:mm>`.
  - Body: the given text, including `Prebrojano: nije prebrojano` when the cash wasn't counted.
  - Attachment: `smjena-<yyyy-mm-dd>-<ime>.pdf`.
- **`lib/email/send.ts`:** Resend (`6.28.1`, pinned) from `EMAIL_FROM`. It skips and logs without `EMAIL_FROM`, and reports failures instead of throwing. No personal data is logged.
- **`closeShiftAndReport`** (doc 08 §6): `close_shift` with the user's session, then the report pipeline, sign-out, and `/login?closed=1`.
- **The S-02 takeover now also delivers the report** of the shift it closed.

### Screens

- **S-14** `/shift/close` (receptionist):
  - The four summary cards, with expected cash emphasised.
  - Counts of payments, day passes, sales and voided records, and `U teretani je još N osoba.`
  - `Prebrojana gotovina (€)` with the live `Razlika: <iznos> (Manjak/Višak)`, computed in cents.
  - [Pregledaj stavke] and [Zaključi smjenu i odjavi me], with the confirmation `Nakon zaključenja nije moguće mijenjati stavke ove smjene.`
  - The processing steps shown while it runs.
- **S-12 footer** (deferred from M-08): the four open-shift totals for the owner, a manager, or the shift's own receptionist (P-14). A manager's come straight from `shift_summary`, so no expense detail is ever sent (D-54).

## Verification

| Check | Result |
|---|---|
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run test` | Pass: 94 tests (5 new: PDF glyphs, close-type labels, email subject and body, file name, BR-161 skip) |
| `npm run test:db` | Pass: 330 assertions in eleven files (30 new in `0010_shift_close.test.sql`) |
| `npm run test:e2e` | Pass: 92 checks (4 new, plus the takeover report check), in development and against `next start` |
| `npm run build` | Pass |

**The "done when" list.**

- **pgTAP, E15:** cash payments €237.00 plus cash sales €4.50, minus till expenses €13.50, give expected cash €228.00. Counted €225.00 gives −€3.00. The voided payment and voided expense are ignored.
- **pgTAP, D-54:**
  - A manager receives exactly `cash_income, card_income, till_expenses, expected_cash` for the open shift.
  - The same shift once closed is `E_FORBIDDEN`, as is a manager of another gym.
  - A manager cannot close a shift.
  - The report data and the report-status function are refused for staff (42501).
- **E2E flow 7:**
  - S-14 shows €241,50, €228,00 and `U teretani je još 1 osoba.`
  - 225 gives `Razlika: -3,00 € (Manjak)`, and [Pregledaj stavke] lists the bar sale.
  - After the confirmation, the receptionist lands on `/login?closed=1` with `Smjena je zaključena.`
  - The shift is `manual` with €225.00 counted, the PDF is in the bucket (it starts with `%PDF-`), and the next request goes to the login page.
  - The same run proves the D-54 footer: a manager on S-12 sees €241,50, €13,50 and €228,00.
- **Wrong Resend key:** the browser tests' web server runs with `EMAIL_FROM` set and an invalid `RESEND_API_KEY` (`playwright.config.ts`). Flow 7 then shows `email_status = 'failed'` with one attempt, and the shift still closed. The takeover test shows the same for a taken-over shift. No test run can ever send a real email.
- **č ć š ž đ:** the unit test renders the report and reads the embedded font's ToUnicode maps: č ć š ž đ and Đ Ć Ž Š are all mapped to real Noto Sans glyphs. I also rendered a sample report and checked it by eye.

## Changes outside M-10, and why

- **E2E cleanup left test data behind** (since M-08). `deleteTestGym` never deleted `expenses` or `stock_movements`, so every later delete failed silently.
  - At the start of M-10 the hosted database held 34 leftover test gyms and 54 test logins.
  - All were synthetic and named "E2E …"; the real KP Fitness gym was never affected.
  - The cleanup now deletes those tables and stops with an error on any failed step, and a one-time run removed every leftover. The database now holds only the KP Fitness gym.
- **`playwright.config.ts`** gives the test web server the email settings described above.

## Interpretations — please confirm

- **Report generation uses the service role,** as the logo upload does. The report lists every record of the shift, other staff's expenses included, and the bucket is owner-only. Doc 08 §2 lists the service role for staff administration, jobs and seeding; the shift report is a job in all but name, and M-11's retry job will use the same pipeline.
- **The close does not set `email_status = 'pending'` first.** The pipeline sets `sent`, `failed` or `not_sent` straight after the close in the same request, so a shift is never pending for long enough to matter.
- **Voided records in the report are those of the shift:** payments, bar sales and till expenses. A stock-in paid outside the till is not a till record.
- **Owner downloads of the report PDF** (`/api/pdf/shift/[id]`) and [Pošalji ponovo] belong to S-19 (M-12). The PDF is already stored for them.
- **New UI copy the spec doesn't give:** `Nemate otvorenu smjenu.`, `Zaključi`, `Sakrij stavke`, and the three step labels (`Zaključujem smjenu…`, `Pravim izvještaj…`, `Šaljem izvještaj…`). The report labels follow BR-117's wording.

## Notes

- **Syncing the other database:** migration `0017` must be applied to the other developer's Supabase project with `npm run db:push`, and he needs `npm install` for Resend.
- **Before go-live:** set `EMAIL_FROM` and a real `RESEND_API_KEY` in the production environment, and verify `stamenkovicc.com` in Resend (BR-161, doc 08 §7). Until then reports are stored but not emailed (`not_sent`).
