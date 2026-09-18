# 06 — Screens and Flows

Routes are in English; every visible text is in Montenegrin (ijekavica). Text in `code` below is exact UI copy.

## 1. Global layout and patterns
- **Header:**
  - gym name;
  - navigation (role-based, §2);
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
| Uplate danas | `/payments/today` | ✓ | ✓ | ✓ |
| Magacin | `/storage` | ✓ | ✓ | ✓ |
| Zaključi smjenu | `/shift/close` | ✗ | ✗ | ✓ |
| Statistika dolazaka | `/stats/visits` | ✓ | ✓ | ✗ |
| Finansije | `/finance/*` | ✓ | ✗ | ✗ |
| Podešavanja | `/settings/*` | ✓ (all) | ✓ (Korisnici, Treneri, Kartice) | ✗ |

An `admin` sees everything an owner sees (D-58).

**Home after login:** receptionist → `/reception`, manager → `/reception`, owner and admin → `/finance`.

---

## S-01 Login — `/login`
- **Fields:** `Korisničko ime ili email`, `Lozinka`.
- **Buttons:** [Prijavi se], and a link `Zaboravljena lozinka?`.
- **Errors:** as in US-01.1 and US-01.2.
- **After login:** a receptionist goes through the shift logic (BR-111), which leads to S-02 or `/reception`.
- **Info messages:** `?closed=1` shows `Smjena je zaključena.`; `?auto=1` shows `Smjena je automatski zaključena.`

### S-01b First-login password change — `/change-password`
- **Fields:** `Nova lozinka`, `Ponovi lozinku` (≥ 8 characters, must match).
- **Button:** [Sačuvaj].
- **Access:** blocks every other route until the password is saved.

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
2. `Podaci o članu`: Ime, Prezime, Telefon, Email, Datum rođenja (date picker, and typing `dd.mm.yyyy` is also accepted).
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
- `Članarine`: plan, trainer, Od, Važi do, status, and remaining sessions per limited type. [Produži] on each non-voided membership.
- `Uplate`: owners see everything. Others see today's non-back-dated payments. Columns: date, kind, plan, amount, method, entered by, and status (Poništeno).
- `Dolasci`: as in US-07.2.

**Anonymize:** a dialog asking the user to type the member number, followed by [Anonimiziraj trajno].

**Anonymized member:** the profile is read-only with the banner `Član je anonimiziran.`

## S-08 Sell membership dialog
**Fields, in order:**
1. `Vrsta članarine`: a select with the name and price (Personalni shows "iznos po dogovoru").
2. `Trener`: shown if required, filtered by BR-023.
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
- **Fields:** `Kategorija` (active, non-salary), `Opis`, `Iznos (€)`, and the fixed note `Plaćeno iz kase · danas`.
- **Buttons:** [Sačuvaj] and [Otkaži].

## S-12 Today's payments — `/payments/today`
**Sections:**
1. `Uplate` (payments).
2. `Prodaja iz magacina` (bar sales).
3. `Moji troškovi danas` (for the owner: `Troškovi danas`).

**Each row:** time, description, method, amount, entered by, and actions [Ispravi] [Poništi] (enabled per BR-094). Voided rows are struck through, with the reason in a tooltip.

**Footer:** open-shift totals — cash, card, till expenses, expected cash. Visible to the owner, managers and the shift's receptionist (P-14). Managers receive only these aggregate totals; expense rows still follow BR-134.

**Empty text:** `Danas još nema uplata.`

## S-13 Magacin — `/storage`
- **Table:** Proizvod, Stanje, Nabavna cijena, Prodajna cijena, and actions [Prodaja] [Nova roba]. Active products only.
- **Prodaja dialog:** quantity (max = stock), `Ukupno`, and the method buttons.
- **Nova roba dialog:** quantity, `Nabavna cijena po komadu (sa fakture)` (minimum €0.01; validation: `Nabavna cijena mora biti najmanje 0,01 €.`), the choice `Plaćanje: Iz kase / Van kase`, and `Ukupno`.
- **Empty text:** `Nema proizvoda. Vlasnik dodaje proizvode u Podešavanjima.`

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
- **Cards:** Prihod, Troškovi, Profit, Zarada na magacinu.
- **Tables:**
  - income by plan and by method;
  - expenses by category;
  - Ističe u narednih 7 dana (members with a membership expiring in the next 7 days);
  - Članovi sa neplaćenim dolascima (members with unpaid visits).
- **Sub-navigation:** Pregled · Troškovi · Treneri · Smjene · Magacin · Naknadni unos · Dnevnik izmjena.

## S-17 Expenses — `/finance/expenses` (owner)
- **Controls:** filters and [Novi trošak] (the BR-133 form).
- **Table:** Datum, Kategorija, Opis, Dobavljač, Račun, Način, Iz kase, Iznos, Unio/la, and actions.
- **Button:** [Kategorije troškova] opens a dialog listing categories with inline rename, active toggle and [Dodaj].

## S-18 Trainers — `/finance/trainers` (owner)
- **Controls:** a month selector (default: current month).
- **Table:** one row per trainer with the BR-156 columns and an [Evidentiraj isplatu] button.
- **Detail:** clicking a trainer opens the list of attributed payments with their shares.

## S-19 Shifts — `/finance/shifts` (owner)
- **Table:** Recepcioner, Početak, Kraj, Način zaključenja, Gotovina, Kartica, Očekivano, Prebrojano, Razlika, Email status, and actions [PDF] [Pošalji ponovo].
- **Open shift:** shown on top, with [Zaključi smjenu] (BR-114).

## S-20 Storage report — `/finance/storage` (owner)
- **Per product:** stanje, vrijednost zalihe, and for the period: prodato kom, prihod, nabavna vrijednost prodatog, zarada.
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
- Članarina: works like S-08, with an editable start date and payment date.

**Banner:** `Naknadni unos – ne ulazi u smjenu.`

## S-23 Users — `/settings/users` (admin, owner, manager)
- **Table:** Ime, Korisničko ime/Email, Uloga, Aktivan, Kreiran.
- **Admin only (D-59):** one more column, `Lozinka`, showing each account's stored password. Each row hides it behind a [Prikaži] toggle so the screen cannot be read over someone's shoulder, and it is never rendered for any other role.
- **Actions:** [Novi korisnik] [Uredi] [Nova lozinka] [Deaktiviraj/Aktiviraj], limited per P-03, P-04 and P-07. A row the caller may not manage shows no actions, and [Deaktiviraj] is not offered for the caller's own row or for the last active owner or admin.
- **New user form:** Uloga, Ime i prezime, Korisničko ime, Privremena lozinka. The Administrator role asks for Email instead of Korisničko ime (D-57), and only an admin may choose Vlasnik or Administrator.

## S-24 Trainers and schedule — `/settings/trainers` (owner, manager)
**Sections:**
1. `Treneri`: name, active, and (owner only) `Naknada teretani po personalnom klijentu (€)` (empty = nije definisano) and `Udio za grupne (%)` (empty = važi procenat sa plana, D-62).
2. `Programi`: name, kind, active.
3. `Dodjela`: a matrix of trainers (rows) × programs (columns) with checkboxes.
4. `Raspored`: a weekly table (Mon–Sun) of slots, with [Dodaj čas] (program, trainer, day, time) and [Deaktiviraj].

## S-25 Plans — `/settings/plans` (owner)
- **Table:** all plans (including inactive).
- **Editing:** name, price, duration, coverage, limits, gym fixed amount, share %, trainer required, active, sort order.
- **Info text:** `Promjena cijene važi samo za nove prodaje.`

## S-26 Products — `/settings/products` (owner)
- **Table:** name, current purchase price, sale price, active.
- **Button:** [Dodaj proizvod].

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

## S-28 Cards — `/settings/cards` (owner, manager)
- **Form:** `Broj kartica (1–100)` and [Generiši].
- **Batch list:** as in US-03.1.

**Print PDF layout:**
- A4 portrait, 10 cards (2 columns × 5 rows), each 85.6 × 54 mm, with thin grey cut lines.
- **Card content:**
  - gym logo (if uploaded) and gym name at the top left;
  - QR code of 30 × 30 mm on the right (error correction M, quiet zone ≥ 2 modules);
  - the code under the QR code in the pattern `123 456 7890` (12 pt, monospace);
  - the label `Ime i prezime:` with an empty line (≥ 50 mm) at the bottom left.
