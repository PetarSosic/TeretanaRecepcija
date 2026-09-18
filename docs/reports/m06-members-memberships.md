# M-06 Members and memberships (F-06, F-07, F-08, F-09, F-11) — 18.09.2026

Status: complete. All five checks pass, in development and against the production build. M-07 has not started.

## Built

### Migration `0012_members_memberships.sql`

- **Tables** from doc 07 §3: `members` (with the BR-044 folded `search_text` kept by a trigger), `memberships`, `membership_finance`, `payments`, and `visits` (table only). The `cards.member_id` foreign key that M-04 deferred is added. Audit triggers follow doc 07 §3: memberships and payments on insert/update/void, members on update/anonymize.
- **Helpers** from doc 07 §4: `membership_end_date` (BR-051), `membership_used` (BR-055), `membership_covers` (BR-053), `membership_status` (BR-054), `trainer_can` (BR-023), `normalize_phone` (BR-041), and `calc_membership_start` (BR-052, steps 1–3 plus the E5 warning).
- **RPCs** from doc 07 §5: `register_member`, `sell_membership`, `find_duplicates`, `update_member`, `anonymize_member`, `replace_card`. The sale and the registration share one internal `membership_sale`, so BR-050 to BR-060 exist once. Coverage, limits, trainer and the finance terms (including `resolve_group_share`, D-62) are copied at sale. Exactly one payment is created, and the BR-052 unpaid visits are linked.
- **RLS** from doc 07 §6: members, memberships and visits are readable per gym. `membership_finance` is owner/admin only. Payments are all visible to owner/admin; others see today's payments that are not back-dated (P-29).

### Screens

- **S-06** `/members`: search (BR-044, 250 ms debounce), status filter, 25 rows a page, both empty texts, and [Novi član].
- **S-05** registration dialog: card scan field (Save disabled until a valid empty card is confirmed, US-06.1 AC4), member fields (date typed as dd.mm.yyyy or from a picker), inline duplicate warning with [Otvori postojećeg] and [Ipak sačuvaj], the S-08 membership fields, and the success dialog.
- **S-07** `/members/[id]`: card status, the red `Neplaćeni dolasci: N` badge, [Nova članarina] [Izgubljena kartica] [Uredi podatke] and the owner's [Anonimiziraj]. Three tabs:
  - Članarine: status, remaining per limited type, [Produži].
  - Uplate: "Unio/la", voided rows struck through.
  - Dolasci: 20 a page, with the Neplaćeno badge.
- **S-08** sell dialog: plan, trainer filtered by BR-023 with the BR-058 default, sessions, amount (owner pencil), start and "Važi do" with the reason (owner pencil), the two method buttons, and the summary line. The start and end come from the same SQL the sale runs, so the preview cannot disagree with what is saved.
- **S-09** lost card: fee and method, [Nastavi], then scan. A valid scan saves at once, and a non-empty card shows its BR-070 message while the dialog stays open.
- Every money button is a `MoneyButton` (BR-092).

## Verification

| Check | Result |
|---|---|
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run test` | Pass: 77 tests (13 new: scan parsing, date input, member and sale schemas) |
| `npm run test:db` | Pass: 167 assertions in seven files (78 new in `0006_members.test.sql`) |
| `npm run test:e2e` | Pass: 68 checks (12 new), in development twice and against `next start` |
| `npm run build` | Pass |

**The "done when" list.**

- **pgTAP:** E1, E2, E4, E13 and E14 pass. BR-052 is proven with fixture unpaid visits:
  - E3: 15.09–15.10, both gym visits linked, the group visit not (D-17).
  - E5: starts 15.09 and ends 22.09, the 02.09 visit stays unpaid, and the warning text is returned.
  - AS-8 and step 3 are covered as well.
- **pgTAP, other rules:** BR-092, the three BR-070 card errors, BR-041 normalization, BR-042 numbering, BR-043, BR-044 ("cosic" finds "Ćosić"), BR-058 (fee copied, trainer required and assigned), BR-059 (E_AMOUNT_LOCKED for a receptionist, owner price change allowed), BR-052 step 4 (owner only), BR-060, BR-034, BR-046, the audit rows, and the doc 04 §2 rejections for receptionist and manager.
- **Browser (desktop and 375 px):**
  - A receptionist registers a member by scanning an empty card; an invalid code is rejected first.
  - Personalni at €75 is refused with `Iznos ne može biti manji od 80,00 €.`, then sold at €120.
  - [Produži] on Mjesečna starts the day after its last day and shows the BR-052 reason.
  - A lost card is replaced for €5; the old card is `izgubljena` and a non-empty card is refused.
  - The owner anonymizes; a receptionist is not offered it.
  - No page scrolls sideways at 375 px.

## Changes outside M-06, and why

1. **Security: `resolve_group_share` was callable by every signed-in user** (0008 revoked it only from `anon`). A receptionist could read any trainer's share percentage, which doc 04 §2 forbids. `0012` revokes it from `authenticated`, since the sale now reads it with definer rights. The M-03 test called it as a signed-in owner, so those three assertions now read it as the database owner. A new assertion proves a receptionist is refused.
2. **The header overflowed at 375 px** once the receptionist's name is long ("Aleksandra Radulović"). The M-05 test only used "E2E Ana". The badge and the name now truncate (`min-w-0`).
3. **`TableWrapper` is now `relative`.** A visually hidden `sr-only` column header escaped the scroll container and widened the page to 623 px at 375 px. This also affected S-28 from M-04.

## Interpretations — please confirm

- **"Prijavi odmah" is not shown yet.** Check-in is M-07, and doc 09 says "visits (table only)". `register_member` keeps the `p_check_in` parameter from doc 07 but refuses `true` until M-07 replaces it, so the flag is never silently ignored. Opening S-05 from a scan on S-03, and [Ručna prijava]/[Ručna odjava] on S-07, also arrive with M-07.
- **Linked visits are capped at the session limit.** BR-052 step 2 says "all those visits ≤ E are linked". With 15 unpaid visits and a 12-session plan, linking all 15 would break BR-053 and show negative remaining sessions. The sale links the oldest ones up to the limit; the rest stay unpaid.
- **The owner's own start date (BR-052 step 4).** The stored reason is `Početak je odredio vlasnik.`, which is new UI copy the spec doesn't give. Unpaid visits of covered types inside the chosen period, up to today, are linked.
- **S-05 success text:** US-06.1 AC3 and S-05 word it differently. Doc 06 outranks doc 05, so it reads `Član #<broj> je kreiran. Upišite ime olovkom na karticu: <Ime Prezime>.`
- **S-06 "Status" column:** the member's best BR-054 status today, with its date, for example `Aktivna do 15.10.2026`, `Buduća od …`, `Istekla …`, or `—` with no memberships.
- **"Unio/la" on S-07:** doc 07 §6 hides colleagues' staff rows from a receptionist, so `staff_names(ids)` returns only the requested names within the caller's gym. It's the same pattern as `open_shift_info` in M-05.
- **Additions not listed in doc 07:**
  - Read functions: `member_search`, `member_memberships`, `check_unassigned_card`, `staff_names`.
  - Internal functions nobody can call directly: `unassigned_card`, `clean_member`, `membership_sale`, `require_open_shift`.
  - Two indexes: `visits (member_id, checked_in_at desc)` and `payments (member_id)`.

## Decisions taken after review

Mihajlo delegated the three open questions on 18.09.2026:

1. **Anonymization scrubs the audit log** (migration `0013_anonymize_audit_scrub.sql`). Doc 02 defines anonymization as irreversibly removing personal data while keeping history. `anonymize_member` now replaces the name, phone, email and date of birth in every `members` audit row of that member, including the anonymize row itself. The rows stay, so who changed what and when is kept. Two new pgTAP assertions prove both halves.
2. **Linked visits are capped at the session limit**, as described above, so BR-053 and BR-055 never show negative remaining sessions.
3. **`Početak je odredio vlasnik.`** stays as the reason text for an owner-chosen start.

## Notes

- **Syncing the other database:** migrations `0012` and `0013` must be applied to the other developer's Supabase project with `npm run db:push` after pulling.
- **Flaky test:** one existing M-02 test (first-login password change) timed out once during the full production-mode run while waiting for Supabase. It passed 20 of 20 on the rerun, and nothing in auth changed.
- **Card-field race, fixed:** two quick scans could be answered out of order, so a slow "invalid" reply overwrote a later "ready". The card field now keeps only the answer to the latest scan.
