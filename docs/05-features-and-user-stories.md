# 05 — Features and User Stories

All features are **MVP**. Acceptance criteria (AC) are written so each one can be tested. Rules are referenced by ID; the rule text in doc 03 is authoritative.

---

## F-01 Staff accounts and login
**US-01.1** As a member of staff, I log in with my username and password so I can work without an email address (D-57).
- AC1: The login form (S-01) has "Korisničko ime ili email" and "Lozinka".
- AC2: Input without `@` is treated as a username. Input with `@` is treated as an email.
- AC3: Wrong credentials show `Pogrešno korisničko ime/email ili lozinka.` The message does not reveal which one was wrong.
- AC4: A deactivated user cannot log in and sees the same message.
- AC5: Every role signs in this way. Only the admin, and the seeded owner account, sign in with an email (D-57).

**US-01.2** As the admin, I log in with my email, and I can reset a forgotten password by email (D-57, D-58).
- AC1: "Zaboravljena lozinka?" sends a reset link only to an account that has an email, which is the admin and the seeded owner account.
- AC2: For a username, it shows `Lozinku vam postavlja administrator, vlasnik ili menadžer.`

**US-01.3** As an owner or manager, I create and manage staff accounts (S-23).
- AC1: Creating a receptionist requires full name, username (`^[a-z0-9._]{3,30}$`, unique) and a temporary password (≥ 8 characters).
- AC2: Creating a manager or owner requires full name, username and a temporary password, exactly like a receptionist. Creating an admin requires an email instead of a username. Only an admin can create an owner or another admin (P-03, D-58).
- AC3: A user created with a temporary password must set a new password at first login (S-01b) before any other screen.
- AC4: Owners and managers can set a new temporary password for receptionists and managers. Only an admin can do it for owners and admins. The admin can additionally read every stored staff password (P-06, D-59).
- AC5: Deactivating a user bans them in Supabase Auth. Their next request redirects to login. Nobody may deactivate their own account, and the last active owner or admin cannot be deactivated (P-07, D-60).

**US-01.4** As any user, I change my own password from the user menu.
- AC1: The current password is required, the new one must be ≥ 8 characters, and a success toast appears.

## F-02 Shifts
**US-02.1** As a receptionist, a shift opens automatically when I log in (BR-111).
- AC1: With no open shift in the gym, logging in creates a shift with me as owner and `started_at` = now.
- AC2: If the open shift is mine, logging in resumes it and no new shift is created.
- AC3: The header always shows `Smjena: <ime> od <HH:mm>`.

**US-02.2** As a receptionist, I can take over a shift someone forgot to close.
- AC1: S-02 appears when another receptionist's shift is open.
- AC2: [Preuzmi smjenu] closes the other shift (`takeover`, optional counted cash), queues its report, and opens mine, all in one transaction.
- AC3: [Odjavi se] logs me out without changes.

**US-02.3** As an owner or manager, my money actions go into the open shift (BR-092).
- AC1: With no open shift, every money button is disabled and shows the BR-092 message on hover and click.
- AC2: A record I create shows me as "Unio/la" (entered by) in the shift report.
- AC3: A manager can read the currently open shift's cash income, card income, till expenses and expected cash on S-12 and through `shift_summary`. The response contains only these totals; requests for closed shifts or another gym are rejected (D-54). Expense details still follow BR-134.

**US-02.4** As a receptionist, I can log out without closing my shift (BR-113). The confirmation dialog is shown first.

## F-03 Member cards
**US-03.1** As an owner or manager, I generate a batch of unassigned cards and print them (S-28).
- AC1: Quantity 1–100. The codes follow BR-030 and are unique.
- AC2: The PDF matches the S-28 layout. Printing it at 100 % scale gives cards of 85.6 × 54 mm.
- AC3: The batch list shows date, quantity, how many are still unassigned, and a [Preuzmi PDF] button.

## F-04 Card scan: check-in and check-out
**US-04.1** As a receptionist, scanning a card does the right thing automatically (BR-070).
- AC1: Every row of the BR-070 table produces exactly the described result and message.
- AC2: From the moment Enter is received to the result on screen takes ≤ 1 s (p95) (doc 08 §9).
- AC3: A scan is captured whenever S-03 is open and no text input or dialog other than the result dialogs has focus (S-03 scan capture rules).

**US-04.2** As a receptionist, checking in a member with only gym coverage takes one scan and zero clicks.
- AC1: The green dialog (BR-079) appears, the visit is saved with type `gym`, and the covering membership (BR-074) is linked.

**US-04.3** As a receptionist, I choose the visit type when the member has group or personal coverage (BR-073–076).
- AC1: The buttons, preselection, trainer list, trainer default and slot default follow BR-073–076.
- AC2: Enter confirms. Esc cancels, and nothing is saved.
- AC3: When two memberships cover the type, a membership selector appears with the earliest-ending one preselected.

**US-04.4** As a receptionist, I am clearly warned about unpaid visits (BR-079).
- AC1: N = 1 shows the yellow dialog with the warning sound. N ≥ 2 shows the full-screen red dialog with the alarm sound.
- AC2: [Produži članarinu] opens S-08 for that member.

**US-04.5** As a receptionist, scanning the card again checks the member out (BR-072).
- AC1: A toast shows the name and duration.
- AC2: A scan within the double-scan guard time asks for confirmation first.

## F-05 Manual check-in/out and "U teretani"
**US-05.1** As a receptionist, I check in a member who forgot their card by searching name, phone or number.
- AC1: The search is on S-03 and follows BR-044. Choosing a result starts the same flow as a scan, with `is_manual = true`.

**US-05.2** As a receptionist, I see everyone currently in the gym and can check anyone out.
- AC1: The "U teretani" list shows name, member number, visit type, check-in time and live duration (updated every minute), sorted by check-in time.
- AC2: [Odjavi] checks that member out and the row disappears.
- AC3: The header of the list shows the count and today's total visits.

## F-06 Member registration
**US-06.1** As a receptionist, scanning an empty card opens registration and I sign the member up in one form (S-05).
- AC1: The fields and validation follow BR-040–043, and the membership part follows F-08.
- AC2: Save creates the member, assigns the card, creates the membership and payment and, if "Prijavi odmah" is checked (default), checks the member in, all in **one transaction**. If anything fails, nothing is saved.
- AC3: After saving, a notice shows `Upišite ime olovkom na karticu: <Ime Prezime> (#<broj>)`.
- AC4: [Novi član] on S-06 opens the same form with a "Skenirajte praznu karticu" field. Save is disabled until a valid unassigned card has been scanned.

## F-07 Member list, profile, edit, anonymization
**US-07.1** As staff, I search and list members (S-06).
- AC1: The search follows BR-044. Results show number, name, phone, the current status summary and the last visit date.
- AC2: 25 results per page.

**US-07.2** As staff, I open a member's profile (S-07) with personal data, card, memberships (status, dates, remaining sessions, trainer), payments I am allowed to see, and visit history.
- AC1: Memberships are sorted by `end_date` descending, and each shows its BR-054 status label.
- AC2: Visit history shows 20 visits per page with date, check-in and check-out times, type, trainer, and a "Neplaćeno" badge where applicable.

**US-07.3** As staff, I edit personal data (BR-045). The change appears in the audit log.

**US-07.4** As the owner, I anonymize a member (BR-046) after typing the member number to confirm.

## F-08 Selling and renewing memberships
**US-08.1** As staff, I sell a membership (S-08) from the profile, a warning dialog, or registration.
- AC1: The plan list shows active plans, excluding the day pass.
- AC2: The start date, reason text and last valid day are calculated by BR-052 and BR-051 and shown before saving.
- AC3: A trainer is required when BR-058 applies, and the list follows BR-023.
- AC4: The amount is read-only for list-price plans (editable for the owner). For Personalni it is required and ≥ the minimum (BR-059), and the session count (1–50) is required.
- AC5: The payment method is required. Save runs in one transaction (BR-060) and links unpaid visits per BR-052.
- AC6: With no open shift, Save is disabled (BR-092), except in the owner's back-dated mode.

**US-08.2** As staff, [Produži] on a membership opens S-08 with the same plan and trainer preselected.

## F-09 Membership status and session counting
**US-09.1** Status and remaining sessions everywhere follow BR-053–055 and always reflect the latest data.

## F-10 Unpaid visits and warnings
Covered by US-04.4, BR-078 and BR-079.

**US-10.1** As staff, the profile shows the count of unlinked unpaid visits as a red badge `Neplaćeni dolasci: N`.

## F-11 Lost card replacement
**US-11.1** As staff, I replace a lost card (BR-034) via [Izgubljena kartica] on S-07.
- AC1: The dialog shows the fee and asks for the method, then asks to scan an unassigned card.
- AC2: Scanning a card that is not unassigned shows its BR-070 message, and the dialog stays open.

## F-12 Day passes
**US-12.1** As staff, I sell day passes (BR-100) with [Dnevna karta] on S-03.
- AC1: A quantity stepper (1–20), the live total, and the method. After saving, a toast shows `Prodato: <N> × dnevna karta = <iznos>`.

## F-13 Payment correction and voiding
**US-13.1** As staff, I see and correct the current shift's records on S-12 (BR-094, BR-095).
- AC1: The list shows today's payments and sales (non-back-dated), newest first. Records outside the open shift are read-only for non-owners.
- AC2: [Ispravi] allows changing the method and note (and the amount for the owner). [Poništi] requires a reason of 3–200 characters.
- AC3: Voiding a membership payment shows a confirmation that the membership will be voided and its visits become unpaid.

## F-14 Desk cash expenses
**US-14.1** As staff, I record a small expense paid from the till with [Trošak] on S-03 (BR-132).
- AC1: After saving, the expense appears in S-12 "Moji troškovi danas" and in the shift summary.

## F-15 Magacin
**US-15.1** As staff, I record a sale (BR-142) and new goods (BR-141) on S-13.
- AC1: The stock level updates immediately after saving.
- AC2: The sale quantity cannot exceed stock (E17).
- AC3: Stock-in with "Iz kase" reduces expected cash (E18).
- AC4: Stock-in with a zero or negative purchase price is rejected by both the form and the RPC, without creating a stock movement or an expense. The minimum purchase price is €0.01 (D-55).

**US-15.2** As the owner, I manage products (S-26) and see stock value and bar profit (S-20).

## F-16 Shift close and report
**US-16.1** As a receptionist, I close my shift (BR-114) on S-14.
- AC1: The summary numbers equal BR-115. This is tested with E15.
- AC2: Counted cash is required. The difference appears live as "Manjak" or "Višak".
- AC3: After confirming: the shift is closed, the PDF is stored, the email is sent or queued, and I am logged out and shown `Smjena je zaključena.` on S-01.
- AC4: If the email fails, closing still succeeds (BR-118).

## F-17 Owner finance dashboard
**US-17.1** As the owner, I see income, expenses and profit for a chosen period (S-16).
- AC1: The period presets are Danas, Ova sedmica (Monday–Sunday), Ovaj mjesec, Prošli mjesec, Ova godina, plus a custom range. The default is Ovaj mjesec.
- AC2: The numbers follow BR-150–153 and have breakdowns by plan, method and category.
- AC3: The page also shows:
  - a bar chart of monthly income vs expenses for the last 12 months;
  - active members (count of members with at least one Aktivna membership today);
  - memberships expiring in the next 7 days (list);
  - members with unlinked unpaid visits (list).

## F-18 Owner expenses and categories
**US-18.1** As the owner, I record any expense (BR-133) and see all expenses with filters for period, category, method and "entered by" (S-17).
- AC1 (D-63): the screen shows `Ukupno: <iznos>` for the listed expenses, voided ones excluded, and the total follows every change of period or filter.

**US-18.2** As the owner, I manage categories (BR-131) with [Kategorije troškova].

## F-19 Trainer statistics and payouts
**US-19.1** As the owner, I see BR-156 metrics per trainer for a chosen month (S-18).
- AC1: Undefined shares are shown as "nije definisano" (E12).
- AC2: [Evidentiraj isplatu] opens the S-17 expense form prefilled with category Plate, the trainer, and the amount = Razlika (editable).

## F-20 Visit statistics
**US-20.1** As an owner or manager, I see visit statistics for a period (S-15):
- visits per day (bar chart);
- visits per hour of day (bar chart, 06–23);
- visits by type;
- average visit duration (excluding automatic check-outs);
- the top 10 members by visits.

## F-21 Settings: plans, prices, gym
**US-21.1** As the owner, I edit plans (S-25), other prices and gym settings (S-27), and upload the logo (PNG or JPG, ≤ 1 MB). Every change is audited.
- AC1: Changing a price does not change existing records (BR-004).
- AC2: A plan cannot be deleted, only deactivated.

## F-22 Settings: trainers, programs, schedule
**US-22.1** As an owner or manager, I manage trainers, programs, the trainer × program assignment matrix and the weekly schedule (S-24), following BR-023–026.
- AC1: An assignment is saved when its checkbox is toggled.
- AC2: A slot can only be created with a trainer assigned to its program.
- AC3: Trainer fee fields are visible to owners only.

## F-23 Back-dated entries
**US-23.1** As the owner, I enter past visits, membership sales, day passes and card replacement payments (S-22, BR-120). Each record shows a "Naknadno" badge wherever it is listed.

## F-24 Audit log
**US-24.1** As the owner, I browse the audit log (S-21), filtered by period, user and record type. Each row shows the time, the user, the action, and a readable old → new comparison.

## F-25 Expiry reminder email
**US-25.1** As a member, I get an email 3 days before my membership ends (BR-160), using the doc 08 §7 template.

## F-26 Nightly job
**US-26.1** At 23:00 open visits are closed and the open shift is closed, and its report is sent (BR-162). Tested with E20.

## F-28 Weekly automatic backup
**US-28.1** As the developer, I receive an encrypted backup of all gym data every week (BR-163).
- AC1: Every Sunday after 03:00 gym time, exactly one backup is created; running the job again the same day does nothing.
- AC2: The ZIP opens only with `BACKUP_ZIP_PASSWORD` and contains one CSV per table plus `manifest.json` with correct row counts.
- AC3: The ZIP is stored in the `backups` bucket; after the 9th backup, the oldest is deleted.
- AC4: The email arrives at every address in `backup_emails`, with the ZIP attached (or the "too large" note).
- AC5: A failed run is retried up to 3 times that day, and S-27 shows `Posljednja rezervna kopija: <dd.mm.yyyy HH:mm> – uspješno/neuspješno`.

## F-27 Offline banner
**US-27.1** As staff, I immediately see when the internet is down.
- AC1: When the browser reports offline, or 2 consecutive requests fail with network errors, a red banner is shown across the top: `Nema internet konekcije. Podaci se ne mogu sačuvati – vodite evidenciju na papiru i predajte je vlasniku.`
- AC2: While the banner is shown, all save buttons are disabled.
- AC3: The banner disappears within 5 s after connectivity returns.
