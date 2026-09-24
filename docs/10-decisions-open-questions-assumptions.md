# 10 — Decisions, Open Questions, Assumptions, Suggestions

## 1. Decision log
These are decisions made by Mihajlo (M) or the gym owner (O) during specification.

### Scope and approach
| ID | Decision | By |
|---|---|---|
| D-01 | Build for KP Fitness only. The database is multi-tenant ready; no self-signup or super-admin yet. | M |
| D-02 | Everything described is MVP. | M |
| D-03 | Online only. During an outage, staff use paper and the owner enters back-dated data later. | M |
| D-04 | SETUP_GUIDE dropped; Excel analysis moved to an appendix. | M |
| D-12 | More than one owner account is allowed. | M |
| D-47 | Basic accessibility, not a full WCAG audit. | M |
| D-48 | The owner can anonymize members. | M |
| D-49 | Free tiers (Supabase Free, Vercel Hobby). | M |
| D-50 | Automated tests: unit, RLS, end-to-end. | M |
| D-51 | A seed script creates the gym, prices, trainers and owner Matija (matija.vojinovic@eurotehnikamn.me). | M |
| D-52 | Claude Code builds one milestone at a time and stops for review. | M |
| D-53 | Recharts for charts. | M |
| D-56 | Work directly against hosted Supabase project `paakuxiufzmdobpooqdi`; do not use Docker or a local Supabase stack. Use the hosted transactional pgTAP runner and inspect existing data before migrations. Confirmed 18.09.2026. | M |

### Accounts and shifts
| ID | Decision | By |
|---|---|---|
| D-05 | ~~Login with a username and password. Receptionists use usernames; owners and managers use email (so they can reset passwords).~~ **Superseded by D-57 on 18.09.2026.** | M |
| D-57 | Every staff account signs in with a **username** and password, whatever its role. The only exceptions are the `admin` role, which signs in with an email so a forgotten admin password can be reset, and the seeded owner account of Matija Vojinović, which keeps its existing email login. Email inside the application otherwise serves only outgoing notifications to members (BR-160). Supersedes D-05. | O |
| D-58 | A fourth role, `admin`, sits above `owner`. It has every owner permission and is additionally the only role that may create, edit, deactivate and set passwords for owners and other admins, and the only role that may read stored staff passwords (D-59). | O |
| D-59 | Staff passwords are stored in readable form beside the Supabase bcrypt hash, in an admin-only table, so the admin can look up any employee password. The owner was told that Supabase keeps only a one-way hash, and that a readable copy exposes every staff password to anyone who obtains the database or a backup ZIP, and accepted that risk on 18.09.2026. The readable copy is kept for staff accounts only, never for members, and is never exposed to any other role, any log or any report. | O |
| D-64 | The shift report names whoever closed the shift: `Zaključio/la <ime>` from `closed_by`, so an owner closing a shift on S-19 is no longer reported as the receptionist. Takeover (`Preuzeo/la <ime>`) and automatic close are unchanged; S-19 shows the same name. No schema change: `close_shift` already records the caller. Confirmed by the gym owner, 23.09.2026. | O |
| D-67 | A receptionist who signs in while another receptionist's shift is open is held on S-02 by the app: every page leads back to `/shift/gate`, which shows no menu, until the shift is taken over (BR-111, N-23). The database does **not** check whose shift a receptionist's money RPC lands in; the owner decided on 24.09.2026 that the app-level gate is enough. | O |
| D-60 | An owner may not deactivate their own account, and the last active owner may not be deactivated. The same protection applies to the last active admin. This keeps the gym from losing account administration. | O |
| D-06 | Only receptionists have shifts; their login opens a shift. | M |
| D-07 | One open shift per gym. | M |
| D-08 | A forgotten shift is closed automatically at 23:00 and its report is emailed. | M |
| D-09 | The receptionist enters counted cash at close; the difference is shown. No opening float. | M |
| D-10 | Shift reports go only to mihajlo@stamenkovicc.com for now (editable). | M |
| D-11 | No idle logout. | M |
| D-F2 | Owner and manager money actions go into the open receptionist shift; they are blocked if none is open (except back-dated entries). | M |
| D-F3 | A second receptionist can take over an open shift. | M |
| D-54 | Managers may see the currently open shift's cash income, card income, till expenses and expected cash. This is aggregate access only; expense details retain BR-134 restrictions, and closed-shift reports remain owner-only. Confirmed 18.09.2026. | M |

### Payments
| ID | Decision | By |
|---|---|---|
| D-13 | Staff may correct the method and note, or void and re-enter. Only the owner changes amounts. | M |
| D-14 | Voiding a membership sale voids the membership; its visits become unpaid. | M |
| D-15 | Only the owner may back-date. | M |
| D-26 | Grupni costs €69 for 12 sessions (fixed price). | M/O |
| D-27 | Revenue is counted by payment date. | M |
| D-F5 | Personal training has one gym-wide minimum (default €80, editable); the receptionist enters the amount per member. | M |
| D-F6 | Owner back-dated entries include membership sales. | M |

### Memberships and check-in
| ID | Decision | By |
|---|---|---|
| D-16 | The "start after the old one ends" rule applies whenever the plans share an access type. | M |
| D-17 | Unpaid visits are linked only if the new plan covers their type. | M |
| D-18 | A member without gym coverage may still enter the gym, as an unpaid visit with a warning. | M |
| D-66 | A member's first and last name may not contain emoji (the shift report's font cannot print them, N-16). The form says `Ime ne smije sadržati emoji.` / `Prezime ne smije sadržati emoji.`, and `clean_member()` refuses them too (migration 0028). Letters of any script, digits and punctuation stay allowed. Decided by the owner, 24.09.2026. | O |
| D-19 | With several covering memberships, the receptionist chooses. | M |
| D-F7 | …with the earliest-ending one preselected. | M |
| D-20 | "3x nedeljno" is a label only. | M |
| D-21 | The nearest class slot is preselected and can be changed. | M |
| D-22 | Revenue goes to the membership's trainer; the session count goes to the visit's trainer. | M |
| D-23 | One group program "Grupni trening" shared by Milena, Julija and Tamara. | M |
| D-24 | A personal package lasts 1 calendar month; the receptionist enters the number of sessions. | M |
| D-25 | The minimum personal price per trainer is not decided (see OQ-2). | M |
| D-62 | A trainer may have their own group share percentage. The plan keeps the general rule (Grupni 70%, G+T 100% of what remains after the gym's fixed amount) and a trainer row may override it; empty means the plan's percentage applies. Only the owner and the admin see or set it (BR-026). The percentage is resolved **at sale** and copied onto the membership like every other financial term (BR-050), so changing it never touches a membership already sold. Confirmed by the gym owner, 18.09.2026. | O |
| D-61 | A member who wants a different plan part-way through a paid membership simply buys the new one. The two memberships run side by side (BR-057), the old one expires on its own date, and its unused sessions are lost (BR-055). There is **no** plan change, no proration, no refund and no transfer of remaining sessions; BR-056 already forbids extending or pausing a membership. Voiding stays what it is — a correction for a mistaken entry (BR-095, D-14), not a way to refund. Confirmed by the gym owner, 18.09.2026. | O |

### Cards
| ID | Decision | By |
|---|---|---|
| D-28 | Card codes are 10 digits. | M |
| D-29 | Card print layout: 10 per A4 sheet, credit-card size, logo, QR, digits, name line. | M |
| D-30 | A card is required to register a member. | M |
| D-31 | "Prijavi odmah" is on by default at registration. | M |

### Storage and expenses
| ID | Decision | By |
|---|---|---|
| D-32 | The owner manages products and prices. | M |
| D-33 | The receptionist enters the purchase price from the invoice but cannot change the sale price. | M |
| D-34 | Sales that would make stock negative are blocked. | M |
| D-35 | A stock-in creates the "Roba za prodaju" expense; profit = income − expenses. | M |
| D-36 | Trainer payouts: the dashboard computes what is owed; actual payouts are Plate expenses linked to the trainer. | M |
| D-37 | Receptionists use all active categories except salary categories. | M |
| D-38 | Receptionists see their own expenses today. | M |
| D-39 | The owner's expense form includes supplier, invoice and VAT. | M |
| D-40 | The visit statistics page is available to owner and manager. | M |
| D-F4 | Stock-in asks "Iz kase / Van kase". | M |
| D-63 | S-17 shows **Ukupno**: the sum of the expenses the current period and filters list, voided expenses excluded (BR-095). With no filter it equals the "Troškovi" card on S-16 for the same period. Requested by the gym owner after the 23.09.2026 test pass (FIN-09). | O |
| D-55 | Free stock deliveries are not allowed. A stock-in purchase price must be at least €0.01, so its automatic expense is positive. Confirmed 18.09.2026. | M |

### Jobs, email and technical choices
| ID | Decision | By |
|---|---|---|
| D-41 | Scheduled jobs run with Supabase pg_cron. | M |
| D-42 | The expiry email is plain Montenegrin text and date-based only. | M |
| D-43 | If the shift email fails, the shift still closes and the email is retried. | M |
| D-F8 | Emails are sent from `noreply@stamenkovicc.com` for now; switch to the gym's domain later. | M |
| D-F9 | A weekly automatic backup is emailed to the developer. | M |
| D-44 | The UI uses ijekavica. | M |
| D-45 | Reception runs Chrome on desktop at 1366×768 or larger; the owner uses a phone at 375 px or wider. | M |
| D-46 | The scan result appears within 1 second. | M |
| D-65 | The shift report (BR-117) goes to the addresses in `shift_report_emails` **and always to every active owner who has an email**, each address once, so removing the owner from S-27 cannot stop it. It is the only financial report the app emails; the weekly backup keeps its own recipients. Resolves OQ-6. Decided by the owner, 24.09.2026. | O |

### Earlier owner answers (September 2026)
| ID | Decision | By |
|---|---|---|
| D-O1 | Pre-printed paper QR cards, a USB scanner, and scanning by the receptionist. | O |
| D-O2 | Members with an expired membership may enter; they get a warning, and a bigger warning from the second unpaid visit. | O |
| D-O3 | A second scan checks the member out (card-for-key routine); open visits are checked out automatically at 23:00. | O |
| D-O4 | Renewal rules: continue from the old end; backdate to the first unpaid visit; the last valid day is inclusive; no freezing. | O |
| D-O5 | Every visit uses a session, even a second one on the same day; unused sessions expire at the membership end. | O |
| D-O6 | Only cash and card; no debts; day passes are counted without names; FitPass is not recorded. | O |
| D-O7 | Trainers don't use the app. Group revenue is split 70/30; G+T gives €50 to the gym and €49 to the trainer; Tamara and Tatjana pay the gym €80 per personal client. | O |
| D-O8 | Only the owner sees finances. Managers manage users but see no finances. | O |
| D-O9 | The expense categories from Excel are kept, and the owner can add new ones. Bar sales record the payment method. There is no rental tracking. | O |
| D-O10 | The database starts clean; nothing is imported. | O |

## 2. Open questions
Resolved and removed: OQ-3 (now D-F8), OQ-4 (now D-F9) and OQ-6 (now D-65). The remaining IDs keep their numbers.

| ID | Question | Temporary behaviour | Where |
|---|---|---|---|
| OQ-1 | What is Julija's personal-training arrangement? | Fee `null`, shares "nije definisano" | BR-020, BR-155 |
| OQ-2 | Should the personal minimum price differ per trainer? | One gym-wide minimum (€80) | BR-012, BR-059 |
| OQ-5 | Vercel Hobby is for non-commercial use. Which host is used for production? | Hobby during development | 08 §1 |

## 3. Assumptions (made by the author, not confirmed by the owner)
| ID | Assumption | Where |
|---|---|---|
| AS-1 | Phone numbers without a country code are Montenegrin (+382). | BR-041 |
| AS-2 | Allowed date of birth is 01.01.1900 to today; no minimum age. | BR-040 |
| AS-3 | A duplicate phone or email produces a warning, not a block. | BR-043 |
| AS-4 | Receptionists use internal, non-deliverable emails; usernames are globally unique. | 08 §4 |
| AS-5 | Managers manage manager and receptionist accounts, never owners. | 04 |
| AS-6 | The entered purchase price becomes the product's current purchase price and the cost of later sales. | BR-141 |
| AS-7 | A negative personal trainer share becomes 0 with a warning. | BR-155 |
| AS-8 | With no comparable previous membership, all unlinked unpaid visits of covered types qualify for backdating. | BR-052 |
| AS-9 | Unpaid visits older than the new membership's duration stay unpaid; the membership starts today. | BR-052, E5 |
| AS-10 | Counted cash is optional when taking over a shift. | BR-111 |
| AS-11 | Business rules are Postgres functions tested with pgTAP; Vitest covers TypeScript. | 08 §1 |
| AS-12 | Class slot preselection window is ±90 minutes. | BR-075 |
| AS-13 | The green check-in dialog closes after 5 seconds. | BR-079 |
| AS-14 | Non-owners can correct or void only records of the currently open shift. | BR-094 |
| AS-15 | Bar sales and stock-ins can be voided (with a reason). | BR-095 |
| AS-16 | A receptionist may log out without closing the shift. | BR-113 |
| AS-17 | An expense paid outside the till is stored with `method = null` ("Van kase"). | BR-141, 07 |
| AS-18 | Accounts created with a temporary password must change it at first login. | 08 §4 |
| AS-19 | UI strings are kept in one dictionary file; no i18n library. | 08 §3 |
| AS-20 | pg_cron calls Next.js route handlers (not Edge Functions) so PDFs render in Node. | 08 §1, §8 |
| AS-21 | The weekly backup runs on Sunday at 03:00 gym time. | BR-162, BR-163 |
| AS-22 | The backup ZIP is AES-256 encrypted with a password kept outside email. | BR-163 |
| AS-23 | 8 backups are kept; ZIPs over 35 MB are not attached. | BR-163 |

## 4. Suggestions (not in scope; ask Mihajlo before adding)
| ID | Suggestion | Why it might help |
|---|---|---|
| SG-1 | Stock adjustment with a reason (breakage, stock-take differences) | Since negative stock is blocked, there is currently no way to correct the stock level except voiding records. |
| SG-3 | CSV/Excel export of payments and expenses for the accountant | The owner used Excel before; the accountant may ask for it. |
| SG-4 | Merge duplicate members | Duplicates only produce warnings (AS-3). |
| SG-5 | Low-stock alert on the Magacin page | Avoids running out of water. |
| SG-6 | Opening cash float per shift | Makes the cash difference exact if the till starts with change. |
| SG-7 | Two-factor authentication for owners | Owners see all finances. |
| SG-8 | Error monitoring (e.g. Sentry free tier) | Faster diagnosis of production problems. |
| SG-9 | Member QR code on the phone (email with the QR image) | A backup when the paper card is forgotten. |
| SG-10 | Membership "ističe uskoro" (expiring soon) badge in the check-in dialog | Staff can remind members in person. |
