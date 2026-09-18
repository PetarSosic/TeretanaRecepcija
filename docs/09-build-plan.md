# 09 — Build Plan

Build the milestones **in order**. For every milestone:
1. Read the listed documents.
2. Implement only the listed scope.
3. Run all checks (`lint`, `typecheck`, `test`, `test:db`, `test:e2e`).
4. Confirm every "Done when" item.
5. **Stop and report to Mihajlo.** The report covers what was built, test results, deviations, and new questions.

Do not start the next milestone until he approves.

---

## M-00 Project setup
**Read:** 08.

**Tasks:**
- Next.js (App Router, TypeScript strict), Tailwind, shadcn/ui, ESLint + Prettier.
- Supabase CLI project configuration for hosted Supabase, `@supabase/ssr` clients (`lib/supabase/*`). No Docker or local database (D-56).
- Vitest, Playwright, pgTAP setup; run pgTAP directly against hosted Postgres with the transactional Node runner (D-56).
- npm scripts from 08 §10.
- `.env.example` with every variable from 08 §11.
- Security headers.
- `lib/format.ts`, `lib/phone.ts`, `lib/errors.ts`, `lib/i18n/me.ts` (skeletons).

**Done when:**
- `npm run dev` shows a placeholder page.
- All 5 check commands run and pass (with sample tests).
- Vitest covers BR-002, BR-003 and BR-041 examples.

## M-01 Database foundation
**Read:** 03 §1, 04 §2, 07 §1–4, 07 §6.

**Tasks:**
- Enums.
- Tables: `gyms`, `gym_settings`, `staff`, `shifts`, `member_counters`, `audit_log`, `job_runs`.
- Helper functions: `current_staff`, `my_role`, `my_gym`, `gym_today`, `gym_local_date`, `open_shift`.
- RLS for these tables; the audit trigger function.
- Seed step 1 and `scripts/seed-owner.ts`.

**Done when:**
- After inspecting the hosted project, apply the new migrations and seed data without resetting the database; `npm run seed:owner` creates Matija idempotently (D-56).
- pgTAP: `gym_today` returns the Podgorica date around midnight UTC.
- RLS tests for `staff` and `shifts` pass.

## M-02 Authentication and staff accounts (F-01)
**Read:** 04, 05 F-01, 06 S-01, S-01b, S-23, 08 §4.

**Tasks:**
- Login with username or email.
- Middleware (session refresh, inactive user check, `must_change_password`).
- `(app)/layout.tsx` with role-based navigation and header.
- S-23 with the staff admin actions.
- Own password change.
- Forgot-password link for owner and manager.

**Done when:**
- E2E: the owner logs in and is forced to change the password; the owner creates a manager and a receptionist; the receptionist logs in with a username; the manager cannot create an owner; a deactivated user is logged out on the next request.

## M-02b Admin role and username logins (D-57 to D-60)
**Read:** 04, 06 S-01, S-23, 07 §2–3 and §6, 08 §4, 10 (D-57 to D-60).

**Tasks:**
- Add the `admin` value to `app_role`; relax the `staff` identity check to one login identity per account, with an email required for admins.
- `staff_credentials` (admin-only readable passwords) and its RLS.
- Extend every RLS policy so an admin has the owner's reach, plus `staff_credentials`.
- S-23: the admin password column, role-aware create form, and the P-07 deactivation guard.
- Seed the admin account (`npm run seed:admin`).

**Done when:**
- pgTAP: an admin reads `staff_credentials` and a receptionist, manager and owner cannot; the last active owner cannot be deactivated.
- E2E: a manager created by the owner logs in with a username; the admin sees stored passwords and creates an owner; an owner cannot deactivate themselves.

## M-03 Catalog and settings (F-21, F-22)
**Read:** 03 §2–3, 03 §12 (categories), 03 §13 (products), 06 S-24–S-27, 07 §3 (related tables), 07 §7.

**Tasks:**
- Tables: `trainers`, `trainer_finance`, `programs`, `trainer_programs`, `class_slots`, `plans`, `plan_finance`, `expense_categories`, `products`.
- Their RPCs and audit triggers.
- Seed steps 2–7.
- Screens S-24, S-25, S-26, S-27, including the logo upload.

**Done when:**
- The seed matches BR-010, BR-012, BR-020–022, BR-130 and BR-140 exactly.
- The manager sees S-24 without the fee column; the receptionist cannot open settings.
- pgTAP: a class slot with an unassigned trainer is rejected.
- A plan price change does not alter any existing row.

## M-04 Member cards (F-03)
**Read:** 03 §4, 06 S-28, 08 §7.

**Tasks:**
- `card_batches`, `cards`, `generate_card_batch`.
- Card sheet PDF and S-28.

**Done when:**
- Generating 100 cards gives 100 unique codes matching BR-030.
- The PDF has 10 cards per page at 85.6 × 54 mm.
- A printed QR scans back to the same 10 digits (manual check noted in the report).

## M-05 Shifts (F-02, part of F-27)
**Read:** 03 §10 (BR-110–113), 05 F-02, 06 S-02, header, 07 RPCs.

**Tasks:**
- `resolve_login_shift` and `take_over_shift`.
- S-02 and the header shift badge.
- Receptionist logout confirmation.
- The BR-092 disabled state for money buttons (shared component).
- The F-27 offline banner.

**Done when:**
- E2E: login opens a shift; re-login resumes it; a second receptionist gets S-02 and the takeover works (E19, without the email for now).
- pgTAP: a second open shift is impossible.

## M-06 Members and memberships (F-06, F-07, F-08, F-09, F-11)
**Read:** 03 §5–6, 03 §8 (BR-090–093), 05 F-06–F-09 and F-11, 06 S-05–S-09, 07 (members, memberships, payments).

**Tasks:**
- Tables: `members`, `memberships`, `membership_finance`, `payments`, `visits` (table only).
- Functions: `membership_*`, `calc_membership_start`, `register_member`, `sell_membership`, `update_member`, `find_duplicates`, `anonymize_member`, `replace_card`.
- Screens S-05 (from S-06), S-06, S-07, S-08, S-09.

**Done when:**
- pgTAP: E1, E2, E4, E13 and E14 pass, and BR-052 works with unpaid visits created by test fixtures (E3 and E5, date logic only).
- E2E: register a member with an empty card, sell Personalni (amount check), renew Mjesečna, replace a lost card.

## M-07 Check-in and check-out (F-04, F-05, F-10)
**Read:** 03 §7, 05 F-04, F-05, F-10, 06 S-03, 08 §9 (performance, sounds).

**Tasks:**
- `scan_card`, `check_in`, `check_out`, `unlinked_unpaid_count`.
- S-03 with scan capture, audio unlock, dialogs S-03a–e, search, and the "U teretani" panel.
- Registration triggered by an unassigned card scan.

**Done when:**
- pgTAP: E3, E6, E7 and E8 pass fully, and every BR-070 row is covered.
- E2E flows 2, 3 and 4 (08 §10) pass.
- A measured `scan_card` p95 ≤ 300 ms locally with 3,000 members and 150,000 visits of generated data (report the number).

## M-08 Money at the desk (F-12, F-13, F-14)
**Read:** 03 §8–9, 03 §12 (BR-132, BR-134, BR-135), 06 S-10–S-12.

**Tasks:**
- `sell_day_passes`, `correct_payment`, `void_payment`, `record_desk_expense`, `void_expense`.
- `expenses` table.
- Screens S-10, S-11, S-12.

**Done when:**
- pgTAP: E16 passes; a non-owner cannot change an amount or edit a record from a closed shift (AS-14); expense visibility follows BR-134.
- E2E flow 6 passes.

## M-09 Magacin (F-15)
**Read:** 03 §13, 06 S-13, 07 (products, stock_movements, expenses).

**Tasks:**
- `stock_movements`.
- `stock_in`, `stock_sale`, `correct_sale`, `void_stock_movement`.
- Screen S-13.

**Done when:**
- pgTAP: E17 and E18 pass; voiding a stock-in voids its expense; negative stock is blocked.
- The receptionist API returns no stock value or profit.
- A zero or negative stock-in purchase price is rejected by the form and RPC without creating any movement or expense; €0.01 is accepted when the other inputs are valid (D-55).

## M-10 Shift close and report (F-16)
**Read:** 03 BR-114–118, 05 F-16, 06 S-14, 08 §6–7.

**Tasks:**
- `shift_summary`, `close_shift`.
- Shift report PDF and Resend email.
- `closeShiftAndReport`.
- S-14.
- Takeover now also sends the report.

**Done when:**
- pgTAP: E15 passes.
- pgTAP: a manager can read only the four BR-115 totals for the current open shift in their own gym; closed-shift and cross-gym requests are rejected, and the response contains no individual expense details (D-54).
- E2E flow 7 passes.
- With a wrong Resend key, the shift still closes and `email_status = 'failed'`.
- The PDF shows č ć š ž đ correctly.

## M-11 Scheduled jobs and backup (F-25, F-26, F-28)
**Read:** 03 §15, 08 §8.

**Tasks:**
- `job_nightly` and `job_expiring_memberships`.
- The `expiry_notifications` table.
- Route handlers, pg_cron schedules, email-retry, expiry email template.
- `backup_runs` table, `backups` bucket, `lib/backup.ts`, the weekly-backup handler, and the S-27 backup status line.

**Done when:**
- pgTAP: E20 passes, including idempotency.
- A handler call without the secret returns 401.
- The morning job sends exactly one email per qualifying membership and skips renewed and anonymized members.
- With `EMAIL_FROM` unset, reminders are skipped and logged.
- Backup: the US-28.1 acceptance criteria pass. A test ZIP opened with the password contains every table and matching row counts; the wrong password fails.
- Restore test: the CSVs from a backup load into an empty, separate hosted Supabase test project, never the working gym project (D-56; developer steps written down for M-13).

## M-12 Owner finance (F-17, F-18, F-19, F-23, F-24)
**Read:** 03 §11, 03 §14, 05 F-17–F-19, F-23, F-24, 06 S-16–S-22.

**Tasks:**
- `fin_*` functions and `record_expense`.
- The category management dialog.
- `backdated_*` RPCs.
- Screens S-16 to S-22, including the owner "close any shift" and "resend email" actions.

**Done when:**
- pgTAP: E9–E12 pass; BR-156 is correct on a fixture month; a manager calling any `fin_*` function gets `E_FORBIDDEN`.
- E2E flows 9 and 10 pass.
- Back-dated records do not change any shift summary.

## M-13 Visit statistics, polish and release (F-20, F-27 complete)
**Read:** 05 F-20, 06 S-15, 08 §9–11.

**Tasks:**
- `visit_stats` and S-15.
- Empty, loading and error states on every screen, checked against doc 06.
- Accessibility pass (08 §9).
- Full E2E suite.
- Production deployment guide in the README (Supabase push, Vault secrets, Vercel env vars, cron check, Resend domain verification for `stamenkovicc.com`, Resend SMTP in Supabase Auth, and the backup restore steps).

**Done when:**
- All 11 E2E flows pass.
- Every screen was checked at 1366×768 and 375 px (screenshots attached to the report).
- A production deployment was completed with a smoke test (login, scan, close shift).
