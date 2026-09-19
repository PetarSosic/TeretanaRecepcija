# M-12 Owner finance (F-17, F-18, F-19, F-23, F-24) — 19.09.2026

Status: complete. All five checks pass, and the production build is clean. M-13 has not started.

## Built

### Migrations 0020 to 0023

- **`assert_owner()`** — the guard every `fin_` function starts with (BR-157). D-58 gives
  the admin the owner's reach.
- **`membership_shares(membership, amount)`** (BR-155) returns the trainer's share, the
  gym's share, whether the arrangement is *defined at all*, and the AS-7 warning. The
  terms come from the snapshot taken at the sale (BR-050, D-62), never from the plan as it
  stands today.
- **The nine report functions of doc 07 §5:** `fin_summary`, `fin_income_breakdown`,
  `fin_expenses`, `fin_trainer_stats`, `fin_trainer_payments`, `fin_storage`,
  `fin_shifts`, `fin_expiring`, `fin_unpaid_members` — plus **`fin_monthly`**, which
  doc 07 does not list but US-17.1 AC3 needs (see the interpretations below).
- **`record_expense`** (BR-133): any date up to today, any active category, any method
  including "Van kase", optional supplier, invoice and VAT, and a trainer only on a salary
  category. Ticking "iz kase" pulls the record back into today's open shift.
- **The four back-dated RPCs** (BR-120): `backdated_visit`, `backdated_membership`,
  `backdated_day_passes`, `backdated_card_fee`. Each writes `is_backdated = true` and no
  shift, which is what keeps them out of every shift report and out of expected cash while
  still counting in finance.
- **`membership_sale` gained two arguments** — the day the money was taken, and the
  back-dated flag — so a back-dated sale follows exactly the same BR-050 to BR-060 path a
  live one does. Its first nine arguments and its behaviour for a normal sale are
  unchanged, so `sell_membership` and `register_member` call it as before.

### Screens

- **S-16 `/finance`:** the four cards (BR-150 to BR-153) plus the active-member count, the
  twelve-month chart, income by plan and by method, expenses by category, the memberships
  expiring within seven days, and the members with unpaid visits.
- **S-17 `/finance/expenses`:** the BR-133 form, filters for category, method and who
  entered it, the void with its reason (BR-135), and [Kategorije troškova], which opens
  the same BR-131 editor S-27 has — the section was moved into a shared component rather
  than written twice.
- **S-18 `/finance/trainers`:** a month selector, the BR-156 row per trainer,
  [Evidentiraj isplatu] which opens S-17 prefilled with Plate, the trainer and the
  difference (US-19.1 AC2), and the per-payment detail with each split.
- **S-19 `/finance/shifts`:** the open shift on top with [Zaključi smjenu] (BR-114, P-12),
  the closed ones with their BR-115 totals, [PDF] and [Pošalji ponovo] (BR-118). The PDF
  comes through a new route that reads the private bucket server-side.
- **S-20 `/finance/storage`:** stock and stock value per product, what the bar earned over
  the period, the daily sales, and the stock-ins with [Poništi].
- **S-21 `/finance/audit`:** the log with filters for period, user and record type, and a
  readable `polje: staro → novo` for each row.
- **S-22 `/finance/backdated`:** the four tabs with the `Naknadni unos – ne ulazi u smjenu.`
  banner.

### The charts you asked for

US-17.1 AC3 already required one chart; you asked for graphs throughout, so the
owner-facing screens now carry three kinds, all hand-written SVG and CSS:

- **S-16, income against expenses over twelve months** — grouped columns, one pair per
  month, with a hover that names the month and both figures in words.
- **S-18 and S-20, ranked bars** — revenue per trainer and profit per product, one hue,
  longest first, each bar labelled with its exact amount.
- **Every breakdown table** carries a magnitude bar under the name, so the shape of the
  split is visible without reading down the column.

Three things shaped how they were built. The application's Content-Security-Policy allows
no script from anywhere but itself, so no charting library could be loaded from a CDN;
hand-written SVG avoids both that and a new dependency. The two series colours were checked
with a colour-vision simulator before being used, and every chart also carries a legend and
direct labels, so nothing is identified by colour alone. All figures are formatted through
`lib/format.ts`, the same way the tables beside them are.

## Verification

| Check | Result |
|---|---|
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run test` | Pass: 110 tests |
| `npm run test:db` | Pass: 455 assertions in thirteen files (41 new in `0012_finance.test.sql`) |
| `npm run test:e2e` | Pass: 108 checks (8 new) |
| `npm run build` | Pass |

**The "done when" list.**

- **pgTAP E9 to E12:** Grupni €69 → trainer €48.30, gym €20.70. G+T €99 → trainer €49.00,
  gym €50.00. Personalni €120 with a fee of €80 → trainer €40.00, gym €80.00. Personalni
  €100 with a trainer who has no fee → both shares undefined, and no number is invented.
  AS-7 is covered too: €70 against a fee of €80 gives zero with the warning.
- **BR-156 on a fixture month:** Tamara has three paying clients, one group session (two
  members at the same class count once), one personal session, €288.00 of revenue,
  €137.30 to pay out, €150.70 for the gym, €50.00 already paid and €87.30 outstanding.
  Julija's €100.00 counts as revenue, adds nothing to either share total, and the screen
  is told there is one such payment.
- **A manager calling any `fin_` function gets `E_FORBIDDEN`:** `fin_summary`,
  `fin_trainer_stats`, `fin_expenses`, `record_expense` and `backdated_day_passes` are all
  refused, and so is `fin_shifts` for a receptionist, who also reads no row of the
  owner-only finance tables.
- **Back-dated records do not change any shift summary:** the fixture shift keeps its own
  €289.00 of cash and €15.00 of sales after €20.00 of back-dated day passes are added,
  while `fin_summary` rises from €403.00 to €423.00.
- **E2E flow 9:** S-16 shows €388.00 for the fixture month with the breakdown adding up to
  it, and the chart is on the page. S-18 shows Tamara's €288.00 / €137.30 / €150.70 and
  Julija's `nije definisano`, and the detail lists €48.30, €49.00 and €40.00 one by one.
  A fourth check records an expense through the BR-133 form.
- **E2E flow 10:** a manager and a receptionist get 404 on all seven finance routes, and
  not one euro sign appears anywhere on those pages.

## Two bugs found by the tests, and fixed

- **`trainers` names its column `full_name`, not `name`.** Two functions of `0020` read it
  as `name`, which PL/pgSQL only discovers when the function runs. Migration `0021`
  replaces both.
- **Money was crossing to the browser as a JSON number.** `json_build_object` turns a
  numeric into a JSON number, which JavaScript parses into a double the moment the
  response is read — exactly what BR-003 forbids, and the reason S-16 failed outright the
  first time it was opened with real data. Migration `0023` casts every money field of
  every report to text.

## Interpretations — please confirm

- **`fin_monthly` is a new function.** Doc 07 §5 lists nine report functions and none of
  them returns a monthly series, but US-17.1 AC3 asks for a twelve-month chart. Rather
  than build it from twelve calls to `fin_summary`, it is one function of its own. It is
  owner-only like the rest.
- **The by-plan breakdown has two rows that are not plans:** `Zamjenska kartica` for the
  card replacement fees and `Magacin` for the bar sales. Without them the breakdown would
  not add up to the income card.
- **`membership_sale` was dropped and recreated** rather than overloaded, so there is only
  ever one version of the BR-050 to BR-060 logic. Every existing pgTAP test of selling and
  registering still passes unchanged.
- **The S-18 detail is a section below the table**, opened by clicking the trainer's name,
  rather than a dialog: it is a long list of payments and belongs on the page, where it
  can be read alongside the row it explains.
- **S-21 reads `audit_log` directly** through the owner's RLS policy, because doc 07 §5
  lists no function for it, and shows the newest 200 rows of the period with a line saying
  so when there are more. Columns that change on every write (`updated_at`, `search_text`)
  are left out of the comparison, and money and dates in it are formatted as they are
  everywhere else.
- **A back-dated membership computes its start as of the day it was sold**, not as of
  today, so BR-052 gives the same answer it would have given at the desk that day. The
  owner can still override the start date.
- **`backdated_card_fee` records only the money.** The card itself was swapped at the desk
  when it happened, so there is no card to reassign after the fact.

## Notes

- **Syncing the other database:** migrations `0020` to `0023` must be applied with
  `npm run db:push`.
- **Still to come in M-13:** `visit_stats` and S-15, the empty/loading/error states checked
  against doc 06 on every screen, the accessibility pass, the screenshots at 1366×768 and
  375 px, and the production deployment guide.
