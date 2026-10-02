# 04 — Roles and Permissions

**Roles:** `admin` (Administrator), `owner` (Vlasnik), `manager` (Menadžer), `receptionist` (Recepcioner). Trainers and members have no accounts.

> The `admin` role was added by D-58 on 18.09.2026. **An admin has every permission an owner has**, so the Owner column below also describes the admin unless a row says otherwise. Rows P-03, P-04, P-06 and P-07 state where the two differ.

## 1. Permission matrix
✓ = allowed · ✗ = not allowed · "open shift" = only records attached to the currently open shift (BR-094)

| # | Capability | Owner | Manager | Receptionist | Rule |
|---|---|---|---|---|---|
| **Accounts** | | | | | |
| P-01 | Log in with email + password | admin only (and the seeded owner Matija) | ✗ | ✗ | D-57 |
| P-02 | Log in with username + password | ✓ | ✓ | ✓ | D-57 |
| P-03 | Create, edit, deactivate owner and admin accounts | admin only | ✗ | ✗ | D-58 |
| P-04 | Create, edit, deactivate manager and receptionist accounts; set their passwords | ✓ | ✓ | ✗ | AS-5 |
| P-05 | Change own password | ✓ | ✓ | ✓ | |
| P-08 | Unlock a login locked after failed sign-ins (S-23) | ✓ (owner and admin accounts: admin only) | ✗ (sees the lock) | ✗ | D-75 |
| P-06 | Read any staff member's stored password | admin only | ✗ | ✗ | D-59 |
| P-07 | Deactivate own account, or the last active owner or admin | ✗ for everyone | ✗ | ✗ | D-60 |
| **Shifts** | | | | | |
| P-10 | Have a shift (auto-open on login, resume, take over) | ✗ | ✗ | ✓ | BR-110–113 |
| P-11 | Close own shift | — | — | ✓ | BR-114 |
| P-12 | Close any open shift | ✓ | ✗ | ✗ | BR-114 |
| P-13 | Shift archive, report PDFs, resend email | ✓ | archive only: no PDF, no email status (D-80) | ✗ | BR-118, D-80 |
| P-14 | Current open shift totals: cash income, card income, till expenses, expected cash | ✓ | ✓ | own shift | BR-115, D-54 |
| **Desk** | | | | | |
| P-20 | Scan, check in, check out (incl. manual), see "U teretani" | ✓ | ✓ | ✓ | BR-070–081 |
| P-21 | Register a member (card scan required) | ✓ | ✓ | ✓ | BR-033 |
| P-22 | Search members, view profiles | ✓ | ✓ | ✓ | BR-044 |
| P-23 | Edit member personal data | ✓ | ✓ | ✓ | BR-045 |
| P-24 | Anonymize a member | ✓ | ✗ | ✗ | BR-046 |
| P-24a | Pause a membership (7 days at most in total) and end a pause | ✓ | ✓ | ✓ | BR-056, D-100 |
| P-25 | Sell or renew a membership at list price (open shift required) | ✓ | ✓ | ✓ | BR-092 |
| P-26 | Enter the amount, sessions and the gym's fixed part for Personalni (amount ≥ minimum) | ✓ | ✓ | ✓ | BR-059, D-99 |
| P-27 | Change a list-price amount | ✓ | ✗ | ✗ | BR-059 |
| P-27a | Override the start date of a membership being sold (S-05, S-08) | ✓ | ✓ | ✓ | BR-052, D-97 |
| P-28 | Sell day passes; replace a lost card | ✓ | ✓ | ✓ | BR-034, BR-100 |
| P-29 | View today's payments and sales (not back-dated) | ✓ (all dates) | ✓ | ✓ | |
| P-30 | Correct method or note; void with reason | ✓ (any record) | open shift | open shift | BR-094, BR-095 |
| P-31 | Correct an amount | ✓ | ✗ | ✗ | BR-094 |
| P-32 | Enter an expense at the desk on the BR-133 form: any day up to today, any method, from the till or not; non-salary category; open shift | ✓ (salary too, no shift needed outside the till) | ✓ | ✓ | BR-132, D-98 |
| P-33 | View expenses | all | every non-salary expense, read-only: of today on S-12 (D-96), of Danas, Ova sedmica or Ovaj mjesec on S-17 (D-80) | own, today | BR-134, D-80, D-96 |
| P-34 | Void an expense | ✓ (any) | own, open shift | own, open shift | BR-135 |
| **Magacin** | | | | | |
| P-40 | View products, stock level, purchase and sale price | ✓ | ✓ | ✓ | BR-144 |
| P-41 | Stock-in (enter the invoice purchase price); sale | ✓ | ✓ | ✓ | BR-141, BR-142 |
| P-42 | Add or edit products, change the sale price (on S-13 Magacin) | ✓ | ✓ (D-76) | ✗ | BR-140, D-76 |
| P-43 | Void a stock-in | ✓ | ✗ | ✗ | BR-095 |
| P-44 | Stock value, cost of goods sold, bar profit, sales history beyond today | ✓ | ✗ | ✗ | BR-144, BR-153, BR-159 |
| **Statistics and finance** | | | | | |
| P-50 | Visit statistics page (S-15) | ✓ | ✓ | ✗ | D-40 |
| P-51 | Finance dashboard, income, expenses, profit, income statement and cash flow (S-16…S-21) | ✓ | Pregled, Troškovi and Smjene only: Prihod and Troškovi without salaries, for Danas, Ova sedmica or Ovaj mjesec; never profit, the statement or the cash flow (D-80, D-92) | ✗ | BR-157, BR-158, D-80, D-92 |
| P-52 | Trainer statistics, shares, payouts | ✓ | ✗ | ✗ | BR-156 |
| P-53 | S-17 [Novi trošak]; salary categories and payouts in the expense form | ✓ | ✗ | ✗ | BR-133, D-98 |
| P-54 | Manage expense categories | ✓ | ✗ | ✗ | BR-131 |
| P-55 | Back-dated entries | ✓ | ✗ | ✗ | BR-120 |
| P-56 | Audit log | ✓ | ✗ | ✗ | BR-096 |
| P-57 | Fixed expenses and salaries (S-30): view, add, change, deactivate | ✓ | ✗ | ✗ | BR-136, D-93 |
| **Settings** | | | | | |
| P-60 | Trainers (name, active), programs, assignments, class slots | ✓ | ✓ | ✗ | BR-026 |
| P-61 | Trainer fees, plan prices, share %, gym fixed amounts | ✓ | ✗ | ✗ | BR-026 |
| P-62 | Plans (add, edit, deactivate) | ✓ | ✗ | ✗ | BR-004 |
| P-63 | Gym settings: fees, minimum, reminder days, close time, double-scan seconds, report recipients, logo | ✓ | ✗ | ✗ | BR-012 |
| P-64 | Generate and print card batches | ✓ | ✗ (D-81) | ✗ | BR-036, D-81 |
| P-65 | Trainer roster (S-29): members per trainer and fixed class time, today's check-ins | ✓ | ✓ | ✓ | BR-027, D-72 |
| P-66 | Membership amounts and the revenue total on S-29 | ✓ | ✗ | ✗ | BR-027, BR-157 |

> ASSUMPTION (AS-5): Managers can manage manager and receptionist accounts, but never owner accounts. Only owners create owners.

## 2. Enforcement
1. **Database first.**
   - Every table has Row Level Security enabled.
   - The `authenticated` role has **no direct INSERT, UPDATE or DELETE** on business tables.
   - Every write goes through a `security definer` Postgres function (RPC) that checks role, gym and shift rules and raises a coded error when a rule is broken.
   - Reads are limited by RLS SELECT policies (doc 07 §6).
2. **Financial fields live in owner-only tables.**
   - `plan_finance`, `membership_finance` and `trainer_finance` hold them.
   - Owner reports are `security definer` functions that start with an owner check.
   - Managers and receptionists can never receive these values, even through the API directly.
   - The one exception is D-80: `fin_summary`, `fin_income_breakdown`, `fin_expenses` and `fin_shifts` start with `assert_finance_period`, which also admits a manager for today, this week or this month, and then return income, non-salary expenses and shift totals only. Profit, bar profit, the cost of goods sold, the income statement and cash flow (`fin_statement`, D-92), stock value, salaries, trainer shares and shift reports never reach a manager.
3. **UI.**
   - Navigation and buttons are shown only when the role may use them.
   - Server components also check the role and return 404 for pages the role may not open.
4. **Staff account actions** (create user, set password, deactivate) run in server actions with the Supabase service-role key, after checking the caller's role. The service-role key is **never** sent to the browser.
5. **Deactivated staff:**
   - `staff.is_active = false`, and the Supabase Auth user is banned;
   - existing sessions are rejected on the next request;
   - history is kept.
6. **Tests.** Every row in §1 marked ✗ has an automated test proving the database rejects the action (doc 08 §10).
