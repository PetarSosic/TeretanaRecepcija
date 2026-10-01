# 06 — Screens and Flows

Routes are in English; every visible text is in Montenegrin (ijekavica). Text in `code` below is exact UI copy.

## 1. Global layout and patterns
- **Header:**
  - the KP mark and the gym name (D-73);
  - navigation (role-based, §2), every item on one line. The header spans the whole window, so the owner's full menu, the shift badge and the user menu fit side by side from 1280 px; narrower screens show the menu button (`Otvori meni`) instead;
  - shift badge `Smjena: <ime> od <HH:mm>`, or `Nema otvorene smjene` in grey;
  - user menu with Promijeni lozinku and Odjava.
- **Loading:** show skeleton placeholders if data takes > 300 ms. Buttons show a spinner and are disabled while saving.
- **Errors:**
  - validation errors appear under the field;
  - server rule errors appear as a red toast with the coded message from doc 08 §5;
  - unexpected errors show `Došlo je do greške. Pokušajte ponovo.` and are logged.
- **Empty lists:** grey text inside the list area (the exact text is given per screen).
- **Offline:** banner F-27 above everything.
- **Dialogs:** Esc closes them unless stated otherwise. Enter triggers the primary button.
- **Money buttons:** disabled when no shift is open (BR-092), with a tooltip showing the BR-092 message.
- **Formats:** BR-002 and BR-003 everywhere.

## 2. Navigation by role
| Item | Route | Owner | Manager | Receptionist |
|---|---|---|---|---|
| Recepcija | `/reception` | ✓ | ✓ | ✓ (home) |
| Članovi | `/members` | ✓ | ✓ | ✓ |
| Treneri | `/trainers` | ✓ | ✓ | ✓ (D-72) |
| Uplate danas | `/payments/today` | ✓ | ✓ | ✓ |
| Magacin | `/storage` | ✓ (adds and edits products, D-76) | ✓ (adds and edits products, D-76) | ✓ |
| Zaključi smjenu | `/shift/close` | ✗ | ✗ | ✓ |
| Statistika dolazaka | `/stats/visits` | ✓ | ✓ | ✗ |
| Finansije | `/finance/*` | ✓ | ✓ (Pregled, Troškovi, Smjene; D-80) | ✗ |
| Podešavanja | `/settings/*` | ✓ (all) | ✓ (Korisnici, Treneri i raspored; D-81) | ✗ |

The Podešavanja item for S-24 is labelled `Treneri i raspored`, the screen's title, so it is not confused with the top-level `Treneri` (S-29, D-72). Podešavanja has no `Proizvodi` item any more: products are added and edited on Magacin (D-76).

An `admin` sees everything an owner sees (D-58).

**Home after login:** receptionist → `/reception`, manager → `/reception`, owner and admin → `/finance`.

---

## S-01 Login — `/login`
- **Fields:** `Korisničko ime ili email`, `Lozinka`.
- **Show password (D-82):** every password field on every screen has an eye button at its right edge, labelled `Prikaži lozinku`, which shows the typed text and becomes `Sakrij lozinku`.
- **Buttons:** [Prijavi se], and a link `Zaboravljena lozinka?`.
- **Errors:** as in US-01.1 and US-01.2. A locked login or address shows `Previše neuspješnih pokušaja prijave. Pokušajte ponovo za <N> min.` (US-01.1 AC6, AC7, D-75).
- **After login:** a receptionist goes through the shift logic (BR-111), which leads to S-02 or `/reception`.
- **Info messages:** `?closed=1` shows `Smjena je zaključena.`; `?auto=1` shows `Smjena je automatski zaključena.`

### S-01b First-login password change — `/change-password`
- **Fields:** `Nova lozinka`, `Ponovi lozinku` (≥ 8 characters, must match), each with the D-82 eye button.
- **Button:** [Sačuvaj].
- **Access:** blocks every other route until the password is saved.
- **Opened by:** the first login with a temporary password (`Prijavili ste se privremenom lozinkom. Postavite novu lozinku da nastavite.`) or the password-reset link, as `/change-password?reset=1` (`Otvorili ste link za novu lozinku. Postavite novu lozinku da nastavite.`, D-69).

## S-02 Shift gate — `/shift/gate` (receptionist)
- **Text:** `Otvorena je smjena: <ime> (od <dd.mm.yyyy HH:mm>).`
- **Field:** optional `Prebrojana gotovina za prethodnu smjenu (€)`.
- **Buttons:** [Preuzmi smjenu] (primary) and [Odjavi se].
- **Error:** if the shift was closed in the meantime, a new shift is opened and the user continues to `/reception`.

## S-03 Reception — `/reception`
**Layout (1366×768, no horizontal scroll):**
- **Left, 2/3 of the width:**
  - a large prompt `Skenirajte karticu`;
  - a status area for the last result;
  - a search box `Pretraga člana (ime, telefon, broj)`;
  - buttons [Dnevna karta] [Trošak] [Novi član].
- **Right, 1/3:** the "U teretani" panel, titled `U teretani: <N> · Danas dolazaka: <M>`.

**Audio unlock:** on the first load after login, show an overlay with [Počni rad]. Clicking it unlocks audio. The overlay is not shown again for that browser session.

**Scan capture:**
- A hidden input is focused whenever no other input or dialog has focus.
- Characters followed by Enter are processed by BR-070.
- While a green or result dialog is open, digit keys followed by Enter still go to the scan handler (the dialog closes and the new scan is processed).
- While a form dialog (S-05, S-08, S-10, S-11) is open, scans go only to that dialog's card field, if it has one; otherwise they are ignored.
- When the search box has focus, typed text goes to the search.

**Search results:** a dropdown with up to 8 members (number, name, phone). Choosing one starts the manual check-in flow. It also offers `Otvori profil`.

**"U teretani" panel:**
- rows showing name, #number, type badge, check-in time, and live duration;
- an [Odjavi] button per row;
- a member leaves the list 1 h 30 min after checking in, at the latest (BR-082a);
- the durations tick every minute in the browser; the list itself is reloaded from the server every 5 minutes while the screen is visible, at once when it becomes visible again, and after every check-in, check-out or registration at this desk (D-85);
- empty text: `Trenutno nema nikoga u teretani.`

**Check-in dialogs:**
- **S-03a Visit type** (when BR-073 requires a choice):
  - segmented buttons (Teretana / Grupni / Personalni);
  - for Grupni or Personalni: a trainer select and, for Grupni, a slot select (`Čas: HH:mm` / `Bez časa iz rasporeda`);
  - a membership select when there are 2 or more candidates;
  - buttons [Prijavi] and [Otkaži].
  - The rules BR-073–076 apply.
- **S-03b Green result:** the BR-079 content. It closes automatically after 5 s.
- **S-03c Yellow and S-03d red:** the BR-079 content, with [Produži članarinu] and [Zatvori]. The red dialog is full screen, with a white text size of at least 48 px.
- **S-03e Double-scan confirmation:** the BR-072 text, with [Odjavi] and [Ne].

**Messages for invalid, unknown and deactivated cards:** shown in the status area in red for 5 s, with no dialog.

## S-05 Registration dialog (from S-03 or S-06)
**Sections:**
1. `Kartica`: the card code (read-only when the dialog was opened by a scan; otherwise a scan field showing `Skenirajte praznu karticu`).
2. `Podaci o članu`: Ime, Prezime, Telefon, Email, Datum rođenja. The date is typed as `dd.mm.yyyy`; typing digits alone is enough, as the dots are added automatically. The calendar button opens a calendar in which `Godina` and `Mjesec` are picked from lists, then the day (D-79).
3. `Članarina`: the same fields as S-08, without the member selector.
4. `Prijavi odmah`: a checkbox, on by default.
5. The duplicate warning (BR-043) appears inline when the phone or email field loses focus.

**Buttons:** [Sačuvaj] and [Otkaži].

**After success:**
- a success dialog `Član #<broj> je kreiran. Upišite ime olovkom na karticu: <Ime Prezime>.`;
- if "Prijavi odmah" was checked, the check-in result then follows (S-03b/c/d).

## S-06 Members — `/members`
- **Controls:** a search box (BR-044), a status filter (Svi / Sa aktivnom članarinom / Bez aktivne članarine), and [Novi član].
- **Table columns:** Broj, Ime i prezime, Telefon, Status, Posljednji dolazak. 25 rows per page. Clicking a row opens S-07.
- **Empty text:** `Nema članova koji odgovaraju pretrazi.` When the database is empty: `Još nema članova. Skenirajte praznu karticu na recepciji da dodate prvog.`

## S-07 Member profile — `/members/[id]`
**Header:**
- name and #number;
- card status (Aktivna kartica `<kod>` / Nema aktivne kartice);
- the badge `Neplaćeni dolasci: N` (red, only when N > 0).

**Buttons:** [Nova članarina] [Izgubljena kartica] [Ručna prijava] or [Ručna odjava] (depending on whether a visit is open) [Uredi podatke]. The owner also sees [Anonimiziraj].

**Tabs:**
- `Članarine`: plan, trainer, Od, Važi do, status, and remaining sessions per limited type. [Produži] on each non-voided membership. [Promijeni termin] beside it on each group membership (covers group, has a trainer) that is neither voided nor expired (D-71, BR-058a): a dialog `Promijeni termin` showing the plan, the trainer and `Trenutni termin: <termin>` (or `nije upisan`), the `Fiksni termin` select with that trainer's active times, and [Sačuvaj] [Otkaži]. On success the toast `Termin sačuvan.` Nothing is charged.
- `Uplate`: owners see everything. Others see today's non-back-dated payments. Columns: date, kind, plan, amount, method, entered by, and status (Poništeno).
- `Dolasci`: as in US-07.2.

**Anonymize:** a dialog asking the user to type the member number, followed by [Anonimiziraj trajno].

**Anonymized member:** the profile is read-only with the banner `Član je anonimiziran.`

## S-08 Sell membership dialog
**Fields, in order:**
1. `Vrsta članarine`: a select with the name and price (Personalni shows "iznos po dogovoru").
2. `Trener`: shown if required, filtered by BR-023.
2a. `Fiksni termin` (D-71, BR-058a): for plans that cover group training and require a trainer, shown once a trainer is chosen. A select (`Izaberite termin`) of only that trainer's active class times, e.g. `Uto, čet, sub · 08:00`. If the trainer has none, the select is replaced by `Trener nema nijedan aktivan termin u rasporedu, pa se članarina ne može prodati. Vlasnik ili menadžer dodaje ili aktivira časove u Podešavanja → Treneri i raspored.` and the sale cannot be saved.
3. `Broj termina`: Personalni only, 1–50.
4. `Iznos (€)`:
   - read-only for list-price plans (the owner sees an edit pencil);
   - required for Personalni, with the hint `Minimalno <min> €`.
5. `Početak`: read-only, with the BR-052 reason text underneath (the owner sees an edit pencil). `Važi do`: read-only and calculated.
6. `Način plaćanja`: two large buttons, Gotovina and Platna kartica.
7. A summary line: `<plan> · <Početak>–<Važi do> · <iznos> · <način>`.

**Buttons:** [Naplati i sačuvaj] and [Otkaži].

**Messages:**
- the BR-052 warning text when applicable;
- after success: the toast `Članarina sačuvana.`

## S-09 Lost card dialog
1. The text `Naknada za novu karticu: <iznos>` and a method choice.
2. [Nastavi] leads to the step `Skenirajte novu praznu karticu`.
3. After a valid scan: the toast `Nova kartica dodijeljena. Stara kartica je poništena.`

## S-10 Day pass dialog
- **Controls:** a quantity stepper (1–20), `Ukupno: <iznos>`, and the method buttons.
- **Buttons:** [Naplati] and [Otkaži].

## S-11 Desk expense dialog
- **Fields:** `Kategorija` (active, non-salary, not "Roba za prodaju", D-92), `Opis`, `Iznos (€)`, and the fixed note `Plaćeno iz kase · danas`.
- **Buttons:** [Sačuvaj] and [Otkaži].

## S-12 Today's payments — `/payments/today`
**Sections:**
1. `Uplate` (payments).
2. `Prodaja iz magacina` (bar sales).
3. `Moji troškovi danas` (for the owner and the manager: `Troškovi danas`; the manager's list is S-17's Danas, without salaries, D-96).

**Each row:** time, description, method, amount, entered by, and actions [Ispravi] [Poništi] (enabled per BR-094). Voided rows are struck through, with the reason in a tooltip.

**Footer:** open-shift totals — cash, card, till expenses, expected cash. Visible to the owner, managers and the shift's receptionist (P-14). Managers receive only these aggregate totals; expense rows follow BR-134 (for a manager every non-salary expense of today, voidable only when their own, D-96).

**Empty text:** `Danas još nema uplata.`

## S-13 Magacin — `/storage`
- **Table:** Proizvod, Stanje, Nabavna cijena, Prodajna cijena, and actions [Prodaja] [Nova roba]. Active products only.
- **Products (D-76, P-42), for every role but the receptionist:**
  - [Dodaj proizvod] beside the title, and [Uredi] on each row. Both open the product dialog: Naziv, Nabavna cijena (€), Prodajna cijena (€), Aktivan, with the info text `Promjena cijene važi samo za nove prodaje.` (BR-004, BR-140).
  - Under the table, when any product is inactive, [Prikaži neaktivne (N)] shows the table `Neaktivni proizvodi` (Proizvod, Nabavna cijena, Prodajna cijena, [Uredi]). Ticking Aktivan there brings a product back. The button then reads [Sakrij neaktivne (N)].
- **Prodaja dialog:** quantity (max = stock), `Ukupno`, and the method buttons.
- **Nova roba dialog (D-95):** `Količina`, `Nabavna cijena po komadu (sa fakture)` (minimum €0.01; validation: `Nabavna cijena mora biti najmanje 0,01 €.`) and `Ukupno`, then the fields of S-17 [Novi trošak] without `Kategorija`: `Opis` (prefilled `Nabavka: <proizvod> × <količina>`), `Datum` (owner and admin only; disabled at today for the manager and the receptionist), `Način` (Gotovina / Platna kartica / Van kase), `PDV uračunat`, `Dobavljač`, `Račun` and `Iz kase` (disabled without an open shift). BR-141.
- **Empty text:** `Nema proizvoda. Dodaje ih vlasnik ili menadžer.`

## S-14 Close shift — `/shift/close` (receptionist)
**Summary cards (BR-115):**
- Gotovina (prihod), Platna kartica (prihod), Troškovi iz kase, **Očekivana gotovina**;
- counts: uplate, dnevne karte, prodaja, poništeno;
- a warning if people are still checked in: `U teretani je još <N> osoba.`

**Field:** `Prebrojana gotovina (€)` (required). Below it, the live text `Razlika: <iznos> (Manjak/Višak)`.

**Buttons:**
- [Pregledaj stavke] (expands the full list);
- [Zaključi smjenu i odjavi me], which opens the confirmation `Nakon zaključenja nije moguće mijenjati stavke ove smjene.`

**Processing:** the steps are shown while running. On success the user is redirected to `/login?closed=1`.

## S-15 Visit statistics — `/stats/visits` (owner, manager)
- **Period selector:** as in F-17.
- **Content:** the charts and figures from US-20.1.
- **Empty text:** `Nema dolazaka u izabranom periodu.`

## S-16 Finance dashboard — `/finance` (owner)
- **Content:** as in US-17.1.
- **Cards:** Prihod, Troškovi, Profit, Zarada na magacinu. For the owner, Troškovi is the cost of goods sold plus the operating expenses (BR-151 to BR-153, D-92).
- **Statement and cash flow (D-92, owner only):** under the cards, two blocks side by side (stacked on a phone):
  - `Bilans uspjeha`: `Prihodi` with Članarine, Treninzi (grupni i personalni), Prodaja iz magacina, Ostalo, then `Ukupni prihodi`, `Trošak prodate robe`, `Bruto dobit`, `Operativni troškovi` one line per category (`Nema operativnih troškova.` when none) with `Ukupno operativni troškovi`, and `Profit`, signed and coloured;
  - `Novčani tok`: Primljeno, Plaćena nova roba, Ostala plaćanja, `Neto promjena novca` (signed), and below it `Vrijednost zalihe na dan <dd.mm.yyyy>` with the BR-159 amount.
- **Chart (D-68):** `Prihod i troškovi po mjesecima (€)`, January to December of the chosen year. Its own controls, independent of the period: **Godina** (default: the current year; back to the first year with any money) and **Mjesec** (`Cijela godina`, or one month up to the current one). A chosen month shows `Prihod i troškovi po danima (€)`. Months and days after today stay empty. Under the chart: `Ukupno za <godina | mjesec godina>: Prihod … · Troškovi … · Profit …`.
- **Tables:**
  - income by plan and by method;
  - expenses by category (manager only since D-92; the owner reads them in `Operativni troškovi`);
  - Ističe u narednih 7 dana (members with a membership expiring in the next 7 days);
  - Članovi sa neplaćenim dolascima (members with unpaid visits).
- **Sub-navigation:** Pregled · Troškovi · Fiksni troškovi (D-93) · Treneri · Smjene · Magacin · Naknadni unos · Dnevnik izmjena.
- **Manager (D-80):**
  - the sub-navigation is only Pregled · Troškovi · Smjene; the other tabs answer 404;
  - the period offers only `Danas`, `Ova sedmica` and `Ovaj mjesec`; any other period in the URL falls back to `Ovaj mjesec`;
  - Pregled shows only the Prihod and Troškovi cards and the three tables by plan, by method and by category. Troškovi leave out salary categories. There is no chart and no Ističe or Neplaćeni list.

## S-17 Expenses — `/finance/expenses` (owner)
- **Controls:** filters and [Novi trošak] (the BR-133 form, which does not offer "Roba za prodaju", D-92; the category filter still does).
- **Total (D-63):** `Ukupno: <iznos>` above the table, for the listed expenses without the voided ones; when voided rows are listed, the note `Poništeni troškovi nisu uračunati.`
- **Table:** Datum, Kategorija, Opis, Dobavljač, Račun, Način, Iz kase, Iznos, Unio/la, and actions. A row posted from a fixed expense carries the badge `Fiksni` beside its Opis (BR-136, D-93).
- **Button:** [Kategorije troškova] opens a dialog listing categories with inline rename, active toggle and [Dodaj].
- **Manager (D-80):** read-only, with the D-80 periods. Salary-category expenses are not listed and not offered in the category filter. There is no [Novi trošak], [Kategorije troškova] or [Poništi].

## S-18 Trainers — `/finance/trainers` (owner)
- **Controls:** a month selector (default: current month).
- **Table:** one row per trainer with the BR-156 columns and an [Evidentiraj isplatu] button.
- **Detail:** clicking a trainer opens the list of attributed payments with their shares.

## S-19 Shifts — `/finance/shifts` (owner)
- **Table:** Recepcioner, Početak, Kraj, Način zaključenja, Gotovina, Kartica, Očekivano, Prebrojano, Razlika, Email status, and actions [PDF] [Pošalji ponovo].
- **Open shift:** shown on top, with [Zaključi smjenu] (BR-114).
- **Manager (D-80):** the D-80 periods; no Email status column, no [PDF], no [Pošalji ponovo], and the open shift without [Zaključi smjenu] (P-12).

## S-20 Storage report — `/finance/storage` (owner)
- **Per product (D-92):** Proizvod, Nabavna cijena, Prodajna cijena, and for the period Ulaz (kom), Nabavka, Prodato kom, Prihod, Trošak prodate robe, Bruto zarada, Marža; then Stanje and Vrijednost zalihe at the end of the period (BR-159), named above the table as `Stanje i vrijednost zalihe na dan <dd.mm.yyyy>.` A totals row `Ukupno` closes the table.
- **Other content:**
  - daily sales per product (table);
  - a list of stock-ins with [Poništi].

## S-21 Audit log — `/finance/audit` (owner)
- **Controls:** filters for period, user and record type.
- **Rows:** time, user, action, record, and a changes column (`polje: staro → novo`).

## S-22 Back-dated entry — `/finance/backdated` (owner)
**Tabs:** Dolazak, Članarina, Dnevne karte, Zamjenska kartica. Each form has a required date (≤ today) and, where relevant, times.

**Tab rules:**
- Dolazak: requires a member, check-in and check-out times, the type, and the trainer/slot when needed.
- Članarina: works like S-08 (the `Fiksni termin` of D-71 included), with an editable start date and payment date.

**Banner:** `Naknadni unos – ne ulazi u smjenu.`

## S-23 Users — `/settings/users` (admin, owner, manager)
- **Table:** Ime, Korisničko ime/Email, Uloga, Aktivan, Kreiran.
- **Admin only (D-59):** one more column, `Lozinka`, showing each account's stored password. Each row hides it behind a [Prikaži] toggle so the screen cannot be read over someone's shoulder, and it is never rendered for any other role.
- **Locked login (D-75):** a login locked after failed sign-ins shows `Zaključan do <HH:mm>` in red under Aktivan, for every role that sees S-23. The owner and the admin also get [Otključaj] on that row (P-08), which shows `Nalog je otključan.`
- **Actions:** [Novi korisnik] [Uredi] [Nova lozinka] [Otključaj] [Deaktiviraj/Aktiviraj], limited per P-03, P-04, P-07 and P-08. A row the caller may not manage shows no actions, and [Deaktiviraj] is not offered for the caller's own row or for the last active owner or admin.
- **New user form:** Uloga, Ime i prezime, Korisničko ime, Privremena lozinka. The Administrator role asks for Email instead of Korisničko ime (D-57), and only an admin may choose Vlasnik or Administrator. Privremena lozinka here and in [Nova lozinka] has the D-82 eye button.

## S-24 Trainers and schedule — `/settings/trainers` (owner, manager)
**Sections:**
1. `Treneri`: name, active, and (owner only) `Naknada teretani po personalnom klijentu (€)` (empty = nije definisano) and `Udio za grupne (%)` (empty = važi procenat sa plana, D-62).
2. `Programi`: name, kind, active.
3. `Dodjela`: a matrix of trainers (rows) × programs (columns) with checkboxes.
4. `Raspored`: a weekly table (Mon–Sun) of slots, with [Dodaj čas] (program, trainer, day, time) and [Deaktiviraj]. Above it, the `Trener` select (`Svi treneri` or one trainer with classes in the schedule) shows only that trainer's classes (D-77).

## S-25 Plans — `/settings/plans` (owner)
- **Table:** all plans (including inactive).
- **Editing:** name, price, duration, coverage, limits, gym fixed amount, share %, trainer required, active, sort order.
- **Info text:** `Promjena cijene važi samo za nove prodaje.`

## S-26 Products — removed (D-76)
The screen `/settings/products` and its Podešavanja item are gone. It showed the same products as S-13 with [Dodaj proizvod] and [Uredi], and those now live on S-13. The route answers 404 for every role.

## S-27 Gym settings — `/settings/gym` (owner)
**Fields:**
- Zamjenska kartica (€);
- Minimalna cijena personalnog (€);
- Podsjetnik prije isteka (dana, 1–14);
- Automatsko zaključivanje (HH:mm);
- Zaštita od duplog skeniranja (s, 0–600);
- Primaoci izvještaja smjene (a list of emails, at least 1);
- Primaoci rezervne kopije (a list of emails, at least 1);
- Logo (upload).

**Read-only info:** `Posljednja rezervna kopija: <dd.mm.yyyy HH:mm> – uspješno` (or `– neuspješno: <greška>`, or `Još nije napravljena`).

## S-28 Cards — `/settings/cards` (owner; D-81)
- **Form:** `Broj kartica (1–100)` and [Generiši].
- **Batch list:** as in US-03.1.

**Print PDF layout:**
- A4 portrait, 10 cards (2 columns × 5 rows), each 85.6 × 54 mm, with thin grey dashed cut lines.
- **Look (D-73):** a cream card with soft beige waves on the right, inside a thin bronze frame with rounded corners.
- **Card content:**
  - at the top left: the KP mark (the gym logo without the FITNESS lettering; a logo uploaded on S-27 takes its place), a thin vertical divider, then the gym name in a serif and `@kpfitness.me` under it;
  - QR code of 30 × 30 mm on the right, in a thin bronze frame (error correction M, quiet zone ≥ 2 modules, dark brown on near-white);
  - the code under the QR code in the pattern `123 456 7890` (12 pt, monospace);
  - the label `Ime i prezime:` with an empty line (≥ 50 mm) along the bottom.

## S-29 Trainers — `/trainers` (all roles, D-72)
- **Title:** `Treneri`, with the line `Članovi sa grupnom članarinom koja važi danas, po treneru i fiksnom terminu.`
- **Content (BR-027):** one table per trainer, trainers by name. Inside it, one header row per fixed class time, earliest first (`Uto, čet, sub · 08:00 · Članova: 7`), followed by its members. The class time at the start of the header row (`Uto, čet, sub · 08:00`, or `Termin nije upisan`) is bold (D-78). `Termin nije upisan` comes last, with the hint `Članarine prodate prije uvođenja fiksnog termina. Termin se upisuje na profilu člana → [Promijeni termin].` A class time without members shows `Nema upisanih članova.`
- **Columns:** `#` (row number within the class time), `Član` (`#<broj> <ime i prezime>`, a link to S-07), `Vrsta` (the plan name), `Datum uplate`, `Danas`, and for the owner and admin only `Cijena po članu (€)`.
- **Today:** for a class time held today the header adds `Došlo danas: <n> / <m>`, and `Danas` shows each member's check-in time (`HH:mm`) or `—`. Under the members, the line `Prijavljeni na čas, a nisu na spisku:` lists the others who checked in to it, each as `#<broj> <ime i prezime> (HH:mm)`, adding `neplaćen dolazak` for an unpaid visit. For a class time not held today, `Danas` stays empty.
- **Owner and admin:** the trainer's table ends with the row `UKUPNO – <trener>` and the sum of `Cijena po članu (€)`.
- **Empty list:** `Nema grupnih termina ni članova sa grupnom članarinom.`

## S-30 Fixed expenses — `/finance/recurring` (owner; D-93)
- **Title:** `Fiksni troškovi`, with [Dodaj fiksni trošak] beside it and the line `Trošak se knjiži automatski 1. u mjesecu. Izmjena važi od sljedećeg knjiženja.`
- **Totals:** `Mjesečno ukupno: <iznos>` for the active fixed expenses, and under it `Plate: <iznos> · Ostali fiksni troškovi: <iznos>`.
- **Table (active ones):** Naziv, Kategorija, Iznos, Način, Od mjeseca (`oktobar 2026`), Zadnje knjiženje (the date of the last posted and not voided month, or `—`), [Uredi].
- **Inactive:** [Prikaži neaktivne (N)] shows them in the same table, greyed; the button then reads [Sakrij neaktivne (N)].
- **Dialog** (`Dodaj fiksni trošak` / `Uredi fiksni trošak`): Naziv, Kategorija (active, not "Roba za prodaju"), Iznos (€), Način (Van kase, Platna kartica, Gotovina; Van kase first), Od mjeseca (a month picker, from this month; a new one opens on next month), Aktivan. Once something was posted, Od mjeseca is locked with `Mjesec početka se ne mijenja nakon prvog knjiženja.` A past month shows `Izaberite tekući ili neki kasniji mjesec.` Success: `Fiksni trošak je sačuvan.`
- **Empty text:** `Nema fiksnih troškova. Dodajte kiriju, plate i ostale troškove koji se ponavljaju svakog mjeseca.`
- **Manager and receptionist:** 404; the tab is not shown (P-57).
