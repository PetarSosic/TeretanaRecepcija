# M-03 catalogue and settings (F-21, F-22) — 18.09.2026

Status: complete. All five checks pass, in development and against the production build. M-04 has not started.

## Built

### Migrations

- `0005_catalog.sql` — `trainers`, `trainer_finance`, `programs`, `trainer_programs`, `class_slots`, `plans`, `plan_finance`, `expense_categories` and `products`, with every constraint from doc 07 §3, the doc 07 §6 SELECT policies and the BR-096 audit triggers on the five audited tables. BR-024 is a trigger on `class_slots` rather than only a rule inside the RPC, so a slot whose trainer is not on the program is impossible for any writer.
- `0006_catalog_rpcs.sql` — the nine settings RPCs of doc 07 §5: `upsert_trainer`, `set_trainer_fee`, `upsert_program`, `set_trainer_program`, `upsert_class_slot`, `upsert_plan`, `upsert_product`, `upsert_expense_category` and `update_gym_settings`. Each is security definer, checks role and gym first and raises the doc 08 §5 codes.
- `0007_gym_assets_bucket.sql` — the private `gym-assets` bucket, capped at 1 MB and PNG or JPEG only, readable by staff of the owning gym.

Financial columns stay in their own owner-only tables: a manager reading `trainer_finance` or `plan_finance` gets nothing back, which pgTAP proves. D-58 applies throughout — an admin has the owner's reach.

### Seed steps 2 to 7

`supabase/seed.sql` now seeds plans, trainers, programs, assignments, slots, expense categories, the product and the member counter, all idempotently. A re-run changes nothing, so it can never overwrite a price the owner has since edited (BR-004). Verified against the specification, row by row:

| Seed | Expected | Result |
|---|---|---|
| Plans | BR-010, 12 rows with their coverage, limits and finance | Exact, including Personalni with no price and Dnevna karta with no duration |
| Plan finance | Grupni 70%, G+T €50 fixed and 100%, the rest none | Exact |
| Trainers | BR-020: Milena and Julija without a fee (OQ-1), Tamara and Tatjana €80 | Exact |
| Programs and assignments | BR-021, 2 programs and 6 assignments | Exact |
| Class slots | BR-022, 12 slots | Exact |
| Categories | BR-130, 14 rows with Plate as salary and Roba za prodaju as system | Exact |
| Product | BR-140: Voda 0,30 / 1,50 | Exact |
| Counter | `last_number = 0` | Exact |

### Screens

- **S-24** `/settings/trainers` (owner, manager, admin): trainers with an inline fee field for owners and admins only, programs, the assignment matrix that saves on each toggle (US-22.1 AC1), and the weekly schedule. The slot form only offers trainers assigned to the chosen program, so AC2 is enforced before the request is even sent, and again by the trigger.
- **S-25** `/settings/plans` (owner, admin): every plan including inactive ones, the BR-004 notice on screen, and full editing of prices, coverage, limits, the gym fixed amount and the trainer share.
- **S-26** `/settings/products` (owner, admin).
- **S-27** `/settings/gym` (owner, admin): the BR-012 settings, the logo upload, and the BR-131 category management.

Navigation now groups the settings screens under one **Podešavanja** menu, which matches how doc 06 §2 lists them.

## Verification

| Check | Result |
|---|---|
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run test` | Pass: 53 tests |
| `npm run test:db` | Pass: 59 assertions, four files (22 new) |
| `npm run test:e2e` | Pass: 40 checks, in development and against `next start` |
| `npm run build` | Pass |

New pgTAP assertions cover the "done when" list: a class slot with an unassigned trainer is rejected both by direct insert and through the RPC; a system category cannot be deactivated; the plan check constraints hold; a manager reads no trainer fee and no plan finance and cannot set a fee or add a product; a receptionist cannot manage trainers at all; and a plan price change leaves the old value in the audit row while the plan carries the new one.

New browser checks: the owner sees and edits the fee column, a manager sees S-24 **without** it and gets 404 on `/settings/plans`, a receptionist gets 404 on all five settings routes, the slot form hides unassigned trainers, and the owner changes a plan price, adds a product, edits gym settings and adds a category.

After the full run the database holds only the real gym: 2 staff, 4 trainers, 2 programs, 12 slots, 12 plans, 14 categories, 1 product.

## One defect found and fixed

**Money was arriving in the browser as a JavaScript number.** PostgREST serialises `numeric` as a JSON number, so `79.00` came back as `79` and the S-24 screen crashed with a 500 on the first render. BR-003 says money is `numeric(10,2)` and never a float, so rather than loosening the formatter I cast every money column to text at the point of reading (`price::text`, `personal_gym_fee::text`, and so on). Money now stays exact text from Postgres to the screen. This matters beyond this milestone: **every later screen that reads an amount must use the same cast**, and I will keep it in mind for M-06 onward.

A second, smaller bug: a confirmation toast fired twice whenever the dialog's callback changed identity between renders. The shared hook now holds that callback in a ref.

## Added after the first report: D-62, the trainer group share

You decided that a trainer may have their own percentage for group trainings, with the plan value as the default. Written down as **D-62** in doc 10, and reflected in doc 03 (BR-020, BR-050, BR-155), doc 06 (S-24) and doc 07 (`trainer_finance.group_share_pct`, `resolve_group_share`, the new `set_trainer_fee` signature).

The percentage is **resolved at the moment of sale**, not when a report is drawn: `resolve_group_share(trainer, plan)` returns the trainer’s own value if set, otherwise the plan’s, and BR-050 copies the answer onto the membership. A later change to either the trainer or the plan therefore cannot touch a membership already sold, and the sale and the reports can never disagree about the rule. Migration `0008` adds the column, the helper and the extended RPC; every seeded trainer starts empty, so all four still get the plan’s 70%.

S-24 now shows two owner-only fields per trainer: the personal fee and `Udio za grupne (%)`, where empty reads as „sa plana“. Five new pgTAP assertions prove the fallback, the override and that clearing it returns to the plan value.

## The intermittent browser failures, diagnosed

The flakiness I flagged in the first report turned out to be test-harness contention, not a defect. Sign-ins occasionally hung for the full 30-second timeout. Measured: with one worker, twelve consecutive sign-ins completed in 690–1043 ms each with no failures; Supabase was not rate limiting (twelve rapid attempts all answered normally). One Next server serves every worker, and each navigation costs the proxy two Supabase round trips, so four workers queued up behind it.

Two changes: the proxy matcher no longer runs on `/_next/` and static files, which removes a large number of pointless round trips, and Playwright now runs two workers. The suite has since run green four times in a row, twice in development and twice against the production build.

## Notes

- **A program's kind and a plan's kind cannot be changed after creation.** Doc 07 §3 does not forbid it, but assignments and sold memberships depend on what a kind means, so the RPCs ignore the field on update and the form disables it. Say the word if you want it editable.
- **Expense categories are managed from S-27**, since doc 06 gives them no screen of their own and doc 07 §5 lists the RPC under the owner's settings group. Doc 09 M-12 also mentions a category dialog; when that milestone lands the two should be the same component.
- No open questions from the specification arose in this milestone.
