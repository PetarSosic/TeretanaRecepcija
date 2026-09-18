# 03 — Business Rules

Every rule has an ID. Code comments and tests must reference these IDs, e.g. `// BR-052`.

## 1. Time and money
- **BR-001:** All dates, day boundaries, schedule times and job times use the gym timezone **`Europe/Podgorica`**. "Today" is always `gym_today(gym_id)`, never the server date.
- **BR-002:** Display formats:
  - date `dd.mm.yyyy`;
  - time `HH:mm` (24 h);
  - date-time `dd.mm.yyyy HH:mm`;
  - duration `Xh Ymin`.
- **BR-003:** Money:
  - currency EUR, stored as `numeric(10,2)`, never floats;
  - displayed as `1.234,50 €`;
  - input accepts `,` or `.` as the decimal separator;
  - calculations round to 2 decimals, half-up.
- **BR-004:** Every price is editable by the owner. This covers plan prices, the day pass, the card replacement fee, the personal minimum price, trainer fees, share percentages, and product purchase and sale prices. A price change affects **only new records**; existing records keep their amounts.

## 2. Plans (seed data)
- **BR-010:** The seed creates exactly these plans. The owner can later edit them, add new ones or deactivate them.

| Name (UI) | Kind | Duration | Price | Covers | Limits | Gym fixed amount | Trainer share % | Trainer required |
|---|---|---|---|---|---|---|---|---|
| Nedeljna | gym | 7 days | €39 | gym | — | — | — | no |
| Dvonedeljna | gym | 14 days | €49 | gym | — | — | — | no |
| Mjesečna | gym | 1 month | €79 | gym | — | — | — | no |
| Mjesečna 12 termina | gym | 1 month | €59 | gym | gym 12 | — | — | no |
| Studentska mjesečna | gym | 1 month | €49 | gym | gym 15 | — | — | no |
| Tromjesečna | gym | 3 months | €200 | gym | — | — | — | no |
| Šestomjesečna | gym | 6 months | €400 | gym | — | — | — | no |
| Godišnja | gym | 12 months | €790 | gym | — | — | — | no |
| Grupni (3x nedeljno) | group | 1 month | €69 | group | group 12 | €0 | 70 | yes |
| G+T (Grupni + Teretana) | combo | 1 month | €99 | gym + group | group 12 | €50 | 100 | yes |
| Personalni | personal | 1 month | entered at sale (≥ personal minimum) | personal | personal: entered at sale (1–50) | trainer fee | — | yes |
| Dnevna karta | day_pass | — | €10 per person | — | — | — | — | no |

- **BR-011:** "3x nedeljno" in the Grupni name is a label only. There is **no weekly limit**, only the 12-session limit.
- **BR-012:** Other seeded settings:
  - card replacement fee **€5**;
  - personal minimum price **€80**;
  - expiry reminder **3 days**;
  - automatic close time **23:00**;
  - double-scan guard **120 s**;
  - shift report recipients **`mihajlo@stamenkovicc.com`**.

> OPEN QUESTION (OQ-2): Should the personal minimum price differ per trainer? It is not decided yet (the trainers set their own prices). **Temporary behaviour:** one gym-wide minimum (default €80), editable by the owner.

## 3. Trainers, programs and schedule
- **BR-020 (seed trainers):**

| Trainer | Personal gym fee | Group share % |
|---|---|---|
| Milena | none | plan default |
| Julija | **unknown** (OQ-1) | plan default |
| Tamara | €80 per client | plan default |
| Tatjana | €80 per client | plan default |

  D-62: a trainer may carry their own group share percentage. Empty means the plan's percentage applies, which is how all four trainers are seeded. Only the owner and the admin see or set it (BR-026).

> OPEN QUESTION (OQ-1): Julija's personal-training arrangement is unknown. **Temporary behaviour:** her fee is empty (`null`). Personal sales with Julija are allowed. Her trainer share and gym share are shown as **"nije definisano"** and are excluded from share totals (but included in revenue).

- **BR-021 (seed programs and assignments):**

| Program | Kind | Trainers assigned |
|---|---|---|
| Grupni trening | group | Milena, Julija, Tamara |
| Personalni trening | personal | Julija, Tamara, Tatjana |

- **BR-022 (seed class slots)**, all in program "Grupni trening":

| Trainer | Days | Start times |
|---|---|---|
| Milena | Tuesday, Thursday, Saturday | 08:00 and 18:00 |
| Julija | Monday, Wednesday, Friday | 08:30 |
| Tamara | Monday, Wednesday, Friday | 19:00 |

- **BR-023:** A trainer is selectable:
  - for a **group** membership or group visit only if they are assigned to at least one active program of kind `group`;
  - for a **personal** membership or personal visit only if they are assigned to at least one active program of kind `personal`.
- **BR-024:** A class slot's trainer must be assigned to that slot's program.
- **BR-025:** Deactivating a trainer, program or class slot:
  - hides it from new selections;
  - does not change existing memberships, visits or reports;
  - removing an assignment has the same effect.
- **BR-026:** Owners and managers manage trainers, programs, assignments and slots. Only the owner sees and edits trainer fees and share percentages.

## 4. Member cards
- **BR-030 (code):**
  - exactly 10 digits, first digit 1–9;
  - generated randomly and unique across all gyms;
  - the QR code encodes only these 10 digits (digits are safe with any keyboard layout, including QWERTZ).
- **BR-031 (states):**
  - `unassigned` → `active` (assigned to a member) → `deactivated`;
  - no other transitions; a deactivated card is never reactivated.
- **BR-032:** A member has at most one active card.
- **BR-033:** Registering a member **requires** scanning an unassigned card. A member cannot be created without a card.
- **BR-034 (lost card), in one transaction:**
  1. Record a `card_replacement` payment at the current fee, with the chosen method.
  2. Deactivate the old card with reason "izgubljena".
  3. Assign the newly scanned unassigned card.

  It requires an open shift (BR-092). Voiding the fee payment later does not reactivate the old card.
- **BR-035:** A returning former member keeps their member number and active card. If they no longer have the card, BR-034 applies.
- **BR-036 (printing):** owners and managers generate batches of 1–100 unassigned cards and download a print PDF. The layout is in doc 06 (S-28).

## 5. Members
- **BR-040 (required fields):**

| Field | Rule |
|---|---|
| First name | 1–50 characters, trimmed |
| Last name | 1–50 characters, trimmed |
| Phone | Normalized as in BR-041 |
| Email | Valid format, stored lowercase, maximum 254 characters |
| Date of birth | From 01.01.1900 to gym today |

> ASSUMPTION (AS-2): The allowed date-of-birth range is 01.01.1900 to gym today; there is no minimum age.

- **BR-041 (phone):**
  - Remove spaces, dashes, slashes and parentheses.
  - Leading `00` → `+`.
  - Leading single `0` → `+382` + the rest.
  - The result must match `^\+[0-9]{8,15}$`.
  - Example: `067 123 456` → `+38267123456`.

> ASSUMPTION (AS-1): Numbers without a country code are Montenegrin (+382).

- **BR-042 (member number):** assigned at creation as the gym's next sequential number, starting at **1**; never reused.
- **BR-043 (duplicates):** if another non-anonymized member has the same normalized phone or the same email, show a warning. The warning offers "Otvori postojećeg" (open the existing member) and "Ipak sačuvaj" (save anyway). The save is not blocked.

> ASSUMPTION (AS-3): Duplicates only produce a warning, never a block.

- **BR-044 (search):** matches member number (exact), first or last name (partial, case- and diacritic-insensitive, e.g. "cosic" finds "Ćosić"), and phone digits (partial). Anonymized members are excluded.
- **BR-045:** Staff of every role can edit a member's first name, last name, phone, email and date of birth. Every edit is written to the audit log.
- **BR-046 (anonymization, owner only, irreversible):**
  - first name becomes `Anonimizirani`;
  - last name becomes `član #<member_number>`;
  - phone, email and date of birth are set to `null`;
  - the active card is deactivated with reason "anonimizirano";
  - `is_anonymized = true`;
  - memberships, payments and visits are kept;
  - the member is excluded from search and from emails.

## 6. Memberships
- **BR-050 (coverage):**

| Plan kind | Visit types covered |
|---|---|
| `gym` | gym |
| `group` | group |
| `combo` (G+T) | gym and group |
| `personal` | personal |

  Coverage, limits, trainer, gym fixed amount, share percentage and trainer fee are **copied onto the membership at sale**. Later plan or trainer edits never change existing memberships.

  The share percentage copied for a `group` or `combo` sale is the **trainer's own group share if they have one, otherwise the plan's** (D-62). `resolve_group_share(trainer, plan)` answers that question in one place, so the rule cannot drift between the sale and the reports.
- **BR-051 (last valid day, inclusive):**
  - Month plans: `end_date = start_date + N calendar months` (Postgres interval arithmetic).
    - 12.01 → 12.02.
    - 31.01.2027 → 28.02.2027.
  - Day plans: `end_date = start_date + N days`. Nedeljna 13.09 → 20.09.
  - The membership can be used on every date from `start_date` to `end_date`, both included.
- **BR-052 (start date).** Let D = sale date (gym today; for back-dated sales, the owner's chosen date). "Comparable memberships" are the member's non-voided memberships whose coverage shares at least one visit type with the new plan. Let L = the latest `end_date` among them (none if there are no comparable memberships).
  1. **If L ≥ D:** start = L + 1 day. Reason: `Nastavlja se na članarinu koja važi do <L>`.
  2. **Otherwise**, take the member's unlinked unpaid visits whose visit type is covered by the new plan and whose local date is after L (or any date, if there is no L) and ≤ D.
     - If there are any, let V = the earliest visit date and compute E = end date for start V.
     - **If E ≥ D:** start = V, and all those visits dated ≤ E are linked to the new membership and use up its sessions. Reason: `Počinje od prvog neplaćenog dolaska <V>`.
     - **If E < D:** the visits stay unlinked, and processing continues with step 3. The screen warns: `Neplaćeni dolasci su stariji od trajanja ove članarine i ostaju neplaćeni.`
  3. **Otherwise:** start = D. Reason: `Počinje danas`.
  4. **Owner override:** only the owner can override the computed start date. A back-dated sale by the owner uses the owner's chosen date, and steps 1–3 are shown as a suggestion only.

> ASSUMPTION (AS-8): When there is no comparable membership, all unlinked unpaid visits of covered types qualify.

> ASSUMPTION (AS-9): The "E < D" fallback in step 2.

- **BR-053 (covers a visit):** membership M covers visit type T on date X when all of the following hold:
  - M is not voided;
  - `start_date ≤ X ≤ end_date`;
  - T is in M's coverage;
  - M has no limit for T, or the visits of type T already linked to M are fewer than the limit.
- **BR-054 (display status on date X, default gym today):**

| Status | UI label | Condition |
|---|---|---|
| `voided` | Poništena | M is voided |
| `upcoming` | Buduća | X < start |
| `expired` | Istekla | X > end |
| `active` | Aktivna | M covers at least one type on X |
| `used_up` | Iskorištena | In the date range, but every covered type has reached its limit |

  A G+T membership whose group sessions are used up is still `active` (the gym part is unlimited). The UI shows `Grupni: 0 preostalo`.
- **BR-055 (remaining sessions):** limit − number of visits of that type linked to the membership. **Every visit counts**, including a second visit on the same day. Check-out never uses a session. Unused sessions expire at `end_date` and are never transferred.
- **BR-056:** A membership can never be frozen, paused or extended. Only a new sale adds time.
- **BR-057:** A member may hold any number of memberships at once (e.g. Mjesečna + Personalni). Selling a new membership before the current one ends is allowed; it becomes `upcoming` (BR-052 step 1).

  This is also how a mid-term change of plan is handled (D-61). A member who paid for Grupni and wants Personalni two weeks later simply buys Personalni; because the two plans share no visit type they are not comparable, so the new membership starts today (BR-052 step 3) while the old one runs to its own end date and its unused sessions expire (BR-055). Nothing is prorated, refunded or transferred, and the old membership is not voided.
- **BR-058 (trainer):**
  - Grupni, G+T and Personalni require a trainer who meets BR-023.
  - The trainer's current fee is copied onto a Personalni membership at sale.
  - The trainer suggested by default is the trainer of the member's latest membership of the same plan kind.
- **BR-059 (amount):**
  - For plans with a list price, the amount equals the list price; only the owner can change it (at sale, or later via BR-094).
  - For Personalni, any staff role enters the amount. It must be ≥ the personal minimum price (BR-012), otherwise: `Iznos ne može biti manji od <min> €.`
  - The personal session count is entered at sale: whole number 1–50.
- **BR-060:** Every membership sale creates **exactly one** payment for the full amount in the same transaction. There are no partial payments and no debts.

## 7. Visits (check-in and check-out)
- **BR-070 (scan decision).** The scanner sends characters followed by Enter. The input is trimmed and handled as follows:

| Input | Result |
|---|---|
| Not exactly 10 digits | Message `Neispravan kod kartice.` Nothing is recorded. |
| Unknown code | `Nepoznata kartica.` |
| Deactivated card | `Kartica je poništena. Pronađite člana pretragom.` |
| Unassigned card | Opens registration (S-05) with this card attached. |
| Active card, member has an open visit | Check-out (BR-072). |
| Active card, no open visit | Check-in flow (BR-073 onward). |

- **BR-071:** A member has at most one open visit.
- **BR-072 (check-out):**
  - Set the check-out time to now and show `Odjavljen/a: <Ime Prezime> – <trajanje>`.
  - **Double-scan guard:** if the open visit started less than the configured number of seconds ago (default 120), ask first: `<Ime Prezime> je prijavljen/a prije <N> s. Odjaviti?` [Odjavi] [Ne].
- **BR-073 (visit type):**
  - The options are **Teretana** plus every other type (Grupni, Personalni) covered by any of the member's memberships in the date range today, even if that type's sessions are used up.
  - If Teretana is the only option, the visit is a gym visit and no question is asked.
  - Otherwise, preselect Teretana if a membership covers gym today; else preselect Grupni; else Personalni. Enter confirms the preselection.
- **BR-074 (which membership).**
  - Candidates are memberships that cover the chosen type today (BR-053).
  - If there are candidates, preselect the one with the earliest `end_date` (ties: earliest created). The receptionist may pick another candidate. The visit is linked to it and uses a session if a limit applies.
  - If there are none, the visit is **unpaid** (`is_unpaid = true`, no membership).
- **BR-075 (group visit):**
  - A trainer is required, chosen from BR-023 group trainers.
  - Default trainer: the selected membership's trainer; if unpaid, the trainer of the member's latest group or combo membership; otherwise no default.
  - Default class slot: the active slot of the chosen trainer on today's weekday whose start time is closest to now and within ±90 minutes; otherwise "Bez časa iz rasporeda".
  - The receptionist may pick any of that trainer's slots for today, or "Bez časa iz rasporeda".

> ASSUMPTION (AS-12): The ±90-minute window.

- **BR-076 (personal visit):** a trainer is required, chosen from BR-023 personal trainers. The default is the selected membership's trainer. No class slot.
- **BR-077 (gym visit):** no trainer, no class slot.
- **BR-078 (entry is never blocked):** a visit is always recorded, paid or unpaid. This includes a Grupni-only or Personalni-only member choosing Teretana, which becomes an unpaid gym visit.
- **BR-079 (result on screen):**
  - **Covered visit:** a green dialog showing:
    - name and member number;
    - the covering membership's plan;
    - `Važi do` (valid until);
    - remaining sessions for the visit type (or `Neograničeno`);
    - status.

    A short "ok" sound plays. The dialog closes after 5 s, on Esc, or when the next scan arrives (the next scan is then processed).
  - **Unpaid visit:** let N = the member's number of unlinked unpaid visits, including this one.
    - **N = 1:** yellow dialog `Članarina nije važeća – neplaćeni dolazak.` with the "warning" sound.
    - **N ≥ 2:** full-screen red dialog `PAŽNJA: <N>. neplaćeni dolazak!` with the "alarm" sound.
    - Both dialogs have [Produži članarinu] (opens S-08) and [Zatvori]. Neither closes automatically.

> ASSUMPTION (AS-13): The 5-second auto-close of the green dialog.

- **BR-080 (manual):**
  - Manual check-in: search a member (BR-044), then follow the same flow with `is_manual = true`.
  - Manual check-out: the [Odjavi] button in the "U teretani" list.
- **BR-081:** "U teretani" is the list of open visits. Day-pass and FitPass visitors are never recorded.
- **BR-082 (automatic check-out):**
  - At the automatic close time (default 23:00), every open visit gets `checked_out_at` = that time today and `auto_checkout = true`.
  - Automatic check-outs are excluded from visit-duration statistics.
- **BR-083 (back-dated visit, owner only):**
  - The owner enters member, date, check-in time, check-out time (> check-in), visit type, and trainer/slot when needed.
  - The membership is chosen per BR-074 as of that date.
  - `is_backdated = true`; the visit has no shift.

## 8. Payments, corrections and voids
- **BR-090:** Payment methods are cash (`Gotovina`) and card (`Platna kartica`) only.
- **BR-091:** Payment kinds are `membership`, `day_pass` and `card_replacement`. Bar sales are stock movements, and they count as income too.
- **BR-092 (shift required):**
  - Every money record that is not back-dated must be attached to the gym's open shift, whoever enters it (receptionist, manager or owner). Money records are payments, sales, and paid-from-till expenses, including stock-in paid from the till.
  - If no shift is open, these actions are disabled with: `Nema otvorene smjene. Recepcioner mora biti prijavljen.`
- **BR-093:** `paid_on` = gym today. Only the owner can enter another date, through a back-dated entry (BR-120).
- **BR-094 (correction):**
  - Any role may change the **method** and **note** of a payment or sale **attached to the currently open shift**.
  - Only the owner may change the **amount**, and only the owner may correct records from closed shifts or back-dated records.

> ASSUMPTION (AS-14): Non-owners may correct and void only records of the currently open shift, so closed shift reports never change behind the owner's back.

- **BR-095 (void):**
  - Permissions are the same as BR-094.
  - A reason of 3–200 characters is required.
  - Voided records are excluded from every total. They are listed separately and struck through.
  - Voiding a **membership** payment also voids the membership. Its linked visits become unlinked unpaid visits (`membership_id = null`, `is_unpaid = true`).
  - Voiding a **sale** returns the quantity to stock.
  - Voiding a **stock-in** (owner only) also voids its automatic expense. It is blocked if it would make stock negative: `Poništavanje nije moguće – stanje bi bilo negativno.`

> ASSUMPTION (AS-15): Sales and stock-ins can be voided under these rules.

- **BR-096:** Every correction, void, price change, settings change and member edit writes an audit-log row with the old and new values, who made it and when.

## 9. Day passes
- **BR-100:** Day pass sale:
  - quantity 1–20;
  - unit price = the current day-pass plan price (not editable at sale);
  - amount = quantity × price;
  - method required;
  - no member, no visit;
  - requires an open shift.

## 10. Shifts
- **BR-110:** Only the **receptionist** role has shifts. At most **one open shift per gym**.
- **BR-111 (receptionist login):**
  - **No open shift:** a new shift is opened automatically.
  - **Open shift is theirs:** it is resumed.
  - **Open shift belongs to someone else:** show S-02 with `Otvorena je smjena: <ime> (od <HH:mm>).` and two options:
    - [Preuzmi smjenu]: an optional "Prebrojana gotovina za prethodnu smjenu" field, then the other shift is closed with `close_type = 'takeover'` and `closed_by` = the current user, its report is generated and emailed (BR-117), and a new shift is opened;
    - [Odjavi se].

> ASSUMPTION (AS-10): The counted cash at takeover is optional.

- **BR-112:** An owner or manager login never opens or closes shifts by itself. Their money actions attach to the open shift (BR-092).
- **BR-113 (logout without closing):** a receptionist may log out without closing, after confirming `Smjena ostaje otvorena. Odjaviti se?`. The shift stays open and can be resumed or taken over.

> ASSUMPTION (AS-16): Logging out without closing the shift is allowed.

- **BR-114 (close shift):** the shift's receptionist closes it on S-14:
  1. Review the summary.
  2. Enter the counted cash (required, ≥ 0).
  3. Confirm. The shift is closed with `close_type = 'manual'`.
  4. The report PDF is generated and stored, and the email is sent (BR-117).
  5. The user is logged out.

  The owner may also close any open shift from S-19 (counted cash optional).
- **BR-115 (expected cash and totals):** over non-voided records attached to the shift:
  - `cash_income` = cash payments + cash sales;
  - `card_income` = card payments + card sales;
  - `till_expenses` = expenses with `paid_from_till = true`;
  - `expected_cash` = `cash_income − till_expenses`;
  - `difference` = `counted_cash − expected_cash`. Negative is shown as "Manjak", positive as "Višak". Not shown when the cash was not counted.
  - Managers may read the currently open shift's `cash_income`, `card_income`, `till_expenses` and `expected_cash` (D-54). This grants aggregate totals only; expense details still follow BR-134, and closed-shift reports remain owner-only.
- **BR-116 (automatic close):**
  - At the automatic close time (default 23:00), after BR-082, the open shift is closed with `close_type = 'auto'` and no counted cash.
  - The report states: `Automatski zaključeno u 23:00 – gotovina nije prebrojana.`
  - The receptionist's next request redirects to the login page.
- **BR-117 (shift report).** The PDF contains:
  - **Header:**
    - gym name;
    - receptionist;
    - start and end date-time;
    - close type (Zaključio/la recepcioner, Preuzeo/la <ime>, Automatski);
    - generated-at time.
  - **Payments table:** time, member (number and name) or "—", kind, plan, method, amount, entered by.
  - **Day passes:** quantity and total per method.
  - **Card replacements:** count and total.
  - **Bar sales:** product, quantity, method, amount.
  - **Till expenses:** time, category, description, amount, entered by.
  - **Totals:** cash income, card income, till expenses, expected cash, counted cash, difference.
  - **Voided records:** listed with their reasons.
  - **Open visits** at close time: count.

  Email:
  - recipients: gym setting `shift_report_emails`;
  - subject: `Izvještaj smjene – <ime> – <dd.mm.yyyy> <HH:mm>–<HH:mm>`;
  - short text body, with the PDF attached.
- **BR-118 (email failure):**
  - The shift stays closed and `email_status = 'failed'`.
  - The system retries every 15 minutes, up to 5 attempts in total.
  - The owner sees the status on S-19 and can press [Pošalji ponovo].
- **BR-119:** No idle timeout. Sessions end only on logout, shift close, or an automatic close (receptionists).

## 11. Back-dated entries
- **BR-120:** Only the owner can create back-dated entries (S-22), used after an internet outage:
  - visits (BR-083);
  - membership sales (with start date and payment date);
  - day passes;
  - card replacement payments.

  They have `is_backdated = true` and no shift. They:
  - are excluded from shift reports and expected cash;
  - are included in finance and statistics;
  - are recorded in the audit log.

## 12. Expenses
- **BR-130 (seed categories):** Kirija, Plate (`is_salary`), Komunalije, Struja, Voda, Internet/telefon, Održavanje, Potrošni materijal, Marketing, Oprema, Roba za prodaju (`is_system`), Porezi i doprinosi, Bankarske naknade, Ostalo.
- **BR-131 (owner manages categories):**
  - add (name 2–50 characters, unique);
  - rename;
  - deactivate or reactivate;
  - categories are never deleted;
  - `is_system` categories cannot be deactivated;
  - deactivated categories are hidden from new expenses but stay on old ones.
- **BR-132 (desk expense, any role):**
  - category: active and not a salary category;
  - description: 2–200 characters;
  - amount: 0.01–10,000.00;
  - date: gym today;
  - method: cash, with `paid_from_till = true`;
  - attached to the open shift.
- **BR-133 (owner expense form):**

| Field | Rule |
|---|---|
| Date | ≤ gym today |
| Category | Any active category |
| Description | 2–200 characters |
| Amount | 0.01–100,000.00 |
| Method | Cash / Platna kartica / Van kase |
| Paid from till | Checkbox. If ticked: date forced to today, method cash, open shift required. |
| Supplier | Optional, ≤ 100 characters |
| Invoice number | Optional, ≤ 50 characters |
| VAT included | Optional: Da / Ne / not set |
| Trainer | Only for a salary category, optional. Marks the expense as a payout to that trainer. |

- **BR-134:** Managers and receptionists see only the expenses **they** created **today**. The owner sees all.
- **BR-135:** An expense void requires a reason. The owner can void any expense; others only their own records of the open shift (AS-14).

## 13. Magacin (bar storage)
- **BR-140 (products):**
  - managed by the owner only;
  - name 2–50 characters, unique;
  - sale price > 0;
  - current purchase price ≥ 0;
  - active flag.
  - Seed: **Voda**, purchase €0.30, sale €1.50.
- **BR-141 (stock-in, any role).** Inputs:
  - product (active);
  - quantity 1–10,000;
  - purchase price per unit (prefilled with the current price, editable, ≥ €0.01, "as written on the invoice"); free deliveries are not allowed (D-55);
  - payment: **Iz kase** (from the till) or **Van kase** (outside the till), required.

  In one transaction:
  1. Stock increases.
  2. The product's current purchase price becomes the entered price.
  3. An expense is created automatically:
     - category "Roba za prodaju";
     - description `Nabavka: <proizvod> × <količina>`;
     - amount = quantity × price;
     - method cash with `paid_from_till = true` if Iz kase, otherwise method "Van kase" (`null`) with `paid_from_till = false`.

  "Iz kase" requires an open shift.

> ASSUMPTION (AS-6): The entered purchase price becomes the product's current purchase price and is used as the cost of later sales.

> ASSUMPTION (AS-17): "Van kase" is stored as `method = null`.

- **BR-142 (sale, any role):**
  - product (active), quantity ≥ 1, method required;
  - unit price = the product's sale price (not editable at sale);
  - unit cost = the current purchase price (snapshot);
  - blocked if quantity > stock: `Nema dovoljno na stanju (stanje: <X>).`;
  - requires an open shift.
- **BR-143:** Stock level = Σ stock-in − Σ sales (non-voided). There is no opening stock; the first stock-in creates it.
- **BR-144:** Managers and receptionists see product, stock level, purchase price and sale price. They never see stock value, profit, or totals over more than today.

## 14. Finance calculations (owner only)
- **BR-150:** Income for a period = non-voided payments by `paid_on` + non-voided sales by local date.
- **BR-151:** Expenses for a period = non-voided expenses by `spent_on`. This includes automatic stock-in expenses and trainer payouts.
- **BR-152:** Profit = income − expenses. Bar purchase costs are counted **once**, through the stock-in expenses.
- **BR-153:** Bar profit (informational, shown separately) = Σ sales quantity × (unit price − unit cost).
- **BR-154 (trainer revenue):** a membership payment belongs to the **membership's** trainer and to the month of `paid_on`. A group visit with another trainer changes only that other trainer's session count.
- **BR-155 (shares per membership payment):**
  - **Grupni and G+T:** trainer share = max(amount − gym fixed amount, 0) × share % / 100, where the share % is the one stored on the membership at sale (BR-050, D-62) — never the plan's current value.
  - **Personalni:**
    - trainer fee `null` → trainer share and gym share are "nije definisano";
    - otherwise trainer share = amount − trainer fee;
    - if the result is negative → 0, with the warning `Iznos manji od naknade teretani`.
  - **Gym share** = amount − trainer share.

> ASSUMPTION (AS-7): A negative trainer share becomes 0 with a warning.

- **BR-156 (trainer statistics for a month, per trainer):**

| Metric | Definition |
|---|---|
| Klijenti | Distinct members with a non-voided membership payment attributed to the trainer in that month |
| Održani grupni treninzi | Distinct (local date, class slot) pairs among group visits with that trainer. Visits without a slot count as one pair per date. |
| Personalni treninzi | Number of personal visits with that trainer |
| Prihod | Sum of attributed payments |
| Za trenera (za isplatu) | Sum of defined trainer shares |
| Za teretanu | Sum of defined gym shares |
| Isplaćeno | Sum of non-voided salary-category expenses with this trainer in that month |
| Razlika | Za isplatu − Isplaćeno |

- **BR-157:** No value from §14 is ever returned to managers or receptionists.

## 15. Notifications and jobs
- **BR-160 (expiry reminder email):**
  - **When:** daily at 09:00 gym time.
  - **Who:** for each non-voided membership whose `end_date = gym today + expiry_reminder_days` (default 3).
  - **Only if all of these hold:**
    - the member is not anonymized;
    - the member has no comparable membership starting after it;
    - no reminder was sent for that membership before.
  - Date-based only; nothing is sent when sessions run out.
  - Content is in doc 08 §7.

- **BR-161 (sender address):** all emails are sent from **`noreply@stamenkovicc.com`** (D-F8). The address comes from the environment variable `EMAIL_FROM`, so it can later be switched to the gym's own domain without code changes. The domain `stamenkovicc.com` must be verified in Resend before go-live. If `EMAIL_FROM` is not set (local development), all emails are skipped and logged; a skipped shift report keeps `email_status = 'not_sent'`.

- **BR-162 (jobs):**

| Job | Schedule (gym time) | Steps |
|---|---|---|
| Nightly | Daily at the automatic close time (default 23:00) | 1. BR-082 automatic check-out. 2. BR-116 automatic shift close. 3. Report and email (BR-117). |
| Morning | Daily at 09:00 | BR-160 reminders |
| Retry | Every 15 minutes | BR-118 failed shift emails |
| Weekly backup | Every Sunday at 03:00 | BR-163 |

  Every job is idempotent: running it twice on the same day changes nothing.

> ASSUMPTION (AS-21): The weekly backup runs on Sunday at 03:00 gym time, when the gym is closed.

- **BR-163 (weekly backup, D-F9):**
  - **Content:** every table of the gym's data (all tables in doc 07 §3, including `audit_log`, excluding Supabase Auth internals), exported as one CSV file per table. The CSVs are UTF-8 with a header row, dates as ISO `yyyy-mm-dd`, timestamps in ISO 8601 UTC. A `manifest.json` lists the tables, row counts, the schema migration version and the export time.
  - **Packaging:** all files go into one ZIP named `kpfitness-backup-<yyyy-mm-dd>.zip`, **encrypted with AES-256** using the password in the environment variable `BACKUP_ZIP_PASSWORD`.
  - **Storage:** the ZIP is uploaded to the private Storage bucket `backups`. Only the **8 most recent** backups are kept; older ones are deleted after a successful upload.
  - **Email:** sent to the gym setting `backup_emails` (default **`mihajlo@stamenkovicc.com`**), subject `Sedmična rezervna kopija – KP Fitness – <dd.mm.yyyy>`.
    - ZIP ≤ 35 MB: attached.
    - ZIP > 35 MB: not attached; the body says `Kopija je prevelika za email i sačuvana je u Supabase Storage (backups/<ime fajla>).`
  - **Failure:** the run is recorded as failed and retried on the next job runs, up to 3 attempts that day. The owner sees the last backup's date and status on S-27.
  - **Restore:** manual, by the developer, following the restore steps in the production guide (M-13).

> ASSUMPTION (AS-22): The backup ZIP is password-encrypted, because it contains members' personal data and travels by email.

> ASSUMPTION (AS-23): 8 backups are kept, and the 35 MB attachment limit applies (Resend allows 40 MB per email).

## 16. Worked examples (each must be an automated test)
| # | Situation | Expected result |
|---|---|---|
| E1 | Mjesečna starting 12.01.2027 | Last valid day 12.02.2027; a visit on 12.02 is covered |
| E2 | Mjesečna valid until 12.02; renewal paid on 12.02 | New membership 13.02–13.03 (BR-052 step 1) |
| E3 | Mjesečna valid until 14.09; unpaid gym visits on 15.09 and 16.09; Mjesečna paid on 18.09 | 15.09 dialog is yellow (N = 1); 16.09 is red (N = 2); new membership 15.09–15.10; both visits linked |
| E4 | Nedeljna starting 13.09 | Last valid day 20.09 |
| E5 | Nedeljna valid until 01.09; unpaid visit 02.09; Nedeljna paid on 15.09 | Step 2 gives 02.09–09.09 < 15.09 → new membership 15.09–22.09; the 02.09 visit stays unpaid; warning shown |
| E6 | Mjesečna 12 termina; two gym visits on the same day | Remaining sessions drop by 2 |
| E7 | G+T with all 12 group sessions used; member picks Grupni | Unpaid group visit, status still Aktivna; picking Teretana is covered |
| E8 | Grupni-only member picks Teretana | Unpaid gym visit, yellow dialog |
| E9 | Grupni €69 | Trainer €48.30, gym €20.70 |
| E10 | G+T €99 | Trainer €49.00, gym €50.00 |
| E11 | Personalni €120 with Tamara (fee €80) | Trainer €40.00, gym €80.00 |
| E12 | Personalni €100 with Julija (fee null) | Shares "nije definisano"; revenue €100 counted |
| E13 | Personalni €75 | Rejected: minimum €80 |
| E14 | Mjesečna starting 31.01.2027 | Last valid day 28.02.2027 |
| E15 | Shift: cash payments €237.00, cash bar sales €4.50, till expenses €13.50, counted €225.00 | Expected €228.00, difference −€3.00 (Manjak) |
| E16 | Membership payment voided after 3 linked visits | Membership voided; the 3 visits become unlinked unpaid |
| E17 | Receptionist sale of 5 Voda with stock 3 | Blocked with the stock message |
| E18 | Stock-in 24 × €0.35 "Iz kase" | Stock +24; purchase price €0.35; expense €8.40 paid from till; expected cash −€8.40 |
| E19 | Receptionist B logs in while A's shift is open and takes over | A's shift closed as takeover; report emailed; B's shift opened |
| E20 | Nightly job with 2 open visits and 1 open shift | Visits auto-checked-out at 23:00; shift closed as auto; job run again changes nothing |
