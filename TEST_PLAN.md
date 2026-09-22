# TEST_PLAN.md — Plan ručnog testiranja aplikacije KP Fitness

**Verzija plana:** 1.0 · **Datum:** 21.09.2026 · **Osnova:** kod na grani `main`, commit `10c666f` (M-13)

Ovaj plan je napisan isključivo na osnovu koda u ovom repozitorijumu (migracije, server akcije,
Zod šeme, komponente, `lib/i18n/me.ts`). Sve poruke u navodnicima su tačan tekst iz aplikacije.
Gdje iz koda nije jasno kakvo ponašanje treba da bude, nije pogađano — stavka je upisana u
sekciju **7. Otvorena pitanja**.

> **UPOZORENJE prije početka.** Aplikacija radi direktno protiv **hostovane Supabase baze**
> (odluka D-56; nema Dockera ni lokalne baze). Sve što unesete tokom testiranja ostaje u pravoj
> bazi. Finansijski zapisi se **nikada ne brišu**, samo poništavaju. Zato testirajte prije nego
> što teretana pređe na aplikaciju, ili prihvatite da testni članovi i uplate ostanu u istoriji
> kao poništene stavke. Kako ukloniti tragove testiranja piše u §1.5.

---

## 1. Priprema okruženja

### 1.1 Preduslovi
- Node.js 22+ i Google Chrome.
- Pristup hostovanom Supabase projektu i njegovim ključevima.
- Fajl `.env.local` u korijenu projekta (postoji; ako nedostaje, kopirati `.env.example`).

### 1.2 Env varijable i šta se dešava bez njih

| Varijabla | Čemu služi | Bez nje |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | veza ka bazi | aplikacija ne radi |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sesija u browseru | prijava ne radi |
| `SUPABASE_SERVICE_ROLE_KEY` | kreiranje naloga, PDF, backup | S-23, PDF i poslovi padaju |
| `STAFF_EMAIL_DOMAIN` | korisničko ime se mapira u `<ime>@<domen>` (AS-4) | prijava korisničkim imenom baca grešku (vidi SUSPECT-03) |
| `DATABASE_URL` | samo `npm run test:db` | ne utiče na ručno testiranje |
| `EMAIL_FROM`, `RESEND_API_KEY` | izvještaj smjene, podsjetnici, backup mail | slanje se preskače (BR-161), status ostaje „nije slato“ |
| `APP_URL` | link u emailu za reset lozinke | link vodi na pogrešnu adresu |
| `CRON_SECRET` | zaštita `/api/jobs/*` | svaki poziv posla vraća 401 |
| `BACKUP_ZIP_PASSWORD` | lozinka ZIP-a sedmične kopije | backup posao pada |
| `SEED_OWNER_PASSWORD`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | seed naloga | nema s kim se prijaviti |

> **Email:** ostavite `EMAIL_FROM` **prazno** dok ne dođete do testova EMAIL-01 i JOB-03.
> Dok je prazno, ništa se ne šalje. `npm run jobs:run -- morning` sa podešenim ključem šalje
> **pravi email pravim članovima**.

### 1.3 Pokretanje

```
npm ci
npm run db:push        # primijeni migracije 0001–0025
npm run seed           # teretana, planovi, treneri, programi, raspored, kategorije, proizvod Voda
npm run seed:owner     # vlasnik Matija Vojinović (prijava EMAILOM)
npm run seed:admin     # administrator (prijava EMAILOM iz ADMIN_EMAIL)
npm run dev            # http://localhost:3000
```

Komande korisne tokom testiranja:

| Komanda | Šta radi |
|---|---|
| `npm run jobs:run -- nightly` | noćni posao: auto-odjava dolazaka + auto-zaključenje smjene |
| `npm run jobs:run -- morning` | podsjetnici o isteku članarine (**šalje pravi email**) |
| `npm run jobs:run -- weekly-backup` | sedmična rezervna kopija |
| `npm run jobs:run -- email-retry` | ponovni pokušaj slanja izvještaja smjene |
| `npm run build` | provjera produkcijskog bundla |

### 1.4 Test nalozi

Seed pravi dva naloga koja se prijavljuju **emailom**. Sve ostale naloge pravite sami na ekranu
**Podešavanja → Korisnici** (`/settings/users`) i svi se prijavljuju **korisničkim imenom** (D-57).

| # | Uloga | Prijava | Kako se pravi | Napomena |
|---|---|---|---|---|
| 1 | Administrator | `ADMIN_EMAIL` + `ADMIN_PASSWORD` | `npm run seed:admin` | jedini vidi kolonu „Lozinka“ i smije da mijenja vlasnike |
| 2 | Vlasnik | `matija.vojinovic@eurotehnikamn.me` + `SEED_OWNER_PASSWORD` | `npm run seed:owner` | jedini vlasnik sa email prijavom |
| 3 | Vlasnik 2 | `vlasnik.test` / `Lozinka1234` | kao administrator: [Novi korisnik] → Vlasnik | potreban za test D-60 |
| 4 | Menadžer | `menadzer.test` / `Lozinka1234` | kao vlasnik ili admin | ne smije u Finansije |
| 5 | Recepcioner A | `recepcija1` / `Lozinka1234` | kao vlasnik, admin ili menadžer | drži smjenu |
| 6 | Recepcioner B | `recepcija2` / `Lozinka1234` | isto | za preuzimanje smjene (E19) |

Svaki novi nalog na **prvoj prijavi** mora da postavi svoju lozinku (S-01b). Za naloge 3–6
postavite npr. `Lozinka5678`.

### 1.5 Test podaci koje pripremiti unaprijed

1. **Kartice:** kao vlasnik → `/settings/cards` → serija od **10** kartica → [Preuzmi PDF].
   Kodovi su desetocifreni i počinju ciframa 1–9. Zapišite bar 5 kodova.
   Skener nije neophodan: kôd „skenirate“ tako što ga otkucate dok nijedno polje nema fokus i
   pritisnete **Enter**.
2. **Planovi (iz seeda, BR-010):** Nedeljna 39 €, Dvonedeljna 49 €, Mjesečna 79 €, Mjesečna 12
   termina 59 €, Studentska mjesečna 49 €, Tromjesečna 200 €, Šestomjesečna 400 €, Godišnja 790 €,
   Grupni (3x nedeljno) 69 €, G+T 99 €, Personalni (cijena se unosi), Dnevna karta 10 €.
3. **Treneri:** Milena (grupni), Julija (grupni + personalni), Tamara (grupni + personalni),
   Tatjana (personalni). Naknada teretani: Tamara 80 €, Tatjana 80 €, Milena i Julija „nije definisano“.
4. **Raspored:** Milena uto/čet/sub 08:00 i 18:00; Julija pon/sri/pet 08:30; Tamara pon/sri/pet 19:00.
5. **Proizvod:** Voda, nabavna 0,30 €, prodajna 1,50 €, stanje 0.
6. **Članovi (napravite ih kroz MEM-01 … MEM-05):**
   - `Ana Anić` — aktivna mjesečna članarina;
   - `Božo Božović` — istekla članarina (za neplaćene dolaske);
   - `Ćira Ćirić Šušnjić-Žižić` — provjera naših slova;
   - `Personalni Klijent` — personalna članarina, trener Tamara;
   - `Grupni Klijent` — G+T članarina, trener Milena.

**Uklanjanje tragova testiranja (nikad ne brišite redove rukom):** uplate i troškove poništite
dugmetom [Poništi] uz razlog „test“; članove anonimizujte (vlasnik → profil → [Anonimiziraj]).
Poništene stavke ostaju u Dnevniku izmjena — tako i treba (BR-095).

---

## 2. Mapa aplikacije

### 2.1 Tehnologije
- **Frontend/backend:** Next.js (App Router, server komponente + server akcije), TypeScript, Tailwind.
- **Baza i autentikacija:** hostovani Supabase (Postgres + Auth + Storage). Sva poslovna logika je u
  Postgres funkcijama (RPC); browser nikada ne piše direktno u tabele.
- **Validacija:** Zod u server akcijama + `check` ograničenja i provjere u RPC-ovima (dvostruko).
- **Email:** Resend (`lib/email/send.ts`). **PDF:** react-pdf (izvještaj smjene, list kartica).
- **Zakazani poslovi:** `pg_cron` poziva `POST /api/jobs/<ime>` svakih 5 minuta sa `x-cron-secret`.
- **Sigurnosna zaglavlja:** CSP sa nonce-om, `frame-ancestors 'none'`, `Cache-Control: private, no-store`.

### 2.2 Rute

| Ruta | Ekran | Ko smije |
|---|---|---|
| `/` | preusmjerenje na početni ekran uloge | svi prijavljeni |
| `/login` | S-01 Prijava | svi |
| `/change-password` | S-01b Promjena lozinke | svi prijavljeni |
| `/auth/callback` | razmjena koda iz email linka | svi |
| `/reception` | S-03 Recepcija | sve uloge |
| `/members` | S-06 Članovi | sve uloge |
| `/members/[id]` | S-07 Profil člana | sve uloge (RLS filtrira uplate) |
| `/payments/today` | S-12 Uplate danas | sve uloge (troškove filtrira RLS) |
| `/storage` | S-13 Magacin | sve uloge |
| `/shift/gate` | S-02 Otvorena smjena | samo recepcioner |
| `/shift/close` | S-14 Zaključi smjenu | samo recepcioner |
| `/stats/visits` | S-15 Statistika dolazaka | admin, vlasnik, menadžer |
| `/finance` | S-16 Pregled | admin, vlasnik |
| `/finance/expenses` | S-17 Troškovi | admin, vlasnik |
| `/finance/trainers` | S-18 Treneri | admin, vlasnik |
| `/finance/shifts` | S-19 Smjene | admin, vlasnik |
| `/finance/storage` | S-20 Magacin (vlasnik) | admin, vlasnik |
| `/finance/audit` | S-21 Dnevnik izmjena | admin, vlasnik |
| `/finance/backdated` | S-22 Naknadni unos | admin, vlasnik |
| `/settings/users` | S-23 Korisnici | admin, vlasnik, menadžer |
| `/settings/trainers` | S-24 Treneri i raspored | admin, vlasnik, menadžer |
| `/settings/cards` | S-28 Kartice | admin, vlasnik, menadžer |
| `/settings/plans` | S-25 Planovi | admin, vlasnik |
| `/settings/products` | S-26 Proizvodi | admin, vlasnik |
| `/settings/gym` | S-27 Podešavanja teretane | admin, vlasnik |
| `POST /api/jobs/[job]` | četiri posla | samo `x-cron-secret` |
| `GET /api/pdf/shift/[id]` | PDF izvještaja smjene | admin, vlasnik |
| `GET /api/pdf/cards/[batchId]` | PDF lista kartica | admin, vlasnik, menadžer |

### 2.3 Tabele i veze (doc 07)

`gyms` → `gym_settings`, `staff` (+ `staff_credentials`, samo admin), `shifts`, `member_counters`,
`audit_log`, `job_runs`, `backup_runs`.
`card_batches` → `cards` → `members` (aktivna kartica).
`members` → `memberships` (+ `membership_finance`, samo vlasnik) → `visits`, `payments`.
`plans` (+ `plan_finance`), `trainers` (+ `trainer_finance`), `programs`, `trainer_programs`,
`class_slots`. `products` → `stock_movements`. `expense_categories` → `expenses`.
`expiry_notifications` po članarini.

### 2.4 Moduli i prioritet

| Modul | ID | Prioritet | Zašto |
|---|---|---|---|
| Prijava, lozinke, sesija | AUTH | **Kritično** | ulaz u sistem |
| Dozvole po ulogama | PERM | **Kritično** | finansije su samo vlasnikove |
| Smjene | SHIFT | **Kritično** | bez smjene nema naplate |
| Recepcija i dolasci | REC | **Kritično** | svakodnevni rad |
| Članovi | MEM | **Kritično** | temelj ostalog |
| Članarine i prodaja | MSHIP | **Kritično** | novac i datumi |
| Uplate, ispravke, troškovi pulta | PAY | **Kritično** | novac |
| Magacin | STO | Visoko | novac i stanje robe |
| Zaključenje smjene | CLOSE | **Kritično** | dnevni obračun |
| Podešavanja i katalog | SET | Visoko | cijene i nalozi |
| Kartice | CARD | Visoko | bez kartica nema članova |
| Finansije vlasnika | FIN | Visoko | izvještaji i naknadni unos |
| Statistika dolazaka | STAT | Srednje | informativno |
| Poslovi, email, backup | JOB | Visoko | automatika i oporavak |
| Bezbjednost | SEC | **Kritično** | tuđi podaci, XSS, upload |
| Greške i ponašanje UI-ja | UX | Srednje | offline, dupli klik, sporo |

---

## 3. Test slučajevi po modulima

Legenda: svaki test ima polje za rezultat. Popunjavajte ga dok radite.

### 3.1 AUTH — prijava, lozinke, sesija

### [AUTH-01] Prijava vlasnika emailom
- **Prioritet:** Kritično
- **Uloga / preduslovi:** Vlasnik (seed), odjavljeni ste
- **Koraci:**
  1. Otvorite `http://localhost:3000/`.
  2. Provjerite da vas je odmah preusmjerilo na `/login`.
  3. U polje „Korisničko ime ili email“ unesite email vlasnika.
  4. U polje „Lozinka“ unesite `SEED_OWNER_PASSWORD`.
  5. Kliknite [Prijavi se].
- **Test podaci:** `matija.vojinovic@eurotehnikamn.me` + lozinka iz `.env.local`
- **Očekivani rezultat:** preusmjerenje na `/finance`, u zaglavlju piše „KP Fitness“, ime i uloga
  „Vlasnik“. U navigaciji: Recepcija, Članovi, Uplate danas, Magacin, Statistika dolazaka,
  Finansije, Podešavanja. Nema stavke „Zaključi smjenu“.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [AUTH-02] Prijava recepcionera korisničkim imenom otvara smjenu
- **Prioritet:** Kritično
- **Uloga / preduslovi:** Recepcioner A, nema otvorene smjene u teretani
- **Koraci:**
  1. Odjavite se ako ste prijavljeni.
  2. Unesite `recepcija1` i lozinku.
  3. Kliknite [Prijavi se].
- **Test podaci:** `recepcija1` / `Lozinka5678`
- **Očekivani rezultat:** preusmjerenje na `/reception`. U zaglavlju stoji značka
  „Smjena: <ime> od HH:MM“. U navigaciji postoji „Zaključi smjenu“, a nema „Finansije“ ni
  „Statistika dolazaka“.
- **Gdje provjeriti:** UI; baza: novi red u `shifts` sa `closed_at = null`
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [AUTH-03] Pogrešna lozinka
- **Prioritet:** Kritično
- **Uloga / preduslovi:** bilo koji nalog
- **Koraci:** unesite tačno korisničko ime i namjerno pogrešnu lozinku → [Prijavi se].
- **Test podaci:** `recepcija1` / `pogresna123`
- **Očekivani rezultat:** crvena poruka „Pogrešno korisničko ime/email ili lozinka.“ Ostajete na
  `/login`, polje lozinke se ne pamti.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [AUTH-04] Nepostojeći nalog daje istu poruku (bez otkrivanja naloga)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** —
- **Koraci:** prijavite se kao `ne.postoji` sa bilo kojom lozinkom; zatim kao
  `nepostojeci@primjer.com`.
- **Test podaci:** `ne.postoji` / `bilosta123`
- **Očekivani rezultat:** ista poruka kao u AUTH-03, riječ u riječ. Ništa ne smije da nagovijesti
  da nalog ne postoji, ni vrijeme odgovora ne smije biti bitno različito.
- **Gdje provjeriti:** UI; Network tab (status i tijelo odgovora isti kao kod pogrešne lozinke)
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [AUTH-05] Prazna polja
- **Prioritet:** Visoko
- **Uloga / preduslovi:** —
- **Koraci:** kliknite [Prijavi se] bez ijednog unosa; zatim unesite samo korisničko ime;
  zatim samo lozinku.
- **Test podaci:** prazno / prazno
- **Očekivani rezultat:** u sva tri slučaja „Pogrešno korisničko ime/email ili lozinka.“
  Aplikacija ne puca i ne šalje zahtjev u nedogled.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [AUTH-06] Prva prijava traži novu lozinku i ne pušta dalje
- **Prioritet:** Kritično
- **Uloga / preduslovi:** novokreirani nalog (npr. `recepcija2`) koji se nikad nije prijavio
- **Koraci:**
  1. Prijavite se privremenom lozinkom.
  2. Provjerite naslov ekrana.
  3. Ne mijenjajući lozinku, ručno otkucajte `http://localhost:3000/reception` u adresnu liniju.
  4. Pokušajte i `/members`, `/settings/users`.
- **Test podaci:** `recepcija2` / `Lozinka1234`
- **Očekivani rezultat:** ekran „Postavite novu lozinku“ sa tekstom „Prijavili ste se privremenom
  lozinkom. Postavite novu lozinku da nastavite.“ Svaki pokušaj druge rute vraća na
  `/change-password`. Polje „Trenutna lozinka“ se **ne** traži.
- **Gdje provjeriti:** UI, adresna linija
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [AUTH-07] Lozinka kraća od 8 znakova
- **Prioritet:** Visoko
- **Uloga / preduslovi:** ekran S-01b (nastavak AUTH-06)
- **Koraci:** u „Nova lozinka“ i „Ponovi lozinku“ unesite `1234567` → [Sačuvaj].
- **Test podaci:** `1234567` (7 znakova)
- **Očekivani rezultat:** poruka ispod polja „Lozinka mora imati najmanje 8 znakova.“ Ništa nije
  sačuvano.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [AUTH-08] Lozinke se ne poklapaju
- **Prioritet:** Visoko
- **Uloga / preduslovi:** ekran S-01b
- **Koraci:** „Nova lozinka“ = `Lozinka5678`, „Ponovi lozinku“ = `Lozinka5679` → [Sačuvaj].
- **Test podaci:** kao gore
- **Očekivani rezultat:** poruka uz polje za ponavljanje: „Lozinke se ne poklapaju.“
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [AUTH-09] Granica dužine lozinke: tačno 8 znakova prolazi
- **Prioritet:** Srednje
- **Uloga / preduslovi:** ekran S-01b
- **Koraci:** unesite `Lozinka1` dvaput → [Sačuvaj].
- **Test podaci:** `Lozinka1` (8 znakova)
- **Očekivani rezultat:** lozinka je prihvaćena; recepcioner nastavlja na `/reception` (ili na
  S-02 ako je tuđa smjena otvorena), vlasnik/menadžer na svoj početni ekran.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [AUTH-10] Promjena lozinke kasnije traži trenutnu lozinku
- **Prioritet:** Visoko
- **Uloga / preduslovi:** bilo koji prijavljeni nalog koji je već postavio svoju lozinku
- **Koraci:**
  1. U zaglavlju otvorite meni naloga → [Promijeni lozinku].
  2. U „Trenutna lozinka“ unesite pogrešnu vrijednost, nove lozinke unesite ispravno → [Sačuvaj].
  3. Ponovite sa tačnom trenutnom lozinkom.
- **Test podaci:** pogrešna `nijeova123`, zatim tačna
- **Očekivani rezultat:** prvi pokušaj: „Trenutna lozinka nije tačna.“ Drugi: „Lozinka je
  promijenjena.“ i možete se odjaviti pa prijaviti novom lozinkom.
- **Gdje provjeriti:** UI; nova prijava
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [AUTH-11] Admin vidi novu lozinku zaposlenog (D-59)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Administrator; zaposleni iz AUTH-10 je upravo promijenio lozinku
- **Koraci:** prijavite se kao administrator → `/settings/users` → u redu tog zaposlenog kliknite
  [Prikaži] u koloni „Lozinka“.
- **Test podaci:** —
- **Očekivani rezultat:** prikazuje se **nova** lozinka u čitljivom obliku (ne stara). Dugme se
  mijenja u [Sakrij].
- **Gdje provjeriti:** UI; baza: `staff_credentials.password`
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [AUTH-12] Zaboravljena lozinka za nalog sa korisničkim imenom
- **Prioritet:** Srednje
- **Uloga / preduslovi:** odjavljeni
- **Koraci:** `/login` → [Zaboravljena lozinka?] → unesite `recepcija1` → [Pošalji link].
- **Test podaci:** `recepcija1`
- **Očekivani rezultat:** poruka „Lozinku vam postavlja administrator, vlasnik ili menadžer.“
  Nikakav email se ne šalje.
- **Gdje provjeriti:** UI; Network tab
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [AUTH-13] Zaboravljena lozinka za nepostojeći email ne otkriva naloge
- **Prioritet:** Kritično
- **Uloga / preduslovi:** odjavljeni
- **Koraci:** [Zaboravljena lozinka?] → `nepostoji@primjer.com` → [Pošalji link]. Ponovite sa
  email adresom administratora.
- **Test podaci:** `nepostoji@primjer.com`, pa `ADMIN_EMAIL`
- **Očekivani rezultat:** **obje** radnje daju istu poruku: „Ako nalog postoji, poslali smo link za
  promjenu lozinke na taj email.“ Email stiže samo u drugom slučaju.
- **Gdje provjeriti:** UI; sanduče administratora
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [AUTH-14] Link iz emaila vodi na promjenu lozinke
- **Prioritet:** Visoko
- **Uloga / preduslovi:** email iz AUTH-13 je stigao; `APP_URL` je podešen
- **Koraci:** otvorite link iz emaila; postavite novu lozinku; prijavite se njome.
- **Test podaci:** nova lozinka `AdminNova123`
- **Očekivani rezultat:** link vodi na `/auth/callback?...next=/change-password`, pa na ekran
  promjene lozinke. Nakon čuvanja, prijava novom lozinkom uspijeva.
- **Gdje provjeriti:** UI, adresna linija, email
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [AUTH-15] Neispravan ili istekao kod u callbacku
- **Prioritet:** Srednje
- **Uloga / preduslovi:** odjavljeni
- **Koraci:** otvorite `http://localhost:3000/auth/callback?code=neispravan` i
  `http://localhost:3000/auth/callback` (bez koda).
- **Test podaci:** `code=neispravan`
- **Očekivani rezultat:** oba puta preusmjerenje na `/login`, bez poruke o grešci i bez sesije.
- **Gdje provjeriti:** UI, adresna linija
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [AUTH-16] Callback ne smije da vodi van aplikacije (otvoreno preusmjerenje)
- **Prioritet:** Kritično (bezbjednost)
- **Uloga / preduslovi:** —
- **Koraci:** otvorite `/auth/callback?next=//example.com` i `/auth/callback?next=https://example.com`.
- **Test podaci:** kao gore
- **Očekivani rezultat:** nikada ne odlazite na `example.com`. Završavate na `/change-password`
  ili `/login`.
- **Gdje provjeriti:** adresna linija, Network tab
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [AUTH-17] Odjava recepcionera traži potvrdu dok je smjena otvorena
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Recepcioner A sa otvorenom smjenom
- **Koraci:** meni naloga → [Odjava] → pročitajte dijalog → potvrdite.
- **Test podaci:** —
- **Očekivani rezultat:** dijalog „Odjava“ sa tekstom „Smjena ostaje otvorena. Odjaviti se?“.
  Nakon potvrde ste na `/login`, a smjena u bazi **ostaje otvorena**.
- **Gdje provjeriti:** UI; baza: `shifts.closed_at` i dalje `null`
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [AUTH-18] Vlasnik i menadžer se odjavljuju bez potvrde
- **Prioritet:** Srednje
- **Uloga / preduslovi:** Vlasnik ili Menadžer
- **Koraci:** meni naloga → [Odjava].
- **Test podaci:** —
- **Očekivani rezultat:** odmah ste na `/login`, bez dijaloga (samo recepcioner ostavlja smjenu
  za sobom).
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: prvo PALO 22.09.2026 — [Odjava] nije radila ni za jednu ulogu bez potvrde (forma je bila unutar Radix stavke menija, koja se odmontira pri izboru, pa je slanje otkazano). Popravljeno u components/common/app-header.tsx; regresioni test dodat u tests/e2e/auth.spec.ts. Ponovljeno: prolazi.

### [AUTH-19] Prijavljeni korisnik na `/login`
- **Prioritet:** Srednje
- **Uloga / preduslovi:** prijavljeni bilo kojom ulogom
- **Koraci:** ukucajte `/login` u adresnu liniju.
- **Test podaci:** —
- **Očekivani rezultat:** odmah vas vraća na početni ekran uloge (`/finance` za vlasnika i
  administratora, `/reception` za menadžera i recepcionera).
- **Gdje provjeriti:** adresna linija
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [AUTH-20] Deaktivirani nalog gubi sesiju na sljedećem zahtjevu
- **Prioritet:** Kritično
- **Uloga / preduslovi:** dva browsera/profila: u jednom Menadžer prijavljen, u drugom Vlasnik
- **Koraci:**
  1. U browseru B kao vlasnik otvorite `/settings/users` i deaktivirajte menadžera.
  2. U browseru A (menadžer) kliknite bilo koju stavku menija ili osvježite stranicu.
- **Test podaci:** `menadzer.test`
- **Očekivani rezultat:** menadžer je izbačen na `/login`. Ponovna prijava daje
  „Pogrešno korisničko ime/email ili lozinka.“ jer je nalog i u Auth zabranjen.
- **Gdje provjeriti:** UI oba browsera
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [AUTH-21] Osvježavanje, dugme nazad i dvije kartice
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Recepcioner A prijavljen
- **Koraci:**
  1. Na `/reception` pritisnite F5.
  2. Idite na `/members`, pa dugme **nazad**, pa **naprijed**.
  3. Otvorite drugu karticu browsera na `/payments/today`.
  4. U jednoj kartici se odjavite, pa u drugoj kliknite bilo šta.
- **Test podaci:** —
- **Očekivani rezultat:** 1–3: sve radi, sesija se čuva, zaglavlje i značka smjene su isti u obje
  kartice. 4: druga kartica vas vraća na `/login` (sesija je zajednička za browser).
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [AUTH-22] Razmaci i velika slova u korisničkom imenu
- **Prioritet:** Srednje
- **Uloga / preduslovi:** Recepcioner A
- **Koraci:** prijavite se sa `  Recepcija1  ` (razmaci ispred i iza, veliko R).
- **Test podaci:** `  Recepcija1  `
- **Očekivani rezultat:** prijava uspijeva — ime se skraćuje i pretvara u mala slova prije nego
  što se preslika u internu adresu. Ako padne, to je bug.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [AUTH-23] HTML/JS i SQL znakovi u polju za prijavu
- **Prioritet:** Kritično (bezbjednost)
- **Uloga / preduslovi:** —
- **Koraci:** u polje „Korisničko ime ili email“ redom unesite vrijednosti ispod i svaki put
  kliknite [Prijavi se].
- **Test podaci:** `<script>alert(1)</script>` · `' OR 1=1 --` · `"; drop table members; --` · `admin@x.com' --`
- **Očekivani rezultat:** svaki put samo „Pogrešno korisničko ime/email ili lozinka.“ Nema
  iskačućeg prozora, nema greške servera (HTTP 500), tabela `members` i dalje postoji.
- **Gdje provjeriti:** UI, Network tab, konzola browsera
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [AUTH-24] Vrlo dug unos
- **Prioritet:** Srednje
- **Uloga / preduslovi:** —
- **Koraci:** nalijepite 10 000 znakova `a` u polje korisničkog imena i u lozinku → [Prijavi se].
- **Test podaci:** 10 000 × `a`
- **Očekivani rezultat:** uredno odbijanje (ista poruka o pogrešnoj prijavi) ili poruka o grešci;
  aplikacija se ne ruši i stranica ostaje upotrebljiva.
- **Gdje provjeriti:** UI, Network tab
- [ ] Prošlo  [ ] Palo  Napomena: ____

---

### 3.2 PERM — dozvole i pristup rutama

> Tablicu ispod prolazite **direktnim kucanjem rute u adresnu liniju**, ne kroz meni. Očekivano
> ponašanje: ruta koju uloga ne smije da otvori daje **404 stranicu**, a ne prazan ekran s podacima.

### [PERM-01] Matrica pristupa — recepcioner
- **Prioritet:** Kritično
- **Uloga / preduslovi:** prijavljen Recepcioner A
- **Koraci:** redom otvorite svaku rutu iz kolone i zabilježite šta se desi.
- **Test podaci:** `/finance`, `/finance/expenses`, `/finance/trainers`, `/finance/shifts`,
  `/finance/storage`, `/finance/audit`, `/finance/backdated`, `/settings/users`,
  `/settings/trainers`, `/settings/cards`, `/settings/plans`, `/settings/products`,
  `/settings/gym`, `/stats/visits`
- **Očekivani rezultat:** **sve** navedene rute daju 404. Dozvoljene su samo `/reception`,
  `/members`, `/members/<id>`, `/payments/today`, `/storage`, `/shift/close`, `/shift/gate`.
- **Gdje provjeriti:** UI; Network tab (status 404)
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [PERM-02] Matrica pristupa — menadžer
- **Prioritet:** Kritično
- **Uloga / preduslovi:** prijavljen Menadžer
- **Koraci:** kao PERM-01.
- **Test podaci:** iste rute
- **Očekivani rezultat:** 404 za svih **sedam** `/finance/...` ruta, za `/settings/plans`,
  `/settings/products`, `/settings/gym`, `/shift/close` i `/shift/gate`.
  Dozvoljeno: `/reception`, `/members`, `/payments/today`, `/storage`, `/stats/visits`,
  `/settings/users`, `/settings/trainers`, `/settings/cards`.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [PERM-03] Matrica pristupa — vlasnik i administrator
- **Prioritet:** Kritično
- **Uloga / preduslovi:** Vlasnik, pa Administrator
- **Koraci:** otvorite sve rute iz §2.2.
- **Test podaci:** sve rute
- **Očekivani rezultat:** obje uloge otvaraju sve osim `/shift/close` i `/shift/gate` (404, to je
  samo recepcionerovo). Administrator vidi isto što i vlasnik, plus kolonu „Lozinka“ na S-23.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [PERM-04] Meni prikazuje samo dozvoljeno
- **Prioritet:** Visoko
- **Uloga / preduslovi:** sve četiri uloge redom
- **Koraci:** za svaku ulogu prepišite stavke glavne navigacije i podmenija „Podešavanja“.
- **Test podaci:** —
- **Očekivani rezultat:** recepcioner: Recepcija, Članovi, Uplate danas, Magacin, Zaključi smjenu.
  Menadžer: + Statistika dolazaka, Podešavanja (Korisnici, Treneri, Kartice).
  Vlasnik/Administrator: + Finansije i Podešavanja (Korisnici, Treneri, Kartice, Planovi,
  Proizvodi, Podešavanja teretane); nema „Zaključi smjenu“.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [PERM-05] Menadžer ne smije da mijenja vlasnika ni administratora (AS-5, P-03)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** Menadžer, postoje nalozi vlasnika i administratora
- **Koraci:** `/settings/users` → pogledajte redove vlasnika i administratora.
- **Test podaci:** —
- **Očekivani rezultat:** ti redovi nemaju nijedno dugme radnje ([Uredi], [Nova lozinka],
  [Deaktiviraj]). Menadžer u formi „Novi korisnik“ u padajućoj listi uloga **ne smije** moći da
  sačuva vlasnika ili administratora; ako pokuša, odgovor je „Nemate dozvolu za ovu radnju.“
- **Gdje provjeriti:** UI; Network tab (odgovor server akcije)
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [PERM-06] Recepcioner ne vidi tuđe uplate ni tuđe troškove
- **Prioritet:** Kritično
- **Uloga / preduslovi:** Recepcioner A; vlasnik je ranije unio trošak, i postoji uplata od juče
- **Koraci:** `/payments/today` → pogledajte sekcije „Uplate“ i „Moji troškovi danas“.
- **Test podaci:** —
- **Očekivani rezultat:** vidi **samo današnje** uplate koje nisu naknadni unos, i **samo svoje**
  troškove. Naslov sekcije troškova glasi „Moji troškovi danas“ (vlasnik vidi „Troškovi danas“).
- **Gdje provjeriti:** UI; uporedite sa istim ekranom kao vlasnik
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [PERM-07] Profil člana: istorija uplata po ulogama
- **Prioritet:** Visoko
- **Uloga / preduslovi:** član sa uplatama iz više dana
- **Koraci:** otvorite profil tog člana kao recepcioner, pa kao vlasnik; uporedite karticu „Uplate“.
- **Test podaci:** član `Ana Anić`
- **Očekivani rezultat:** recepcioner vidi samo današnje uplate; vlasnik vidi sve, uključujući
  naknadne (oznaka „Naknadno“) i poništene (oznaka „Poništeno“, precrtano).
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [PERM-08] Lozinke zaposlenih vidi samo administrator
- **Prioritet:** Kritično (bezbjednost)
- **Uloga / preduslovi:** Vlasnik i Menadžer
- **Koraci:** `/settings/users` kao vlasnik, pa kao menadžer.
- **Test podaci:** —
- **Očekivani rezultat:** kolona „Lozinka“ **ne postoji** ni za vlasnika ni za menadžera. Samo
  administrator je vidi.
- **Gdje provjeriti:** UI; Network tab (u odgovoru stranice ne smije biti lozinki)
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [PERM-09] PDF izvještaja smjene je samo vlasnikov
- **Prioritet:** Kritično
- **Uloga / preduslovi:** postoji zaključena smjena sa izvještajem; zabilježite njen `id` iz S-19
- **Koraci:** kao vlasnik otvorite `/api/pdf/shift/<id>`; zatim se prijavite kao menadžer, pa kao
  recepcioner, i otvorite isti URL.
- **Test podaci:** id zaključene smjene
- **Očekivani rezultat:** vlasnik i administrator dobijaju PDF; menadžer i recepcioner dobijaju
  **404**, bez ikakvog sadržaja.
- **Gdje provjeriti:** browser, Network tab
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [PERM-10] PDF lista kartica
- **Prioritet:** Visoko
- **Uloga / preduslovi:** postoji serija kartica
- **Koraci:** otvorite `/api/pdf/cards/<batchId>` kao vlasnik, menadžer i recepcioner.
- **Test podaci:** id serije iz S-28
- **Očekivani rezultat:** vlasnik, administrator i menadžer dobijaju PDF; recepcioner 404.
- **Gdje provjeriti:** browser
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [PERM-11] Izmišljeni i tuđi identifikatori u URL-u
- **Prioritet:** Kritično (bezbjednost)
- **Uloga / preduslovi:** bilo koja uloga
- **Koraci:** otvorite redom:
  1. `/members/00000000-0000-0000-0000-000000000000`
  2. `/members/nijeuuid`
  3. `/members/1 OR 1=1`
  4. `/api/pdf/shift/00000000-0000-0000-0000-000000000000`
  5. `/api/pdf/cards/abc`
- **Test podaci:** kao gore
- **Očekivani rezultat:** svaki put 404 stranica (ili prazan 404 odgovor za `/api/...`), nikad
  greška servera, nikad tuđi podaci.
- **Gdje provjeriti:** UI, Network tab
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [PERM-12] Ruta poslova nije javna
- **Prioritet:** Kritično (bezbjednost)
- **Uloga / preduslovi:** browser, bilo prijavljen bilo ne
- **Koraci:**
  1. Otvorite `http://localhost:3000/api/jobs/nightly` u browseru (to je GET).
  2. Iz PowerShell-a pošaljite POST bez zaglavlja:
     `Invoke-WebRequest -Method POST http://localhost:3000/api/jobs/nightly`
  3. Isti POST sa pogrešnim zaglavljem `x-cron-secret: pogresno`.
  4. POST na nepostojeći posao sa **ispravnim** zaglavljem: `/api/jobs/nepostoji`.
- **Test podaci:** `CRON_SECRET` iz `.env.local`
- **Očekivani rezultat:** 1–3 vraćaju **401** i tijelo `{"error":"unauthorized"}`. 4 vraća **404**
  `{"error":"unknown job"}`. Ništa se ne izvršava.
- **Gdje provjeriti:** Network tab / PowerShell izlaz; baza: `job_runs` se ne mijenja
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [PERM-13] Finansijske akcije odbijaju pogrešnu ulogu i kada se pozovu mimo ekrana
- **Prioritet:** Kritično
- **Uloga / preduslovi:** Menadžer prijavljen u kartici A; vlasnik u kartici B
- **Koraci:**
  1. Kao vlasnik otvorite `/finance/expenses`, otvorite [Novi trošak] i u Network tabu zapamtite
     kako izgleda zahtjev server akcije.
  2. Kao menadžer pokušajte da otvorite istu stranicu (`/finance/expenses`).
- **Test podaci:** —
- **Očekivani rezultat:** menadžer dobija 404 na stranici; i da nekako pošalje zahtjev, server
  akcija odgovara „Nemate dozvolu za ovu radnju.“ jer se uloga provjerava i na serveru i u bazi.
- **Gdje provjeriti:** UI, Network tab
- [ ] Prošlo  [ ] Palo  Napomena: ____

---

### 3.3 SHIFT — smjene (BR-110 do BR-119)

### [SHIFT-01] Ponovna prijava nastavlja moju smjenu
- **Prioritet:** Kritično
- **Uloga / preduslovi:** Recepcioner A ima otvorenu smjenu, pa se odjavio
- **Koraci:** prijavite se ponovo kao `recepcija1`.
- **Test podaci:** —
- **Očekivani rezultat:** idete pravo na `/reception`; značka u zaglavlju pokazuje **isto vrijeme
  početka** kao prije odjave (nova smjena nije otvorena).
- **Gdje provjeriti:** UI; baza: u `shifts` i dalje samo jedan otvoren red
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SHIFT-02] Drugi recepcioner dobija ekran „Otvorena smjena“ (S-02)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** Recepcioner A ima otvorenu smjenu; prijavljujete se kao Recepcioner B
- **Koraci:** odjavite A (smjena ostaje otvorena) → prijavite se kao `recepcija2`.
- **Test podaci:** `recepcija2`
- **Očekivani rezultat:** ekran `/shift/gate` sa naslovom „Otvorena smjena“ i tekstom
  „Otvorena je smjena: <ime A> (od dd.mm.gggg HH:MM).“ Ispod: polje „Prebrojana gotovina za
  prethodnu smjenu (€)“, dugmad [Preuzmi smjenu] i [Odjavi se].
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SHIFT-03] Preuzimanje smjene (E19)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** nastavak SHIFT-02; u smjeni A postoji bar jedna uplata
- **Koraci:** unesite `150,50` u polje prebrojane gotovine → [Preuzmi smjenu].
- **Test podaci:** `150,50`
- **Očekivani rezultat:** prelazite na `/reception`; značka pokazuje **vaše** ime i novo vrijeme.
  Smjena A je zatvorena sa načinom „Preuzeo/la <ime B>“ i za nju je napravljen PDF izvještaj
  (vidljiv vlasniku na `/finance/shifts`).
- **Gdje provjeriti:** UI; `/finance/shifts` kao vlasnik; email ako je `EMAIL_FROM` podešen
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SHIFT-04] Prebrojana gotovina na S-02 je neobavezna i validira se
- **Prioritet:** Visoko
- **Uloga / preduslovi:** ekran S-02
- **Koraci:** probajte redom: prazno polje; `abc`; `-5`; `12,345`; `0`; `1000`.
- **Test podaci:** kao gore
- **Očekivani rezultat:** prazno i `0` i `1000` prolaze. `abc`, `-5` i `12,345` (tri decimale)
  daju „Unesite iznos ili ostavite prazno.“
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SHIFT-05] Odjava sa S-02 ne dira tuđu smjenu
- **Prioritet:** Visoko
- **Uloga / preduslovi:** ekran S-02
- **Koraci:** kliknite [Odjavi se].
- **Test podaci:** —
- **Očekivani rezultat:** ste na `/login`; smjena recepcionera A je i dalje otvorena i pripada njemu.
- **Gdje provjeriti:** UI; prijava kao A vodi pravo na recepciju
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SHIFT-06] Značka smjene u zaglavlju za sve uloge
- **Prioritet:** Srednje
- **Uloga / preduslovi:** jednom sa otvorenom smjenom, jednom bez
- **Koraci:** prijavite se kao vlasnik dok je smjena otvorena; pa zaključite smjenu i pogledajte
  ponovo.
- **Test podaci:** —
- **Očekivani rezultat:** sa smjenom: „Smjena: <ime recepcionera> od HH:MM“. Bez smjene:
  „Nema otvorene smjene“.
- **Gdje provjeriti:** UI zaglavlje
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SHIFT-07] Bez otvorene smjene novac se ne može unositi (BR-092)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** nijedan recepcioner nije prijavljen (nema otvorene smjene); prijavljeni
  ste kao vlasnik
- **Koraci:**
  1. `/reception` → pokušajte [Dnevna karta] i [Trošak].
  2. `/storage` → pokušajte [Prodaja] i [Nova roba].
  3. Otvorite profil člana → [Nova članarina].
- **Test podaci:** —
- **Očekivani rezultat:** sva dugmad koja evidentiraju novac su onemogućena, a razlog je
  „Nema otvorene smjene. Recepcioner mora biti prijavljen.“ (poruka ili tooltip). Kod [Nova roba]
  opcija „Iz kase“ je onemogućena, a „Van kase“ ostaje moguća.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SHIFT-08] Zatvaranje smjene izvana izbacuje recepcionera (BR-116/BR-119)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** Recepcioner A prijavljen u browseru A; Vlasnik u browseru B
- **Koraci:**
  1. U browseru B: `/finance/shifts` → [Zaključi smjenu] za otvorenu smjenu → potvrdite.
  2. U browseru A kliknite bilo koju stavku menija.
- **Test podaci:** prebrojana gotovina ostavljena prazna
- **Očekivani rezultat:** recepcioner je odjavljen i na `/login` vidi „Smjena je automatski
  zaključena.“ Vlasnik ostaje prijavljen (njegova sesija se ne dira).
- **Gdje provjeriti:** UI oba browsera; adresa sadrži `?auto=1`
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SHIFT-09] Ekran S-02 kada je smjena u međuvremenu zatvorena
- **Prioritet:** Srednje
- **Uloga / preduslovi:** Recepcioner B stoji na `/shift/gate`; vlasnik u drugom browseru
- **Koraci:** vlasnik zaključi otvorenu smjenu; zatim B klikne [Preuzmi smjenu].
- **Test podaci:** —
- **Očekivani rezultat:** B ne dobija grešku — otvara mu se nova smjena i prelazi na `/reception`.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SHIFT-10] Ostale uloge nemaju S-02 ni S-14
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik, pa Menadžer
- **Koraci:** ukucajte `/shift/gate`, pa `/shift/close`.
- **Test podaci:** —
- **Očekivani rezultat:** 404 u sva četiri slučaja.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SHIFT-11] Ogroman iznos prebrojane gotovine na S-02 (granica)
- **Prioritet:** Srednje
- **Uloga / preduslovi:** ekran S-02 (vidi SUSPECT-05)
- **Koraci:** unesite `999999999999` → [Preuzmi smjenu].
- **Test podaci:** `999999999999`
- **Očekivani rezultat:** jasna poruka o neispravnom iznosu; **ne** smije se pojaviti opšte
  „Došlo je do greške. Pokušajte ponovo.“ niti 500. Ako se pojavi opšta greška, zabilježite kao bug.
- **Gdje provjeriti:** UI; serverska konzola (`npm run dev`)
- [ ] Prošlo  [ ] Palo  Napomena: ____

---

### 3.4 REC — recepcija, skeniranje, prijava i odjava dolaska

> Skeniranje: kliknite negdje u praznu površinu ekrana (da nijedno polje nema fokus), otkucajte
> kôd kartice i pritisnite **Enter**.

### [REC-01] Skeniranje prazne kartice otvara registraciju
- **Prioritet:** Kritično
- **Uloga / preduslovi:** Recepcioner A sa otvorenom smjenom; kôd nedodijeljene kartice
- **Koraci:** na `/reception` otkucajte kôd prazne kartice → Enter.
- **Test podaci:** jedan od kodova iz §1.5
- **Očekivani rezultat:** otvara se dijalog „Novi član“ sa već popunjenim poljem kartice i
  porukom „Kartica je prazna i spremna.“
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [REC-02] Prijava člana jednim skeniranjem (bez klika)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** član `Ana Anić` sa aktivnom **mjesečnom** članarinom (pokriva samo teretanu),
  nije u teretani
- **Koraci:** skenirajte njenu karticu.
- **Test podaci:** kartica člana Ana Anić
- **Očekivani rezultat:** bez ijednog klika pojavljuje se **zeleni** dijalog sa imenom i brojem
  člana, redovima „Članarina“, „Važi do“, „Preostalo termina“ (ovdje „Neograničeno“) i „Status“
  („Aktivna“). Čuje se zvuk potvrde. Dijalog se sam zatvara nakon 5 sekundi. Član se pojavljuje u
  listi „U teretani“ i brojač „Danas dolazaka“ raste za 1.
- **Gdje provjeriti:** UI; desna tabla „U teretani: N · Danas dolazaka: M“
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [REC-03] Izbor vrste dolaska kada članarina pokriva više toga (S-03a)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** član `Grupni Klijent` sa aktivnom G+T članarinom i trenerom Milenom
- **Koraci:** skenirajte njegovu karticu.
- **Test podaci:** —
- **Očekivani rezultat:** otvara se dijalog „Prijava: <ime>“ sa poljem „Vrsta dolaska“ koje nudi
  **Teretana** i **Grupni**; predizabrana je Teretana (jer članarina pokriva teretanu danas).
  Kad izaberete Grupni, pojavljuju se „Trener“ i „Čas“. Trener je predložen, a čas je ili
  „Čas: HH:MM“ iz rasporeda (ako je u roku od 90 minuta) ili „Bez časa iz rasporeda“.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [REC-04] Grupni dolazak bez trenera se ne može sačuvati
- **Prioritet:** Visoko
- **Uloga / preduslovi:** dijalog iz REC-03, izabrana vrsta „Grupni“
- **Koraci:** obrišite izbor trenera (ako je moguće) i kliknite [Prijavi].
- **Test podaci:** —
- **Očekivani rezultat:** poruka „Izaberite trenera.“, dolazak nije evidentiran.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [REC-05] Trener koji nije na programu (BR-023)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** —
- **Koraci:** u dijalogu za grupni dolazak pogledajte listu trenera; uporedite je sa dodjelama na
  `/settings/trainers`.
- **Test podaci:** za grupni: Milena, Julija, Tamara. Za personalni: Julija, Tamara, Tatjana.
- **Očekivani rezultat:** u listi za grupni nema **Tatjane**; u listi za personalni nema **Milene**.
  Ako ipak pokušate da sačuvate takvog trenera (npr. izmjenom zahtjeva), odgovor je
  „Trener nije dodijeljen ovom programu.“
- **Gdje provjeriti:** UI, Network tab
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [REC-06] Prvi neplaćeni dolazak — žuto upozorenje
- **Prioritet:** Kritično
- **Uloga / preduslovi:** član `Božo Božović` bez važeće članarine, nije u teretani
- **Koraci:** skenirajte njegovu karticu.
- **Test podaci:** —
- **Očekivani rezultat:** **žuti** dijalog sa imenom i tekstom „Članarina nije važeća – neplaćeni
  dolazak.“ i dugmadima [Produži članarinu] i [Zatvori]. Zvuk je drugačiji nego kod zelenog.
  Dijalog se **ne** zatvara sam. Dolazak je ipak evidentiran (ulaz se ne brani, BR-078).
- **Gdje provjeriti:** UI; profil člana → kartica „Dolasci“ (oznaka „Neplaćeno“)
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [REC-07] Drugi neplaćeni dolazak — crveni ekran preko cijelog prozora
- **Prioritet:** Kritično
- **Uloga / preduslovi:** `Božo Božović` ima već jedan neplaćen dolazak; odjavite ga pa ponovo
  skenirajte
- **Koraci:**
  1. Skenirajte karticu (odjava iz teretane).
  2. Skenirajte je ponovo (nova prijava) — ako vas dočeka pitanje o duploj prijavi, potvrdite.
- **Test podaci:** —
- **Očekivani rezultat:** **crveni** ekran preko cijelog prozora sa tekstom „PAŽNJA: 2. neplaćeni
  dolazak!“, dugmad [Produži članarinu] i [Zatvori], i treći, uzbunjujući zvuk.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [REC-08] Odjava skeniranjem i prikaz trajanja
- **Prioritet:** Kritično
- **Uloga / preduslovi:** član je u teretani duže od vrijednosti „Zaštita od duplog skeniranja“
  (podrazumijevano 120 s)
- **Koraci:** skenirajte karticu člana koji je unutra.
- **Test podaci:** —
- **Očekivani rezultat:** zeleni „toast“ sa tekstom „Odjavljen/a: <ime> – Xh Ymin“. Član nestaje
  iz liste „U teretani“.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [REC-09] Zaštita od duplog skeniranja
- **Prioritet:** Visoko
- **Uloga / preduslovi:** član je upravo prijavljen (prije manje od 120 s)
- **Koraci:** odmah ponovo skenirajte istu karticu.
- **Test podaci:** —
- **Očekivani rezultat:** pitanje „<ime> je prijavljen/a prije N s. Odjaviti?“ sa [Odjavi] i [Ne].
  [Ne] ostavlja člana unutra; [Odjavi] ga odjavljuje.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [REC-10] Promjena praga duplog skeniranja
- **Prioritet:** Srednje
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** `/settings/gym` → „Zaštita od duplog skeniranja (s)“ postavite na `0` → sačuvajte →
  vratite se na recepciju i dvaput skenirajte istu karticu za redom.
- **Test podaci:** `0`, zatim vratite na `120`
- **Očekivani rezultat:** sa 0 nema pitanja — drugo skeniranje odmah odjavljuje člana.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [REC-11] Nepoznata, poništena i neispravna kartica
- **Prioritet:** Kritično
- **Uloga / preduslovi:** recepcija; kartica koja je poništena zamjenom (vidi MEM-16)
- **Koraci:** skenirajte redom: `1234567890` (nepostojeći kôd), kôd poništene kartice, `12345`,
  `abcdefghij`, `12345678901` (11 cifara).
- **Test podaci:** kao gore
- **Očekivani rezultat:** crvena poruka u statusnoj liniji ispod „Skenirajte karticu“, bez dijaloga,
  nestaje nakon 5 s:
  „Nepoznata kartica.“ · „Kartica je poništena. Pronađite člana pretragom.“ ·
  „Neispravan kod kartice.“ (za sva tri neispravna oblika).
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [REC-12] Član je već u teretani (ručna prijava)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** član je unutra
- **Koraci:** pronađite tog člana pretragom na recepciji i kliknite na njegovo ime u rezultatima.
- **Test podaci:** —
- **Očekivani rezultat:** poruka „Član je već u teretani.“, ništa se ne evidentira.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [REC-13] Pretraga člana na recepciji
- **Prioritet:** Visoko
- **Uloga / preduslovi:** postoji bar 5 članova
- **Koraci:** kucajte redom: broj člana (`3`), dio imena (`ani`), dio imena bez kvačica (`anic`),
  dio telefona (`069`), nešto što ne postoji (`zzzz`).
- **Test podaci:** kao gore
- **Očekivani rezultat:** rezultati se pojavljuju oko 250 ms nakon prestanka kucanja, najviše 8
  redova. Pretraga po imenu ignoriše velika/mala slova i kvačice (`anic` nalazi „Anić“). Za `zzzz`:
  „Nema članova koji odgovaraju pretrazi.“ Svaki red ima dugme [Otvori profil].
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [REC-14] Escape i brisanje pretrage
- **Prioritet:** Nisko
- **Uloga / preduslovi:** rezultati pretrage otvoreni
- **Koraci:** pritisnite Esc; zatim obrišite tekst ručno.
- **Test podaci:** —
- **Očekivani rezultat:** lista rezultata se zatvara i polje se prazni; ekran ostaje upotrebljiv za
  skeniranje.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [REC-15] Skeniranje ne smije da krade tastaturu dok kucate u polje
- **Prioritet:** Visoko
- **Uloga / preduslovi:** recepcija
- **Koraci:** kliknite u polje pretrage i otkucajte `1234567890` pa Enter.
- **Test podaci:** `1234567890`
- **Očekivani rezultat:** to je pretraga, a **ne** skeniranje: ne pojavljuje se poruka o kartici.
  Isto važi dok je otvoren dijalog „Novi član“, „Dnevna karta“ ili „Trošak“.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [REC-16] Slučajno kucanje po ekranu
- **Prioritet:** Srednje
- **Uloga / preduslovi:** recepcija, ništa nije fokusirano
- **Koraci:** otkucajte `55` pa Enter; zatim slovo `a` pa Enter.
- **Test podaci:** `55`, `a`
- **Očekivani rezultat:** `55` + Enter daje „Neispravan kod kartice.“ Samo slovo `a` (bez prethodne
  cifre) se ignoriše i Enter ne pokreće ništa. (Vidi SUSPECT-09.)
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [REC-17] Lista „U teretani“ i brojači
- **Prioritet:** Visoko
- **Uloga / preduslovi:** prijavite dva člana
- **Koraci:** pogledajte desnu tablu; sačekajte minut; odjavite jednog dugmetom [Odjavi] iz liste.
- **Test podaci:** —
- **Očekivani rezultat:** naslov „U teretani: 2 · Danas dolazaka: N“; svaki red ima ime, broj člana,
  oznaku vrste dolaska, vrijeme ulaska i trajanje koje se osvježava svakog minuta. Nakon [Odjavi]
  član nestaje, a brojač „U teretani“ pada na 1. Prazno stanje: „Trenutno nema nikoga u teretani.“
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [REC-18] Zvuk se uključuje jednom po sesiji browsera
- **Prioritet:** Srednje
- **Uloga / preduslovi:** novi „incognito“ prozor, prijava kao recepcioner
- **Koraci:** otvorite `/reception` i pogledajte preklop preko ekrana; kliknite [Počni rad];
  osvježite stranicu.
- **Test podaci:** —
- **Očekivani rezultat:** preklop sa tekstom „Uključuje zvuk za rezultate skeniranja.“ i dugmetom
  [Počni rad] pojavljuje se jednom; zaglavlje i navigacija ostaju upotrebljivi ispod njega.
  Poslije klika se više ne pojavljuje do zatvaranja browsera.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [REC-19] Dolazak preko ponoći i trajanje
- **Prioritet:** Srednje
- **Uloga / preduslovi:** član prijavljen prije ponoći (moguće samo ako testirate kasno uveče ili
  naknadnim unosom, vidi FIN-16)
- **Koraci:** prijavite člana kasno uveče, ostavite ga do poslije ponoći i odjavite.
- **Test podaci:** —
- **Očekivani rezultat:** dolazak se broji u dan **kada je počeo**; trajanje je ispravno (prelazi
  ponoć). Noćni posao u 23:00 ga automatski odjavljuje (vidi JOB-01), pa to provjerite prije 23:00.
- **Gdje provjeriti:** profil člana → „Dolasci“; `/stats/visits`
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [REC-20] Ručna prijava iz profila člana
- **Prioritet:** Visoko
- **Uloga / preduslovi:** član nije u teretani
- **Koraci:** `/members` → otvorite profil → [Ručna prijava].
- **Test podaci:** —
- **Očekivani rezultat:** prolazi isti tok kao skeniranje (zeleni/žuti/crveni dijalog), a dolazak je
  u bazi označen kao ručni.
- **Gdje provjeriti:** UI; profil → „Dolasci“
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [REC-21] Dva pulta prijavljuju istog člana (trka)
- **Prioritet:** Srednje
- **Uloga / preduslovi:** dva browsera, oba na recepciji, isti član nije unutra
- **Koraci:** skenirajte istu karticu u oba browsera što je moguće bliže u vremenu.
- **Test podaci:** —
- **Očekivani rezultat:** tačno jedan dolazak je evidentiran; drugi browser dobija
  „Član je već u teretani.“ ili pitanje o odjavi. Nikada dva otvorena dolaska za istog člana.
- **Gdje provjeriti:** UI; profil člana → „Dolasci“
- [ ] Prošlo  [ ] Palo  Napomena: ____

---

### 3.5 MEM — članovi (S-05, S-06, S-07, S-09)

### [MEM-01] Novi član sa članarinom i odmah prijavljen (happy path)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** Recepcioner sa otvorenom smjenom; prazna kartica
- **Koraci:**
  1. Skenirajte praznu karticu (otvara se „Novi član“).
  2. Ime: `Ana`, Prezime: `Anić`, Telefon: `069123456`, Email: `ana.anic@primjer.me`,
     Datum rođenja: `15.03.1995`.
  3. Vrsta članarine: `Mjesečna`.
  4. Provjerite da se ispod pojavljuju „Početak“ i „Važi do“.
  5. Način plaćanja: [Gotovina].
  6. Ostavite uključeno „Prijavi odmah“.
  7. [Naplati i sačuvaj].
- **Test podaci:** kao gore
- **Očekivani rezultat:** poruka „Član #N je kreiran. Upišite ime olovkom na karticu: Ana Anić.“
  Poslije [Zatvori] odmah slijedi **zeleni** dijalog prijave dolaska. Član je u listi „U teretani“.
  Na `/payments/today` postoji uplata od 79,00 € sa opisom „Mjesečna – Ana Anić“.
- **Gdje provjeriti:** UI; `/payments/today`; profil člana
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MEM-02] Bez skenirane kartice se ne može sačuvati (BR-033)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** recepcija
- **Koraci:** kliknite [Novi član] iz dugmadi na recepciji (bez skeniranja), popunite sve ostalo i
  pokušajte da sačuvate.
- **Test podaci:** —
- **Očekivani rezultat:** dugme za čuvanje je onemogućeno dok kartica nije potvrđena; uz polje
  kartice stoji „Skenirajte praznu karticu.“
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MEM-03] Kartica koja nije prazna
- **Prioritet:** Visoko
- **Uloga / preduslovi:** kartica koja je već dodijeljena nekom članu
- **Koraci:** u dijalogu „Novi član“ u polje kartice unesite kôd već dodijeljene kartice.
- **Test podaci:** kartica člana Ana Anić
- **Očekivani rezultat:** „Ova kartica nije prazna.“ i dugme za čuvanje ostaje onemogućeno.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MEM-04] Validacija polja — prazna i predugačka
- **Prioritet:** Kritično
- **Uloga / preduslovi:** dijalog „Novi član“, kartica potvrđena
- **Koraci:** pokušajte da sačuvate sa praznim poljima; zatim sa predugačkim vrijednostima.
- **Test podaci:**
  - Ime prazno → očekivano „Unesite ime (1–50 znakova).“
  - Ime 51 znak (`AAAA…`) → ista poruka; ime od tačno 50 znakova → prolazi
  - Prezime prazno / 51 znak → „Unesite prezime (1–50 znakova).“
  - Email `ana@` → „Unesite ispravan email.“; email od 255 znakova → ista poruka
  - Samo razmaci `   ` u imenu → „Unesite ime (1–50 znakova).“
- **Očekivani rezultat:** poruke stoje **ispod odgovarajućeg polja**, ništa nije sačuvano, dijalog
  ostaje otvoren sa unesenim podacima.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MEM-05] Telefon — normalizacija i granice (BR-041)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** dijalog „Novi član“
- **Koraci:** za svaku vrijednost pokušajte da sačuvate i pogledajte kako je broj upisan u profilu.
- **Test podaci:**
  | Unos | Očekivano |
  |---|---|
  | `069123456` | prihvaćeno, zapisano kao `+38269123456` |
  | `+38269123456` | prihvaćeno kako jeste |
  | `0038269123456` | prihvaćeno kao `+38269123456` |
  | `069 123 456` | prihvaćeno (razmaci se uklanjaju) |
  | `069-123/456` | prihvaćeno (crtice i kose crte se uklanjaju) |
  | `1234567` (7 cifara) | „Unesite ispravan broj telefona sa pozivnim brojem.“ |
  | `06912345a` | ista poruka |
  | prazno | ista poruka (telefon je obavezan) |
  | `+3821234567890123456` | ista poruka (više od 15 cifara) |
- **Očekivani rezultat:** kako je u tablici; ispravan broj se u profilu prikazuje u `+382…` obliku.
- **Gdje provjeriti:** UI; profil člana
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MEM-06] Datum rođenja — format i granice
- **Prioritet:** Kritično
- **Uloga / preduslovi:** dijalog „Novi član“
- **Koraci:** probajte svaku vrijednost.
- **Test podaci:**
  | Unos | Očekivano |
  |---|---|
  | `15.03.1995` | prihvaćeno |
  | `1.3.1995` | prihvaćeno (jednocifreni dan i mjesec) |
  | `01.01.1900` | prihvaćeno (donja granica) |
  | `31.12.1899` | „Unesite datum rođenja (dd.mm.gggg), od 01.01.1900 do danas.“ |
  | `31.02.2000` | ista poruka (ne postoji taj dan) |
  | `29.02.2024` | prihvaćeno (prestupna godina) |
  | `29.02.2023` | odbijeno (nije prestupna) |
  | **sutrašnji datum** | mora biti odbijeno (vidi SUSPECT-06 — provjerite koju poruku dobijete) |
  | `15/03/1995` | odbijeno |
  | prazno | odbijeno |
- **Očekivani rezultat:** kako je u tablici. Dugme sa ikonicom kalendara otvara biranje datuma i
  upisuje izabrani datum u polje u obliku `dd.mm.gggg`.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MEM-07] Naša slova, ćirilica, emoji i razmaci
- **Prioritet:** Visoko
- **Uloga / preduslovi:** dijalog „Novi član“
- **Koraci:** napravite članove sa vrijednostima ispod i pogledajte kako se prikazuju u listi,
  profilu, pretrazi i PDF izvještaju smjene.
- **Test podaci:**
  - Ime `Ćira`, Prezime `Ćirić Šušnjić-Žižić`
  - Ime `Ђорђе` (ćirilica), Prezime `Петровић`
  - Ime `  Ana  ` (razmaci ispred i iza)
  - Ime `Ana😀` (emoji)
- **Očekivani rezultat:** naša slova i ćirilica se svuda prikazuju ispravno (lista, profil,
  pretraga, PDF). Razmaci ispred i iza se uklanjaju prije čuvanja. Emoji: ako se prihvata, mora se
  ispravno prikazati svuda uključujući PDF; ako PDF prikazuje kvadratiće, zabilježite kao bug.
- **Gdje provjeriti:** UI; PDF izvještaja smjene; PDF kartica
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MEM-08] Upozorenje o duplikatu (BR-043)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** postoji član sa telefonom `+38269123456`
- **Koraci:** u novom unosu upišite isti telefon i **izađite iz polja** (Tab).
- **Test podaci:** `069123456`
- **Očekivani rezultat:** upozorenje „Već postoji član sa istim telefonom ili emailom:“ sa
  brojem i imenom postojećeg člana, dugmetom [Otvori postojećeg] i dugmetom [Ipak sačuvaj].
  Ovo je **upozorenje, ne zabrana** — [Ipak sačuvaj] pravi drugog člana.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MEM-09] Lista članova: pretraga, filter i straničenje
- **Prioritet:** Visoko
- **Uloga / preduslovi:** bar 5 članova, od toga bar jedan bez aktivne članarine
- **Koraci:**
  1. `/members` — prebrojte kolone.
  2. Pretražite po imenu, po broju, po dijelu telefona.
  3. Promijenite filter „Status“ na „Sa aktivnom članarinom“, pa „Bez aktivne članarine“, pa „Svi“.
  4. Ako ima više od 25 članova, pređite na sljedeću stranu i nazad.
  5. Ručno izmijenite adresu: `?page=999`, `?page=-1`, `?page=abc`, `?status=izmisljeno`.
- **Test podaci:** kao gore
- **Očekivani rezultat:** kolone: Broj, Ime i prezime, Telefon, Status, Posljednji dolazak.
  Filteri rade; straničenje pokazuje „Strana X od Y“. Nevažeći parametri u adresi ne ruše stranicu:
  `page=999` daje praznu listu, `page=-1` i `page=abc` se ponašaju kao prva strana,
  nepoznat `status` se ponaša kao „Svi“. Prazna pretraga: „Nema članova koji odgovaraju pretrazi.“
- **Gdje provjeriti:** UI, adresna linija
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MEM-10] Prazno stanje kad nema nijednog člana
- **Prioritet:** Srednje
- **Uloga / preduslovi:** baza bez ijednog člana (provjerljivo samo na svježoj bazi)
- **Koraci:** otvorite `/members`.
- **Test podaci:** —
- **Očekivani rezultat:** „Još nema članova. Skenirajte praznu karticu na recepciji da dodate prvog.“
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MEM-11] Profil člana i tri kartice
- **Prioritet:** Visoko
- **Uloga / preduslovi:** član sa članarinom, uplatom i bar jednim dolaskom
- **Koraci:** otvorite profil, obiđite kartice „Članarine“, „Uplate“, „Dolasci“; osvježite stranicu
  dok ste na kartici „Dolasci“; koristite dugme nazad.
- **Test podaci:** `Ana Anić`
- **Očekivani rezultat:** zaglavlje pokazuje ime, broj člana, „Aktivna kartica <kôd>“ i, ako ima
  neplaćenih, „Neplaćeni dolasci: N“. Izabrana kartica se vidi u adresi (`?tab=dolasci`) i ostaje
  ista nakon osvježavanja. Prazna stanja: „Član još nema članarinu.“, „Nema uplata za prikaz.“,
  „Nema dolazaka.“
- **Gdje provjeriti:** UI, adresna linija
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MEM-12] Straničenje dolazaka u profilu
- **Prioritet:** Nisko
- **Uloga / preduslovi:** član sa više od 20 dolazaka (može se napraviti naknadnim unosom)
- **Koraci:** kartica „Dolasci“ → [Sljedeća] → [Prethodna]; probajte `?tab=dolasci&strana=999`.
- **Test podaci:** —
- **Očekivani rezultat:** po 20 dolazaka po strani; nevažeći broj strane ne ruši stranicu.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MEM-13] Izmjena podataka o članu
- **Prioritet:** Visoko
- **Uloga / preduslovi:** bilo koja uloga (BR-045)
- **Koraci:** profil → [Uredi podatke] → promijenite prezime i telefon → sačuvajte.
- **Test podaci:** prezime `Anić-Marković`, telefon `068999111`
- **Očekivani rezultat:** „Podaci su sačuvani.“, novi podaci se odmah vide u profilu i u listi.
  Ista validacija kao pri unosu (probajte prazno ime — mora pasti).
- **Gdje provjeriti:** UI; vlasnik: `/finance/audit` mora imati zapis izmjene
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MEM-14] Anonimizacija smije samo vlasnik/administrator (BR-046)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** prvo recepcioner i menadžer, zatim vlasnik
- **Koraci:** otvorite profil člana kao recepcioner, pa kao menadžer — potražite dugme
  [Anonimiziraj]. Zatim kao vlasnik.
- **Test podaci:** —
- **Očekivani rezultat:** dugmeta nema za recepcionera i menadžera; postoji za vlasnika i
  administratora.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MEM-15] Anonimizacija traži tačan broj člana
- **Prioritet:** Kritično
- **Uloga / preduslovi:** Vlasnik; član kojeg **ne planirate više koristiti** u testovima
- **Koraci:**
  1. Profil → [Anonimiziraj] → pročitajte tekst.
  2. Unesite pogrešan broj → potvrdite.
  3. Unesite tačan broj → [Anonimiziraj trajno].
- **Test podaci:** pogrešan `999`, pa tačan broj člana
- **Očekivani rezultat:** korak 2: „Upisani broj se ne poklapa sa brojem člana.“ Korak 3:
  „Član je anonimiziran.“ Ime, telefon, email i datum rođenja su obrisani; u profilu stoji traka
  „Član je anonimiziran.“ Članarine, uplate i dolasci **ostaju**. Anonimizovan član se više ne
  pojavljuje u pretrazi ni u statistici.
- **Gdje provjeriti:** UI; `/members` pretraga; `/stats/visits` → „Najčešći članovi“
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MEM-16] Izgubljena kartica (F-11, BR-034)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** otvorena smjena; član sa aktivnom karticom; jedna prazna kartica
- **Koraci:** profil → [Izgubljena kartica] → pročitajte naknadu → [Nastavi] → skenirajte novu
  praznu karticu → izaberite način plaćanja → potvrdite.
- **Test podaci:** naknada iz podešavanja (podrazumijevano 5,00 €)
- **Očekivani rezultat:** tekst „Naknada za novu karticu: 5,00 €“; nakon potvrde
  „Nova kartica dodijeljena. Stara kartica je poništena.“ U profilu je novi kôd kartice.
  Na `/payments/today` je uplata „Zamjenska kartica – <ime>“. Skeniranje **stare** kartice daje
  „Kartica je poništena. Pronađite člana pretragom.“
- **Gdje provjeriti:** UI; `/payments/today`
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MEM-17] Zamjena kartice bez otvorene smjene
- **Prioritet:** Visoko
- **Uloga / preduslovi:** nema otvorene smjene; prijavljeni kao vlasnik
- **Koraci:** pokušajte [Izgubljena kartica].
- **Test podaci:** —
- **Očekivani rezultat:** radnja je onemogućena ili odbijena porukom „Nema otvorene smjene.
  Recepcioner mora biti prijavljen.“
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MEM-18] HTML i SQL znakovi u podacima člana
- **Prioritet:** Kritično (bezbjednost)
- **Uloga / preduslovi:** dijalog „Novi član“
- **Koraci:** napravite člana sa imenom `<script>alert(1)</script>` i prezimenom `O'Brien";--`,
  pa otvorite njegov profil, listu članova, `/payments/today` i PDF izvještaja smjene.
- **Test podaci:** kao gore
- **Očekivani rezultat:** tekst se svuda prikazuje **doslovno**, kao običan tekst. Nema iskačućeg
  prozora, nema greške u konzoli, PDF se pravi normalno. Apostrof u prezimenu se uredno čuva.
- **Gdje provjeriti:** UI, konzola browsera, PDF
- [ ] Prošlo  [ ] Palo  Napomena: ____

---

### 3.6 MSHIP — članarine (S-08, BR-050 do BR-060)

### [MSHIP-01] Prodaja nove članarine postojećem članu
- **Prioritet:** Kritično
- **Uloga / preduslovi:** otvorena smjena; član bez aktivne članarine
- **Koraci:** profil člana → [Nova članarina] → „Vrsta članarine“ = `Mjesečna` → provjerite
  „Početak“ i „Važi do“ → [Gotovina] → [Naplati i sačuvaj].
- **Test podaci:** Mjesečna, 79 €
- **Očekivani rezultat:** „Članarina sačuvana.“ Početak je **danas**, uz obrazloženje
  „Počinje danas“, a „Važi do“ je isti dan sljedećeg mjeseca umanjen za jedan dan.
  Na kartici „Članarine“ je nova članarina sa statusom „Aktivna“.
- **Gdje provjeriti:** UI; `/payments/today`
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MSHIP-02] Produženje se nadovezuje na postojeću članarinu (BR-052, E2)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** član sa članarinom koja još traje
- **Koraci:** profil → [Produži] u redu te članarine → izaberite `Mjesečna`.
- **Test podaci:** —
- **Očekivani rezultat:** prije čuvanja piše „Nastavlja se na članarinu koja važi do dd.mm.gggg“,
  a „Početak“ je **prvi dan poslije** isteka postojeće. Nakon čuvanja status nove članarine je
  „Buduća“.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MSHIP-03] Članarina počinje od prvog neplaćenog dolaska (E3)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** član `Božo Božović` ima 1–2 neplaćena dolaska u posljednjih nekoliko dana
- **Koraci:** profil → [Nova članarina] → `Mjesečna` → pogledajte obrazloženje → sačuvajte.
- **Test podaci:** —
- **Očekivani rezultat:** obrazloženje „Počinje od prvog neplaćenog dolaska dd.mm.gggg“, a početak
  je datum tog dolaska. Nakon čuvanja, ti dolasci **više nisu neplaćeni** (oznaka „Neplaćeno“ je
  nestala), a značka „Neplaćeni dolasci“ u zaglavlju profila je nestala.
- **Gdje provjeriti:** UI; profil → „Dolasci“
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MSHIP-04] Prestari neplaćeni dolasci (E5, upozorenje)
- **Prioritet:** Srednje
- **Uloga / preduslovi:** član sa neplaćenim dolaskom starijim od trajanja izabranog plana
  (npr. dolazak prije 20 dana + plan „Nedeljna“ od 7 dana); dolazak napravite naknadnim unosom (FIN-16)
- **Koraci:** profil → [Nova članarina] → `Nedeljna`.
- **Test podaci:** —
- **Očekivani rezultat:** upozorenje „Neplaćeni dolasci su stariji od trajanja ove članarine i
  ostaju neplaćeni.“, a početak je **danas**. Nakon čuvanja ti dolasci ostaju neplaćeni.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MSHIP-05] Samo vlasnik smije da pomjeri početak (BR-052 korak 4)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** prvo recepcioner, zatim vlasnik
- **Koraci:** u dijalogu prodaje potražite [Promijeni početak]; kao vlasnik ga upotrijebite i
  unesite datum `01.01.2026`.
- **Test podaci:** `01.01.2026`
- **Očekivani rezultat:** recepcioner nema tu mogućnost (ili je odbijena porukom
  „Nemate dozvolu za ovu radnju.“). Vlasniku se, čim unese datum, „Važi do“ preračunava i
  obrazloženje glasi „Početak je odredio vlasnik.“
  Neispravan datum (`32.13.2026`) daje „Unesite datum u formatu dd.mm.gggg.“
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MSHIP-06] Iznos može da mijenja samo vlasnik (BR-059)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** prvo recepcioner, zatim vlasnik
- **Koraci:** u dijalogu prodaje mjesečne članarine potražite [Promijeni iznos]; kao vlasnik
  postavite iznos na `70`.
- **Test podaci:** `70`
- **Očekivani rezultat:** recepcioner ne može promijeniti iznos (ili dobija „Samo vlasnik može
  mijenjati iznos.“). Vlasnik može, i uplata je 70,00 €.
- **Gdje provjeriti:** UI; `/payments/today`
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MSHIP-07] Personalni: iznos i broj termina su obavezni
- **Prioritet:** Kritično
- **Uloga / preduslovi:** otvorena smjena
- **Koraci:** dijalog prodaje → `Personalni` → ostavite iznos i termine prazne → [Naplati i sačuvaj].
- **Test podaci:** —
- **Očekivani rezultat:** „Unesite iznos, na primjer 79 ili 79,50.“ uz iznos i „Unesite broj termina
  od 1 do 50.“ uz termine. Uz polje iznosa stoji podsjetnik „Minimalno 80,00 €“.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MSHIP-08] Personalni: minimalna cijena (E13)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** minimalna cijena personalnog je 80 € (S-27)
- **Koraci:** prodajte `Personalni` sa iznosom `79,99`, trenerom Tamarom i 8 termina.
- **Test podaci:** `79,99`
- **Očekivani rezultat:** „Iznos ne može biti manji od 80.00 €.“ (tačna vrijednost iz podešavanja).
  Sa `80` prolazi.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MSHIP-09] Broj termina — granice
- **Prioritet:** Visoko
- **Uloga / preduslovi:** prodaja personalne članarine
- **Koraci:** probajte redom `0`, `1`, `50`, `51`, `2.5`, `-3`, `abc`.
- **Test podaci:** kao gore
- **Očekivani rezultat:** `1` i `50` prolaze; `0`, `51`, `2.5`, `-3`, `abc` daju
  „Unesite broj termina od 1 do 50.“
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MSHIP-10] Iznos — format i granice
- **Prioritet:** Visoko
- **Uloga / preduslovi:** prodaja personalne članarine (polje iznosa je slobodno)
- **Koraci:** probajte `100`, `100,50`, `100.50`, `100,555`, `-100`, `0`, `abc`, prazno,
  `999999999`.
- **Test podaci:** kao gore
- **Očekivani rezultat:** prihvataju se i zarez i tačka, najviše dvije decimale. Tri decimale,
  negativan iznos, slova i prazno daju „Unesite iznos, na primjer 79 ili 79,50.“
  `0` pada na minimalnoj cijeni (E13). Vrlo veliki iznos mora dati jasnu poruku, ne opštu grešku.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MSHIP-11] Trener je obavezan za Grupni, G+T i Personalni (BR-058)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** otvorena smjena
- **Koraci:** izaberite `Grupni (3x nedeljno)` bez trenera → sačuvajte. Ponovite za `G+T` i
  `Personalni`.
- **Test podaci:** —
- **Očekivani rezultat:** svaki put „Izaberite trenera.“ Za `Mjesečna` polje trenera se ne traži.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MSHIP-12] Način plaćanja je obavezan
- **Prioritet:** Visoko
- **Uloga / preduslovi:** prodaja bilo koje članarine
- **Koraci:** popunite sve osim načina plaćanja → [Naplati i sačuvaj].
- **Test podaci:** —
- **Očekivani rezultat:** „Izaberite način plaćanja.“
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MSHIP-13] Granica trajanja: 31.01 + 1 mjesec (E14)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik (može da postavi početak)
- **Koraci:** prodajte `Mjesečna` sa početkom `31.01.2027` i pogledajte „Važi do“. Ponovite sa
  početkom `31.01.2028` (prestupna godina) i sa `31.12.2026` (prelazak godine).
- **Test podaci:** kao gore
- **Očekivani rezultat:** `31.01.2027` → važi do `27.02.2027`; `31.01.2028` → do `28.02.2028`;
  `31.12.2026` → do `30.01.2027`. (Posljednji važeći dan je uključen.)
- **Gdje provjeriti:** UI (prikaz „Važi do“ prije čuvanja)
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MSHIP-14] Iskorišćeni termini i status „Iskorištena“ (BR-054, BR-055)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** član sa planom `Mjesečna 12 termina` (12 dolazaka u teretanu)
- **Koraci:** prijavite i odjavite člana nekoliko puta i pratite „Preostalo termina“ u zelenom
  dijalogu; naknadnim unosom dodajte dolaske dok ne potrošite svih 12.
- **Test podaci:** —
- **Očekivani rezultat:** brojač opada 12, 11, 10 … Kada dođe na 0, status članarine postaje
  „Iskorištena“, a sljedeći dolazak je **neplaćen** (žuti dijalog).
- **Gdje provjeriti:** UI; profil → „Članarine“, kolona „Preostalo termina“
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MSHIP-15] [Produži članarinu] iz upozorenja o neplaćenom dolasku
- **Prioritet:** Visoko
- **Uloga / preduslovi:** žuti ili crveni dijalog iz REC-06/REC-07
- **Koraci:** kliknite [Produži članarinu] → prodajte `Mjesečna` → sačuvajte.
- **Test podaci:** —
- **Očekivani rezultat:** dijalog prodaje se otvara za tog člana, sa predloženim trenerom iz
  posljednje članarine iste vrste. Nakon prodaje, neplaćeni dolasci koje nova članarina pokriva
  postaju plaćeni.
- **Gdje provjeriti:** UI; profil → „Dolasci“
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MSHIP-16] Prodaja bez otvorene smjene
- **Prioritet:** Kritično
- **Uloga / preduslovi:** nema otvorene smjene; vlasnik prijavljen
- **Koraci:** profil člana → [Nova članarina].
- **Test podaci:** —
- **Očekivani rezultat:** dugme je onemogućeno sa razlogom „Nema otvorene smjene. Recepcioner mora
  biti prijavljen.“
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [MSHIP-17] Promjena cijene plana ne mijenja prodate članarine (BR-004)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik
- **Koraci:**
  1. Prodajte `Mjesečna` za 79 €.
  2. `/settings/plans` → izmijenite cijenu `Mjesečna` na `89` → sačuvajte.
  3. Pogledajte staru uplatu, pa prodajte novu mjesečnu članarinu.
- **Test podaci:** `89`
- **Očekivani rezultat:** stara uplata i dalje glasi 79,00 €; nova je 89,00 €. Na ekranu planova
  stoji napomena „Promjena cijene važi samo za nove prodaje.“ Vratite cijenu na 79 nakon testa.
- **Gdje provjeriti:** UI; `/payments/today`
- [ ] Prošlo  [ ] Palo  Napomena: ____

---


### 3.7 PAY — dnevne karte, ispravke, poništavanja, troškovi pulta

### [PAY-01] Prodaja dnevnih karata (happy path)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** otvorena smjena; plan „Dnevna karta“ postoji (10 €)
- **Koraci:** `/reception` → [Dnevna karta] → strelicom [Jedna više] postavite 3 → [Gotovina] →
  [Naplati].
- **Test podaci:** 3 karte
- **Očekivani rezultat:** dok mijenjate količinu, red „Ukupno: …“ se osvježava (3 × 10 = 30,00 €).
  Nakon čuvanja poruka „Prodato: 3 × dnevna karta = 30,00 €“. Na `/payments/today` je stavka
  „Dnevna karta × 3“ na 30,00 €.
- **Gdje provjeriti:** UI; `/payments/today`
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [PAY-02] Dnevne karte — granice količine
- **Prioritet:** Visoko
- **Uloga / preduslovi:** dijalog „Dnevna karta“
- **Koraci:** pokušajte da postavite količinu na `0`, `-1`, `21`, `abc`, `2.5`; probajte i da
  ukucate broj direktno u polje, ne samo strelicama.
- **Test podaci:** kao gore
- **Očekivani rezultat:** polje se samo vraća u opseg 1–20: [Jedna manje] je onemogućeno na 1, a
  [Jedna više] na 20. Ako ipak prođe neispravna vrijednost, server odgovara
  „Provjerite unesene podatke.“ i ništa se ne evidentira.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [PAY-03] Dnevna karta bez načina plaćanja
- **Prioritet:** Visoko
- **Uloga / preduslovi:** dijalog „Dnevna karta“
- **Koraci:** ne birajte način plaćanja → [Naplati].
- **Test podaci:** —
- **Očekivani rezultat:** „Izaberite način plaćanja.“
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [PAY-04] Dnevna karta kada plan nije podešen
- **Prioritet:** Nisko
- **Uloga / preduslovi:** Vlasnik privremeno deaktivira plan „Dnevna karta“ u `/settings/plans`
- **Koraci:** otvorite [Dnevna karta] na recepciji.
- **Test podaci:** —
- **Očekivani rezultat:** „Dnevna karta nije podešena. Vlasnik je dodaje u planovima.“
  Vratite plan u aktivno stanje poslije testa.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [PAY-05] Trošak sa pulta (happy path)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** otvorena smjena
- **Koraci:** `/reception` → [Trošak] → Kategorija `Potrošni materijal`, Opis `Sredstvo za čišćenje`,
  Iznos `12,50` → sačuvajte.
- **Test podaci:** kao gore
- **Očekivani rezultat:** u dijalogu stoji nepromjenjiva napomena „Plaćeno iz kase · danas“.
  Nakon čuvanja „Trošak je sačuvan.“ Stavka je na `/payments/today` u sekciji troškova.
- **Gdje provjeriti:** UI; `/payments/today`
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [PAY-06] Trošak — validacija
- **Prioritet:** Visoko
- **Uloga / preduslovi:** dijalog „Trošak“
- **Koraci:** probajte kombinacije ispod.
- **Test podaci:**
  | Unos | Očekivano |
  |---|---|
  | bez kategorije | „Izaberite kategoriju.“ |
  | opis `a` (1 znak) | „Unesite opis (2–200 znakova).“ |
  | opis od 201 znaka | ista poruka |
  | iznos `0` | „Unesite iznos od 0,01 do 10.000,00 €.“ |
  | iznos `0,01` | prolazi (donja granica) |
  | iznos `10000` | prolazi (gornja granica) |
  | iznos `10000,01` | poruka o iznosu |
  | iznos `-5` | poruka o iznosu |
  | iznos `12,345` | poruka o iznosu |
  | iznos `abc` | poruka o iznosu |
- **Očekivani rezultat:** kako je u tablici; poruka stoji ispod pravog polja.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [PAY-07] Kategorija „Plate“ nije dostupna na pultu (D-37)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** dijalog „Trošak“
- **Koraci:** otvorite padajuću listu kategorija.
- **Test podaci:** —
- **Očekivani rezultat:** kategorije `Plate` nema u listi. (Vlasnik je ima na `/finance/expenses`.)
  Ako se ipak pošalje, odgovor je „Ova kategorija nije dozvoljena.“
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [PAY-08] Ispravka uplate — način i napomena (BR-094)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** Recepcioner; uplata iz **njegove otvorene** smjene
- **Koraci:** `/payments/today` → [Ispravi] na uplati → promijenite način na „Platna kartica“,
  unesite napomenu `Greška pri naplati` → sačuvajte.
- **Test podaci:** napomena 20 znakova
- **Očekivani rezultat:** „Uplata je ispravljena.“ Način je promijenjen. Polje iznosa je
  recepcioneru nedostupno ili daje „Samo vlasnik može mijenjati iznos.“
- **Gdje provjeriti:** UI; vlasnik: `/finance/audit`
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [PAY-09] Ispravka iznosa je vlasnikova
- **Prioritet:** Kritično
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** `/payments/today` → [Ispravi] → promijenite iznos na `70` → sačuvajte.
- **Test podaci:** `70`
- **Očekivani rezultat:** iznos je izmijenjen i vidi se u dnevnim ukupnostima i u izvještaju smjene.
  Napomena duža od 500 znakova daje „Napomena može imati najviše 500 znakova.“
- **Gdje provjeriti:** UI; `/finance/audit`
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [PAY-10] Stavka iz zaključene smjene nije izmjenjiva (AS-14)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** postoji zaključena smjena sa uplatom; prijavljeni kao recepcioner u novoj smjeni
- **Koraci:** otvorite `/payments/today` i potražite stavku iz ranije, zaključene smjene istog dana.
- **Test podaci:** —
- **Očekivani rezultat:** uz nju stoji „Stavka iz zaključene smjene – samo vlasnik je može
  mijenjati.“ i dugmad [Ispravi]/[Poništi] su nedostupna. Vlasnik ih ima. Pokušaj ispravke bez
  dozvole daje „Ova stavka se ne može mijenjati (smjena je zaključena).“
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [PAY-11] Poništavanje uplate traži razlog (BR-095)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** uplata iz otvorene smjene
- **Koraci:** [Poništi] → probajte razlog `ab` (2 znaka), pa 201 znak, pa `Greška u naplati`.
- **Test podaci:** kao gore
- **Očekivani rezultat:** prva dva puta „Unesite razlog (3–200 znakova).“ Treći put
  „Stavka je poništena.“ Stavka ostaje u listi, precrtana, sa oznakom „Poništeno“, i **ne ulazi** u
  ukupnosti smjene.
- **Gdje provjeriti:** UI; `/shift/close` ukupnosti
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [PAY-12] Poništavanje uplate članarine poništava i članarinu (E16)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** član sa članarinom prodatom danas i bar jednim dolaskom koji ona pokriva
- **Koraci:** `/payments/today` → [Poništi] na toj uplati → pročitajte upozorenje → unesite razlog
  → potvrdite → otvorite profil člana.
- **Test podaci:** razlog `Test poništavanja`
- **Očekivani rezultat:** u dijalogu piše „Poništavanjem ove uplate poništava se i članarina, a
  njeni dolasci postaju neplaćeni.“ Nakon potvrde: članarina ima status „Poništena“, dolazak je
  ponovo „Neplaćeno“, a u zaglavlju profila se vraća značka „Neplaćeni dolasci: 1“.
- **Gdje provjeriti:** UI; profil člana (kartice „Članarine“ i „Dolasci“)
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [PAY-13] Poništena stavka se ne poništava dvaput
- **Prioritet:** Srednje
- **Uloga / preduslovi:** poništena uplata iz PAY-11
- **Koraci:** pokušajte ponovo [Ispravi] i [Poništi] na istoj stavci.
- **Test podaci:** —
- **Očekivani rezultat:** dugmad nisu dostupna; ako se zahtjev ipak pošalje, odgovor je jasna
  poruka o grešci, a ne dupli zapis.
- **Gdje provjeriti:** UI; `/finance/audit` (samo jedan zapis poništenja)
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [PAY-14] Poništavanje troška
- **Prioritet:** Visoko
- **Uloga / preduslovi:** trošak iz PAY-05, ista otvorena smjena
- **Koraci:** [Poništi] → razlog `Pogrešan iznos` → potvrdite.
- **Test podaci:** —
- **Očekivani rezultat:** „Stavka je poništena.“ Trošak je precrtan i ne ulazi u „Troškovi iz kase“
  na zaključenju smjene.
- **Gdje provjeriti:** UI; `/shift/close`
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [PAY-15] Prazno stanje ekrana „Uplate danas“
- **Prioritet:** Srednje
- **Uloga / preduslovi:** dan bez uplata (npr. odmah ujutro ili na svježoj bazi)
- **Koraci:** otvorite `/payments/today`.
- **Test podaci:** —
- **Očekivani rezultat:** „Danas još nema uplata.“ i „Danas još nema troškova.“ (odnosno
  „Danas još nema prodaje.“ za magacin).
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [PAY-16] Dupli klik na [Naplati]
- **Prioritet:** Visoko
- **Uloga / preduslovi:** dijalog dnevne karte ili prodaje članarine
- **Koraci:** kliknite dugme dvaput vrlo brzo.
- **Test podaci:** —
- **Očekivani rezultat:** evidentira se **tačno jedna** uplata. Dugme se onemogućava dok traje
  čuvanje i prikazuje indikator učitavanja.
- **Gdje provjeriti:** UI; `/payments/today` (broj stavki)
- [ ] Prošlo  [ ] Palo  Napomena: ____

---

### 3.8 STO — magacin (S-13, BR-140 do BR-144)

### [STO-01] Unos nove robe iz kase
- **Prioritet:** Visoko
- **Uloga / preduslovi:** otvorena smjena
- **Koraci:** `/storage` → [Nova roba] za proizvod `Voda` → Količina `24`, Nabavna cijena po komadu
  `0,35`, Plaćanje `Iz kase` → sačuvajte.
- **Test podaci:** kao gore
- **Očekivani rezultat:** „Roba je evidentirana.“ Stanje postaje 24, nabavna cijena proizvoda
  postaje 0,35 €. Na `/payments/today` se pojavljuje trošak kategorije „Roba za prodaju“ od 8,40 €.
- **Gdje provjeriti:** UI; `/payments/today`
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [STO-02] Unos robe van kase
- **Prioritet:** Visoko
- **Uloga / preduslovi:** može i bez otvorene smjene
- **Koraci:** [Nova roba] → Količina `12`, cijena `0,30`, Plaćanje `Van kase` → sačuvajte.
- **Test podaci:** —
- **Očekivani rezultat:** stanje raste za 12; trošak je zabilježen bez načina plaćanja
  („Van kase“) i **ne** umanjuje očekivanu gotovinu u smjeni.
- **Gdje provjeriti:** UI; `/shift/close` („Troškovi iz kase“ se ne mijenja)
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [STO-03] Nabavna cijena — granice (D-55)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** dijalog „Nova roba“
- **Koraci:** probajte `0`, `0,001`, `0,01`, `-1`, `abc`, prazno.
- **Test podaci:** kao gore
- **Očekivani rezultat:** samo `0,01` i više prolazi; ostalo daje
  „Nabavna cijena mora biti najmanje 0,01 €.“ Besplatna isporuka nije dozvoljena.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [STO-04] Količina — granice
- **Prioritet:** Visoko
- **Uloga / preduslovi:** dijalozi „Nova roba“ i „Prodaja“
- **Koraci:** probajte `0`, `1`, `10000`, `10001`, `-5`, `2.5`, `abc`.
- **Test podaci:** kao gore
- **Očekivani rezultat:** `1` i `10000` prolaze; ostalo daje „Unesite količinu od 1 do 10000.“
  (za prodaju je gornja granica stanje na zalihi).
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [STO-05] Prodaja iz magacina
- **Prioritet:** Visoko
- **Uloga / preduslovi:** stanje veće od 0; otvorena smjena
- **Koraci:** [Prodaja] za `Voda` → Količina `2` → [Gotovina] → [Naplati].
- **Test podaci:** 2 × 1,50 €
- **Očekivani rezultat:** „Ukupno: 3,00 €“ prije naplate; poslije „Prodaja je sačuvana.“
  Stanje pada za 2. Na `/payments/today` je stavka „Voda × 2“.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [STO-06] Prodaja više nego što ima na stanju (E17)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** stanje npr. 5
- **Koraci:** pokušajte da prodate 6 komada (po potrebi ukucajte broj direktno u polje).
- **Test podaci:** 6
- **Očekivani rezultat:** „Nema dovoljno na stanju (stanje: 5).“ Prodaja nije evidentirana i
  stanje se ne mijenja.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [STO-07] Prodaja kada je stanje 0
- **Prioritet:** Srednje
- **Uloga / preduslovi:** proizvod sa stanjem 0
- **Koraci:** pogledajte red proizvoda na `/storage`.
- **Test podaci:** —
- **Očekivani rezultat:** stoji „Nema na stanju.“ i dugme [Prodaja] je nedostupno.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [STO-08] Ispravka i poništavanje prodaje iz magacina
- **Prioritet:** Visoko
- **Uloga / preduslovi:** prodaja iz STO-05 u otvorenoj smjeni
- **Koraci:** `/payments/today` → sekcija „Prodaja iz magacina“ → [Ispravi] (promijenite način) →
  zatim [Poništi] uz razlog `Test`.
- **Test podaci:** —
- **Očekivani rezultat:** ispravka mijenja samo način plaćanja. Poništavanje vraća **količinu na
  stanje** (provjerite na `/storage`) i stavka je precrtana.
- **Gdje provjeriti:** UI; `/storage`
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [STO-09] Poništavanje nabavke kada je roba već prodata (E18)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik; nabavka od 24 komada i prodatih npr. 20, stanje 4
- **Koraci:** `/finance/storage` → u listi „Ulazi robe“ → [Poništi] na toj nabavci.
- **Test podaci:** —
- **Očekivani rezultat:** „Poništavanje nije moguće – stanje bi bilo negativno.“ Ako stanje
  dozvoljava, poništavanje uspijeva i **zajedno s njim** se poništava automatski trošak nabavke.
- **Gdje provjeriti:** UI; `/payments/today` ili `/finance/expenses`
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [STO-10] Trošak nabavke se ne poništava zasebno
- **Prioritet:** Srednje
- **Uloga / preduslovi:** trošak nastao iz nabavke robe
- **Koraci:** pokušajte [Poništi] na tom trošku na `/payments/today` ili `/finance/expenses`.
- **Test podaci:** —
- **Očekivani rezultat:** radnja nije dozvoljena; stoji objašnjenje „Trošak nabavke poništava
  vlasnik zajedno sa nabavkom.“
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [STO-11] Recepcioner ne vidi vrijednost zalihe ni zaradu (BR-144)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Recepcioner
- **Koraci:** otvorite `/storage` i uporedite sa vlasnikovim `/finance/storage`.
- **Test podaci:** —
- **Očekivani rezultat:** recepcioner vidi kolone Proizvod, Stanje, Nabavna cijena, Prodajna
  cijena — ali nigdje ukupnu vrijednost zalihe ni zaradu. Te brojke su samo na vlasnikovom ekranu.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [STO-12] Prazan magacin
- **Prioritet:** Nisko
- **Uloga / preduslovi:** svi proizvodi neaktivni
- **Koraci:** deaktivirajte `Voda` u `/settings/products` i otvorite `/storage`.
- **Test podaci:** —
- **Očekivani rezultat:** „Nema proizvoda. Vlasnik dodaje proizvode u Podešavanjima.“
  Vratite proizvod u aktivno stanje.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

---

### 3.9 CLOSE — zaključenje smjene (S-14, BR-114 do BR-119)

### [CLOSE-01] Pregled ukupnosti prije zaključenja
- **Prioritet:** Kritično
- **Uloga / preduslovi:** Recepcioner sa smjenom u kojoj ima: članarina, dnevna karta, prodaja iz
  magacina, trošak iz kase i jedna poništena stavka
- **Koraci:** `/shift/close` → uporedite brojke sa stavkama na `/payments/today`.
- **Test podaci:** —
- **Očekivani rezultat:** prikazani su „Gotovina (prihod)“, „Platna kartica (prihod)“,
  „Troškovi iz kase“ i „Očekivana gotovina“ (= gotovinski prihod − troškovi iz kase).
  Linija brojača: „Uplate: N · Dnevne karte: N · Prodaja: N · Poništeno: N“.
  Poništene stavke **ne ulaze** u iznose. Ako je neko u teretani: „U teretani je još N osoba.“
- **Gdje provjeriti:** UI; ručno saberite stavke sa `/payments/today`
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [CLOSE-02] Pregled stavki
- **Prioritet:** Srednje
- **Uloga / preduslovi:** ekran S-14
- **Koraci:** kliknite [Pregledaj stavke], pa [Sakrij stavke].
- **Test podaci:** —
- **Očekivani rezultat:** razvija se spisak svih stavki smjene po grupama (uplate, dnevne karte,
  zamjenske kartice, prodaja, troškovi, poništeno). Recepcioner vidi **samo svoje** troškove.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [CLOSE-03] Prebrojana gotovina je obavezna i računa razliku
- **Prioritet:** Kritično
- **Uloga / preduslovi:** ekran S-14
- **Koraci:** pokušajte da zaključite bez unosa; zatim unesite iznos manji od očekivanog, pa veći.
- **Test podaci:** prazno; `abc`; `-10`; `12,345`; očekivano − 5; očekivano + 5
- **Očekivani rezultat:** prazno i neispravni oblici daju „Unesite prebrojanu gotovinu, na primjer
  225 ili 225,50.“ Kod manjeg iznosa piše „Razlika: … (Manjak)“, kod većeg „(Višak)“.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [CLOSE-04] Potvrda i zaključenje smjene
- **Prioritet:** Kritično
- **Uloga / preduslovi:** ekran S-14, unesena prebrojana gotovina
- **Koraci:** [Zaključi smjenu i odjavi me] → pročitajte dijalog → [Zaključi].
- **Test podaci:** —
- **Očekivani rezultat:** dijalog „Zaključivanje smjene“ sa tekstom „Nakon zaključenja nije moguće
  mijenjati stavke ove smjene.“ Tokom čuvanja se vide koraci „Zaključujem smjenu…“,
  „Pravim izvještaj…“, „Šaljem izvještaj…“. Na kraju ste **odjavljeni**, na `/login` piše
  „Smjena je zaključena.“
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [CLOSE-05] Izvještaj smjene je sačuvan i poslat
- **Prioritet:** Kritično
- **Uloga / preduslovi:** nastavak CLOSE-04; `EMAIL_FROM` i `RESEND_API_KEY` podešeni
- **Koraci:** prijavite se kao vlasnik → `/finance/shifts` → nađite tu smjenu → [PDF] → otvorite
  PDF; provjerite kolonu „Email“; provjerite sanduče primaoca iz „Primaoci izvještaja smjene“.
- **Test podaci:** —
- **Očekivani rezultat:** PDF se preuzima pod imenom `smjena-gggg-mm-dd.pdf` i sadrži: teretanu,
  recepcionera, početak i kraj, način zaključenja, sve stavke, ukupnosti, prebrojanu gotovinu,
  razliku i broj osoba u teretani pri zaključenju. Status emaila je „poslato“. Email ima
  naslov „Izvještaj smjene – <ime> – <datum> <od>–<do>“ i PDF u prilogu.
- **Gdje provjeriti:** UI; PDF; email
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [CLOSE-06] Neuspjelo slanje ne ruši zaključenje (BR-118)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** namjerno pokvaren `RESEND_API_KEY` u `.env.local` (restartujte `npm run dev`)
- **Koraci:** zaključite smjenu kao recepcioner; zatim kao vlasnik otvorite `/finance/shifts`.
- **Test podaci:** —
- **Očekivani rezultat:** smjena je **ipak zaključena**, recepcioner je odjavljen, a status emaila
  je „neuspješno“ sa dugmetom [Pošalji ponovo]. Vratite ispravan ključ i kliknite [Pošalji ponovo]
  → status postaje „poslato“ i pojavljuje se „Izvještaj je ponovo poslat.“
- **Gdje provjeriti:** UI; email
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [CLOSE-07] Zaključena smjena se više ne mijenja
- **Prioritet:** Kritično
- **Uloga / preduslovi:** zaključena smjena iz CLOSE-04
- **Koraci:** prijavite se kao isti recepcioner (otvara se nova smjena) i pokušajte [Ispravi] i
  [Poništi] na stavci iz **stare** smjene na `/payments/today`.
- **Test podaci:** —
- **Očekivani rezultat:** radnja je nedostupna; poruka „Ova stavka se ne može mijenjati
  (smjena je zaključena).“ Samo vlasnik može.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [CLOSE-08] Zaključenje kada nema svoje smjene
- **Prioritet:** Srednje
- **Uloga / preduslovi:** Recepcioner B dok smjenu drži A (ne preuzimajte je)
- **Koraci:** otvorite `/shift/close`.
- **Test podaci:** —
- **Očekivani rezultat:** „Nemate otvorenu smjenu.“ bez forme za zaključenje.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

---


### 3.10 SET — korisnici, treneri, planovi, proizvodi, podešavanja (S-23 do S-27)

### [SET-01] Kreiranje recepcionera
- **Prioritet:** Kritično
- **Uloga / preduslovi:** Vlasnik ili Menadžer
- **Koraci:** `/settings/users` → [Novi korisnik] → Uloga `Recepcioner`, Ime i prezime
  `Marija Marić`, Korisničko ime `marija.m`, Privremena lozinka `Lozinka1234` → sačuvajte.
- **Test podaci:** kao gore
- **Očekivani rezultat:** „Korisnik je kreiran.“ Red se pojavljuje u tabeli sa kolonama
  Ime, Korisničko ime/Email, Uloga, Aktivan, Kreiran. Polje za email **nije** prikazano za ovu ulogu.
- **Gdje provjeriti:** UI; prijava novim nalogom vodi na S-01b
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SET-02] Korisničko ime — pravila (doc 07 §3)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** forma „Novi korisnik“
- **Koraci:** probajte vrijednosti ispod.
- **Test podaci:**
  | Unos | Očekivano |
  |---|---|
  | `ab` (2 znaka) | „Korisničko ime može imati samo mala slova, brojeve, tačku i donju crtu (3–30 znakova).“ |
  | `abc` | prolazi (donja granica) |
  | 30 znakova | prolazi (gornja granica) |
  | 31 znak | poruka o korisničkom imenu |
  | `Marija` (veliko slovo) | prihvaćeno i pretvoreno u mala slova, ili poruka — zabilježite šta se desi |
  | `marija-m` (crtica) | poruka o korisničkom imenu |
  | `marija m` (razmak) | poruka o korisničkom imenu |
  | `марија` (ćirilica) | poruka o korisničkom imenu |
  | `marija.m` ponovo | „Korisničko ime je zauzeto.“ |
- **Očekivani rezultat:** kako je u tablici; poruka stoji uz polje korisničkog imena.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SET-03] Ime i prezime i privremena lozinka — granice
- **Prioritet:** Visoko
- **Uloga / preduslovi:** forma „Novi korisnik“
- **Koraci:** probajte ime od 1 znaka, 2 znaka, 100 znakova, 101 znak; lozinku od 7 i od 8 znakova.
- **Test podaci:** kao gore
- **Očekivani rezultat:** 1 i 101 znak: „Unesite ime i prezime (2–100 znakova).“ 2 i 100 prolaze.
  Lozinka od 7: „Lozinka mora imati najmanje 8 znakova.“; 8 prolazi.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SET-04] Administrator se pravi sa emailom
- **Prioritet:** Visoko
- **Uloga / preduslovi:** prijavljeni kao Administrator
- **Koraci:** [Novi korisnik] → Uloga `Administrator` → pogledajte koja se polja traže → unesite
  `novi.admin@primjer.com`; probajte i `nijeemail`.
- **Test podaci:** kao gore
- **Očekivani rezultat:** za administratora se traži **email**, ne korisničko ime.
  `nijeemail` daje „Unesite ispravan email.“; već zauzeta adresa daje „Email je zauzet.“
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SET-05] Izmjena korisnika mijenja samo ime
- **Prioritet:** Srednje
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** [Uredi] na nekom korisniku → pogledajte koja su polja dostupna.
- **Test podaci:** novo ime `Marija Marić-Popović`
- **Očekivani rezultat:** mijenja se samo ime i prezime; korisničko ime i uloga su nepromjenjivi.
  Poruka „Podaci su sačuvani.“
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SET-06] Postavljanje nove lozinke zaposlenom
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** [Nova lozinka] na recepcioneru → unesite `NovaLoz123` → sačuvajte → prijavite se kao
  taj recepcioner.
- **Test podaci:** `NovaLoz123`
- **Očekivani rezultat:** „Nova lozinka je postavljena.“ U dijalogu piše „Korisnik će morati da
  postavi svoju lozinku pri sljedećoj prijavi.“ Pri prijavi zaista slijedi ekran S-01b.
  Kod administratora se u koloni „Lozinka“ odmah vidi nova vrijednost.
- **Gdje provjeriti:** UI; prijava
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SET-07] Deaktivacija i ponovna aktivacija
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik i jedan recepcioner
- **Koraci:** [Deaktiviraj] na recepcioneru → pokušajte da se prijavite tim nalogom → [Aktiviraj] →
  prijavite se ponovo.
- **Test podaci:** —
- **Očekivani rezultat:** „Korisnik je deaktiviran.“, kolona „Aktivan“ = Ne; prijava daje
  „Pogrešno korisničko ime/email ili lozinka.“ Nakon aktivacije prijava radi.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SET-08] Ne možete deaktivirati sami sebe (D-60)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** bilo koji nalog koji smije da administrira
- **Koraci:** u svom redu potražite [Deaktiviraj].
- **Test podaci:** —
- **Očekivani rezultat:** dugmeta nema. Ako se zahtjev ipak pošalje, odgovor je
  „Ne možete deaktivirati sopstveni nalog.“
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SET-09] Posljednji vlasnik (ili administrator) mora ostati (D-60)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** Administrator; u teretani je **jedan** aktivan vlasnik
- **Koraci:** pokušajte da deaktivirate tog vlasnika.
- **Test podaci:** —
- **Očekivani rezultat:** „Mora ostati bar jedan aktivan nalog ove uloge. Prvo dodajte zamjenu.“
  Nakon što napravite drugog vlasnika (`vlasnik.test`), deaktivacija prvog prolazi.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SET-10] Treneri: dodavanje, izmjena, deaktivacija
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik ili Menadžer
- **Koraci:** `/settings/trainers` → [Dodaj trenera] → ime `Novi Trener` → sačuvajte; izmijenite ime;
  skinite kvačicu „Aktivan“ i sačuvajte; provjerite da li se pojavljuje u prodaji članarine.
- **Test podaci:** ime od 1 znaka i 101 znaka za validaciju
- **Očekivani rezultat:** „Sačuvano.“ Kratko/dugo ime daje „Unesite ime trenera (2–100 znakova).“
  Neaktivan trener se više ne nudi pri prodaji ni pri prijavi dolaska.
- **Gdje provjeriti:** UI; dijalog „Nova članarina“
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SET-11] Naknada trenera i udio za grupne vidi samo vlasnik (BR-026, D-62)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** prvo Menadžer, zatim Vlasnik
- **Koraci:** `/settings/trainers` → potražite polja „Naknada teretani po personalnom klijentu (€)“
  i „Udio za grupne (%)“.
- **Test podaci:** naknada `80`, udio `70`, pa prazno, pa `101`, pa `-5`
- **Očekivani rezultat:** menadžer ta polja **ne vidi** (ili ne može da ih sačuva). Vlasnik može;
  prazna naknada znači „nije definisano“, prazan udio znači „sa plana“; `101` i `-5` daju
  „Udio mora biti između 0 i 100, ili prazno.“
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SET-12] Programi i dodjela trenera
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** `/settings/trainers` → sekcija „Programi“ → dodajte program `Pilates` vrste
  `Grupni`; u sekciji „Dodjela“ uključite kvačicu za trenera; zatim je isključite.
- **Test podaci:** naziv od 1 i od 51 znaka za validaciju
- **Očekivani rezultat:** dodjela se čuva **odmah na klik** (bez posebnog dugmeta) i pojavljuje se
  poruka „Sačuvano.“ Kratak/dug naziv daje „Unesite naziv programa (2–50 znakova).“
  Trener bez dodjele se ne nudi za tu vrstu dolaska (vidi REC-05).
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SET-13] Raspored časova
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** sekcija „Raspored“ → [Dodaj čas] → Program `Grupni trening`, Trener `Milena`,
  Dan `Ponedjeljak`, Vrijeme `18:00` → sačuvajte. Probajte i neispravno vrijeme.
- **Test podaci:** `18:00`, `25:00`, `8:0`, `abc`, prazno
- **Očekivani rezultat:** ispravno vrijeme se čuva i čas se pojavljuje u listi; neispravno daje
  „Unesite vrijeme u formatu HH:mm.“ Novi čas se pojavljuje kao ponuđeni „Čas“ pri grupnoj prijavi
  tog dana (u okviru ±90 minuta).
- **Gdje provjeriti:** UI; dijalog prijave dolaska
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SET-14] Planovi — pravila trajanja i cijene
- **Prioritet:** Kritično
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** `/settings/plans` → [Dodaj plan] i probajte kombinacije ispod.
- **Test podaci:**
  | Kombinacija | Očekivano |
  |---|---|
  | vrsta `Dnevna karta` **sa** trajanjem | „Dnevna karta nema trajanje; svi ostali planovi ga moraju imati.“ |
  | vrsta `Teretana` **bez** trajanja | ista poruka |
  | vrsta `Personalni` **sa** cijenom | „Personalni nema unaprijed određenu cijenu; svi ostali planovi je moraju imati.“ |
  | vrsta `Teretana` **bez** cijene | ista poruka |
  | naziv `a` ili 51 znak | „Unesite naziv plana (2–50 znakova).“ |
  | cijena `79,50` / `79.50` | prihvaćeno |
  | cijena `-5` ili `abc` | „Unesite iznos, na primjer 79 ili 79,50.“ |
  | ograničenje dolazaka `0` ili `-1` | „Unesite cijeli broj veći od 0 ili ostavite prazno.“ |
  | udio trenera `101` | „Udio mora biti između 0 i 100.“ |
  | redoslijed `1000` | odbijeno (dozvoljeno 0–999) |
- **Očekivani rezultat:** kako je u tablici.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SET-15] Deaktiviranje plana
- **Prioritet:** Srednje
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** deaktivirajte jedan plan; otvorite prodaju članarine.
- **Test podaci:** `Studentska mjesečna`
- **Očekivani rezultat:** plan i dalje stoji u tabeli planova (sa oznakom da je neaktivan), ali se
  **ne nudi** pri prodaji. Ranije prodate članarine tog plana ostaju netaknute.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SET-16] Proizvodi
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** `/settings/products` → [Dodaj proizvod] → `Izotonik`, nabavna `0,60`, prodajna `2,00`.
  Probajte prodajnu `0`, negativnu nabavnu, naziv od 1 i 51 znaka.
- **Test podaci:** kao gore
- **Očekivani rezultat:** prodajna `0` daje „Prodajna cijena mora biti veća od 0.“; negativne
  vrijednosti i slova daju „Unesite iznos, na primjer 79 ili 79,50.“; naziv van 2–50 znakova daje
  „Unesite naziv proizvoda (2–50 znakova).“ Novi proizvod se odmah vidi na `/storage`.
- **Gdje provjeriti:** UI; `/storage`
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SET-17] Kategorije troškova (BR-131)
- **Prioritet:** Srednje
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** `/settings/gym` → sekcija „Kategorije troškova“ → dodajte `Čišćenje`; pokušajte da
  deaktivirate sistemsku kategoriju `Roba za prodaju`.
- **Test podaci:** —
- **Očekivani rezultat:** nova kategorija se čuva i odmah nudi u dijalogu troška. Sistemska
  kategorija se **ne može** deaktivirati (označena je kao „Sistemska“). Kategorije se nikad ne brišu.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SET-18] Podešavanja teretane — granice
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** `/settings/gym` → probajte vrijednosti ispod pa sačuvajte.
- **Test podaci:**
  | Polje | Vrijednost | Očekivano |
  |---|---|---|
  | Zamjenska kartica (€) | `5`, `0`, `-1`, `abc` | `-1` i `abc` odbijeni |
  | Minimalna cijena personalnog (€) | `80`, `0` | prolazi |
  | Podsjetnik prije isteka (dana) | `1`, `14` | prolazi |
  | Podsjetnik prije isteka (dana) | `0`, `15` | odbijeno |
  | Automatsko zaključivanje | `23:00`, `24:00`, `9:0` | prvo prolazi, ostalo „Unesite vrijeme u formatu HH:mm.“ |
  | Zaštita od duplog skeniranja (s) | `0`, `600` | prolazi |
  | Zaštita od duplog skeniranja (s) | `-1`, `601` | odbijeno |
  | Primaoci izvještaja smjene | prazno | „Unesite bar jednu adresu.“ |
  | Primaoci izvještaja smjene | `a@b.com, nijeemail` | „Jedna od adresa nije ispravna.“ |
  | Primaoci izvještaja smjene | dvije adrese u dva reda | prolazi |
- **Očekivani rezultat:** kako je u tablici; poslije uspješnog čuvanja „Sačuvano.“
  **Vratite podrazumijevane vrijednosti poslije testa.**
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SET-19] Logo teretane (upload)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** `/settings/gym` → sekcija „Logo“ → otpremite redom: PNG manji od 1 MB, JPG,
  PNG veći od 1 MB, PDF fajl, `.txt` fajl preimenovan u `.png`, i pokušajte bez izbora fajla.
- **Test podaci:** kao gore (vidi SUSPECT-07)
- **Očekivani rezultat:** PNG i JPG do 1 MB se čuvaju („Logo je sačuvan.“) i pojavljuju na ekranu i
  u PDF-u kartica. Preveliki fajl i PDF daju „Dozvoljeni su PNG i JPG do 1 MB.“
  Preimenovani `.txt` **mora** biti odbijen ili bar ne smije ništa da pokvari — zabilježite šta se
  desi. Bez izbora fajla: ista poruka o dozvoljenim formatima.
- **Gdje provjeriti:** UI; `/api/pdf/cards/<batchId>`
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SET-20] Prikaz posljednje rezervne kopije
- **Prioritet:** Nisko
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** `/settings/gym` → pročitajte red o rezervnoj kopiji prije i poslije pokretanja
  `npm run jobs:run -- weekly-backup`.
- **Test podaci:** —
- **Očekivani rezultat:** prije: „Posljednja rezervna kopija: Još nije napravljena“.
  Poslije: „Posljednja rezervna kopija: dd.mm.gggg HH:MM – uspješno“ (ili „neuspješno: <greška>“).
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

---

### 3.11 CARD — kartice (S-28, BR-030 do BR-036)

### [CARD-01] Generisanje serije kartica
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik ili Menadžer
- **Koraci:** `/settings/cards` → „Broj kartica (1–100)“ = `10` → [Generiši].
- **Test podaci:** `10`
- **Očekivani rezultat:** „Kartice su generisane.“ U tabeli „Serije“ je novi red sa datumom,
  brojem kartica i brojem praznih (10).
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [CARD-02] Granice broja kartica
- **Prioritet:** Visoko
- **Uloga / preduslovi:** ekran S-28
- **Koraci:** probajte `0`, `1`, `100`, `101`, `-5`, `abc`, prazno, `2.5`.
- **Test podaci:** kao gore
- **Očekivani rezultat:** `1` i `100` prolaze; ostalo daje „Unesite broj između 1 i 100.“
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [CARD-03] PDF liste kartica
- **Prioritet:** Visoko
- **Uloga / preduslovi:** postoji serija
- **Koraci:** [Preuzmi PDF] → otvorite fajl.
- **Test podaci:** —
- **Očekivani rezultat:** fajl `kartice-gggg-mm-dd.pdf`; svaka kartica ima kôd (i bar kôd/QR ako je
  predviđen), naziv teretane, logo ako je otpremljen, i liniju „Ime i prezime:“ za upisivanje.
  Kodovi u PDF-u se poklapaju sa onima koje aplikacija prihvata pri skeniranju.
- **Gdje provjeriti:** PDF; skeniranje jednog koda iz PDF-a
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [CARD-04] Brojač praznih kartica se smanjuje
- **Prioritet:** Srednje
- **Uloga / preduslovi:** serija od 10 kartica
- **Koraci:** registrujte člana jednom karticom iz te serije, pa se vratite na `/settings/cards`.
- **Test podaci:** —
- **Očekivani rezultat:** kolona „Prazne“ pada sa 10 na 9.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [CARD-05] Prazno stanje
- **Prioritet:** Nisko
- **Uloga / preduslovi:** baza bez serija
- **Koraci:** otvorite `/settings/cards`.
- **Test podaci:** —
- **Očekivani rezultat:** „Nema generisanih serija.“
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

---

### 3.12 FIN — finansije vlasnika (S-16 do S-22)

### [FIN-01] Pregled i period
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik; ima prometa u tekućem mjesecu
- **Koraci:** `/finance` → redom izaberite „Danas“, „Ova sedmica“, „Ovaj mjesec“, „Prošli mjesec“,
  „Ova godina“, „Proizvoljno“ (od `01.09.2026` do `21.09.2026`) → [Prikaži].
- **Test podaci:** kao gore
- **Očekivani rezultat:** kartice „Prihod“, „Troškovi“, „Profit“, „Zarada na magacinu“,
  „Aktivni članovi“ se mijenjaju sa periodom, i period je vidljiv u adresi (`?period=…`).
  „Ova sedmica“ ide od ponedjeljka do nedjelje.
- **Gdje provjeriti:** UI, adresna linija
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [FIN-02] Proizvoljan period — neispravne vrijednosti
- **Prioritet:** Srednje
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** ručno izmijenite adresu: `?period=custom&from=2026-09-30&to=2026-09-01` (obrnuto),
  `?period=custom&from=abc&to=xyz`, `?period=izmisljeno`.
- **Test podaci:** kao gore
- **Očekivani rezultat:** stranica se ne ruši; vraća se na podrazumijevani period „Ovaj mjesec“.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [FIN-03] Raščlanjenja i liste na pregledu
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik; postoje članarine više vrsta i oba načina plaćanja
- **Koraci:** `/finance` → pogledajte „Prihod po vrsti članarine“, „Prihod po načinu plaćanja“,
  „Troškovi po kategoriji“, „Ističe u narednih 7 dana“, „Članovi sa neplaćenim dolascima“.
- **Test podaci:** —
- **Očekivani rezultat:** zbir raščlanjenja se poklapa sa karticom „Prihod“. Poništene stavke se ne
  broje. Prazna stanja: „Nema podataka za izabrani period.“, „Nijedna članarina ne ističe u
  narednih 7 dana.“, „Nema članova sa neplaćenim dolascima.“ Imena u listama vode na profil člana.
- **Gdje provjeriti:** UI; ručna kontrola zbira
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [FIN-04] Grafikon prihoda i troškova po mjesecima
- **Prioritet:** Srednje
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** pređite mišem preko stupaca; smanjite prozor na 375 px i pogledajte ponovo.
- **Test podaci:** —
- **Očekivani rezultat:** uz grafikon stoji „Pređite mišem preko mjeseca za iznose.“ i iznosi se
  pojavljuju. Na uskom ekranu grafikon ostaje čitljiv i ne izlazi iz ekrana (bez vodoravnog
  pomjeranja cijele stranice).
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [FIN-05] Novi trošak — puna forma (BR-133)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** `/finance/expenses` → [Novi trošak] → Kategorija `Kirija`, Opis `Zakup septembar`,
  Iznos `500`, Datum današnji, Način `Gotovina`, PDV `Da`, Dobavljač `Agencija`, Račun `123/26`
  → sačuvajte.
- **Test podaci:** kao gore
- **Očekivani rezultat:** „Trošak je sačuvan.“ Stavka je u listi sa svim kolonama i ulazi u ukupne
  troškove izabranog perioda.
- **Gdje provjeriti:** UI; `/finance` kartica „Troškovi“
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [FIN-06] Trošak — validacija i granice
- **Prioritet:** Kritično
- **Uloga / preduslovi:** forma „Novi trošak“
- **Koraci:** probajte vrijednosti ispod.
- **Test podaci:**
  | Polje | Vrijednost | Očekivano |
  |---|---|---|
  | Iznos | `0` ili `0,001` | „Unesite iznos između 0,01 i 100.000,00 €.“ |
  | Iznos | `0,01` i `100000` | prolazi |
  | Iznos | `100000,01` | poruka o iznosu |
  | Opis | 1 znak / 201 znak | „Unesite opis (2–200 znakova).“ |
  | Datum | **sutrašnji** | odbijeno (datum ne smije biti u budućnosti) |
  | Datum | prošli mjesec | prolazi |
  | Dobavljač | 101 znak | odbijeno |
  | Račun | 51 znak | odbijeno |
- **Očekivani rezultat:** kako je u tablici.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [FIN-07] Trošak „Iz kase“
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik; jednom sa otvorenom smjenom, jednom bez
- **Koraci:** u formi uključite kvačicu „Iz kase“ i pogledajte šta se dešava sa poljima datuma i
  načina plaćanja; sačuvajte. Ponovite kada nema otvorene smjene.
- **Test podaci:** iznos `20`
- **Očekivani rezultat:** uz kvačicu stoji „Datum se postavlja na danas, način na gotovinu, i traži
  otvorenu smjenu.“ Polja datuma i načina nestaju ili postaju nepromjenjiva. Bez otvorene smjene:
  „Nema otvorene smjene. Recepcioner mora biti prijavljen.“ Sa smjenom: trošak umanjuje očekivanu
  gotovinu u zaključenju smjene.
- **Gdje provjeriti:** UI; `/shift/close`
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [FIN-08] Trener se bira samo uz kategoriju „Plate“
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** u formi izaberite kategoriju `Plate` pa pogledajte da li se pojavilo polje „Trener“;
  zatim promijenite kategoriju na `Kirija`.
- **Test podaci:** —
- **Očekivani rezultat:** polje „Trener“ se pojavljuje samo za `Plate`. Trošak sa trenerom u
  nesalarijskoj kategoriji mora biti odbijen („Provjerite unesene podatke.“).
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [FIN-09] Filteri na ekranu troškova
- **Prioritet:** Srednje
- **Uloga / preduslovi:** više troškova različitih kategorija i načina
- **Koraci:** filtrirajte po kategoriji, načinu plaćanja i korisniku koji je unio; kombinujte sa
  periodom.
- **Test podaci:** —
- **Očekivani rezultat:** lista se sužava, ukupan iznos se mijenja, izbor ostaje u adresi.
  Prazan rezultat: „Nema troškova u izabranom periodu.“
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [FIN-10] Poništavanje troška vlasnika
- **Prioritet:** Visoko
- **Uloga / preduslovi:** trošak iz FIN-05
- **Koraci:** [Poništi] → razlog kraći od 3 znaka, pa ispravan razlog.
- **Test podaci:** `ab`, pa `Duplirana faktura`
- **Očekivani rezultat:** prvo „Unesite razlog (3–200 znakova).“, zatim „Poništeno“ — stavka ostaje
  precrtana i izlazi iz ukupnih troškova.
- **Gdje provjeriti:** UI; `/finance` kartica „Troškovi“
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [FIN-11] Ekran „Treneri“ (S-18)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik; prodate su grupna, G+T i personalna članarina sa trenerima
- **Koraci:** `/finance/trainers` → izaberite mjesec → pogledajte kolone; otvorite detalj jednog
  trenera; probajte [Evidentiraj isplatu].
- **Test podaci:** tekući mjesec, pa mjesec bez prometa
- **Očekivani rezultat:** kolone „Klijenti“, „Održani grupni treninzi“, „Personalni treninzi“,
  „Prihod“, „Za trenera (za isplatu)“, „Za teretanu“, „Isplaćeno“, „Razlika“. Za Julija (naknada
  nije definisana) stoji „nije definisano“. [Evidentiraj isplatu] otvara formu troška kategorije
  „Plate“ sa unaprijed izabranim trenerom. Prazan mjesec: „Nema uplata za izabrani mjesec.“
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [FIN-12] Ekran „Smjene“ (S-19)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik; bar dvije zaključene smjene i po mogućnosti jedna otvorena
- **Koraci:** `/finance/shifts` → pogledajte kolone; kliknite [PDF]; kliknite [Zaključi smjenu] na
  otvorenoj (prebrojana gotovina neobavezna); kliknite [Pošalji ponovo] na neuspjeloj.
- **Test podaci:** —
- **Očekivani rezultat:** kolone: recepcioner, početak, kraj, način zaključenja, gotovina, kartica,
  očekivano, prebrojano, razlika, status emaila. Otvorena smjena je posebno označena.
  Zaključenje daje „Smjena je zaključena.“, a vlasnikova sesija se **ne** prekida.
  Prazno: „Nema smjena u izabranom periodu.“
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [FIN-13] Ekran „Magacin“ za vlasnika (S-20)
- **Prioritet:** Srednje
- **Uloga / preduslovi:** Vlasnik; ima nabavki i prodaja
- **Koraci:** `/finance/storage` → provjerite „Vrijednost zalihe“, „Prodato kom“,
  „Nabavna vrijednost prodatog“, „Dnevna prodaja“, „Ulazi robe“.
- **Test podaci:** —
- **Očekivani rezultat:** zarada na magacinu se poklapa sa karticom „Zarada na magacinu“ na
  pregledu. Prazan period: „Nema prometa u izabranom periodu.“
- **Gdje provjeriti:** UI; ručna kontrola
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [FIN-14] Dnevnik izmjena (S-21)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik; prethodno ste ispravljali i poništavali stavke i mijenjali člana
- **Koraci:** `/finance/audit` → filtrirajte po korisniku i po vrsti stavke; otvorite jedan zapis i
  pogledajte prikaz izmjene.
- **Test podaci:** —
- **Očekivani rezultat:** svaka izmjena ima vrijeme, korisnika, radnju („Unos“, „Izmjena“,
  „Poništeno“, „Anonimizacija“), stavku i prikaz šta je promijenjeno (staro → novo).
  Kada ima više od 200 zapisa, stoji „Prikazano je prvih 200 izmjena. Suzite period da vidite ostale.“
  Prazno: „Nema izmjena u izabranom periodu.“
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [FIN-15] Naknadni unos — dolazak (S-22, BR-120)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** `/finance/backdated` → kartica „Dolazak“ → nađite člana pretragom → Datum juče,
  Vrijeme ulaska `18:00`, Vrijeme izlaska `19:30`, Vrsta `Teretana` → sačuvajte.
- **Test podaci:** kao gore; zatim izlazak `17:00` (raniji od ulaska); zatim **sutrašnji** datum
- **Očekivani rezultat:** na vrhu stoji traka „Naknadni unos – ne ulazi u smjenu.“ Ispravan unos:
  „Naknadni unos je sačuvan.“ i dolazak se vidi u profilu člana.
  Raniji izlazak: „Vrijeme izlaska mora biti poslije vremena ulaska.“
  Budući datum: odbijeno („Unesite datum koji nije u budućnosti.“ ili „Provjerite unesene podatke.“ —
  zabilježite koja poruka stigne, vidi SUSPECT-08).
- **Gdje provjeriti:** UI; profil člana → „Dolasci“; `/shift/close` (ne smije se pojaviti)
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [FIN-16] Naknadni unos — članarina, dnevne karte, zamjenska kartica
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** obiđite preostale tri kartice:
  1. „Članarina“: član, plan `Mjesečna`, datum uplate prošli mjesec, početak ostavite prazan.
  2. „Dnevne karte“: količina `2`, datum uplate juče.
  3. „Zamjenska kartica“: član, način `Gotovina`, datum uplate juče.
- **Test podaci:** kao gore; probajte i količinu `0` i `21` na dnevnim kartama
- **Očekivani rezultat:** sve tri daju „Naknadni unos je sačuvan.“ Uplate se vide u finansijama sa
  oznakom „Naknadno“, ali **ne** ulaze ni u jednu smjenu niti u izvještaj smjene. Prazan početak
  članarine znači da se računa po pravilima (uz polje stoji „Ostavite prazno da se izračuna po
  pravilima (BR-052).“). Količina `0` i `21` daju „Unesite broj između 1 i 20.“
- **Gdje provjeriti:** UI; `/payments/today` (ne smiju se pojaviti — to su samo današnje, neknadne
  stavke su isključene); profil člana
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [FIN-17] Naknadni unos bez izabranog člana
- **Prioritet:** Srednje
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** na kartici „Dolazak“ sačuvajte bez biranja člana.
- **Test podaci:** —
- **Očekivani rezultat:** „Izaberite člana.“
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

---

### 3.13 STAT — statistika dolazaka (S-15)

### [STAT-01] Osnovni prikaz
- **Prioritet:** Srednje
- **Uloga / preduslovi:** Vlasnik ili Menadžer; ima dolazaka u tekućem mjesecu
- **Koraci:** `/stats/visits` → pogledajte kartice, oba grafikona, tabelu po vrsti i „Najčešći članovi“.
- **Test podaci:** —
- **Očekivani rezultat:** „Ukupno dolazaka“ i „Prosječno trajanje“ sa napomenom
  „Bez automatskih odjava (N mjerenih dolazaka).“ Grafikon „Dolasci po danima“ ima stupac za
  **svaki** dan perioda (i prazne dane), a „Dolasci po satima (06–23)“ svaki sat.
  Najviše 10 članova u listi, svaki vodi na svoj profil.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [STAT-02] Prazan period
- **Prioritet:** Srednje
- **Uloga / preduslovi:** period bez dolazaka (npr. prošla godina)
- **Koraci:** izaberite „Proizvoljno“ za period u kojem nema dolazaka.
- **Test podaci:** `01.01.2025` – `31.01.2025`
- **Očekivani rezultat:** „Nema dolazaka u izabranom periodu.“
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [STAT-03] Vrlo dug period (granica 400 dana)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik (vidi SUSPECT-01)
- **Koraci:** ručno u adresi: `/stats/visits?period=custom&from=2024-01-01&to=2026-09-21`.
- **Test podaci:** period duži od 400 dana
- **Očekivani rezultat:** **jasna poruka o grešci.** Ako ekran umjesto toga prikaže
  „Nema dolazaka u izabranom periodu.“ iako dolazaka ima, to je pogrešno i treba zabilježiti kao bug.
- **Gdje provjeriti:** UI; serverska konzola (`npm run dev`)
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [STAT-04] Automatska odjava se broji kao dolazak, ali ne u prosjek (BR-082)
- **Prioritet:** Srednje
- **Uloga / preduslovi:** pokrenut noćni posao koji je nekog automatski odjavio (JOB-01)
- **Koraci:** uporedite „Ukupno dolazaka“ i broj u napomeni ispod prosječnog trajanja.
- **Test podaci:** —
- **Očekivani rezultat:** ukupno uključuje automatski odjavljen dolazak; broj „mjerenih dolazaka“
  je za toliko manji.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [STAT-05] Anonimizovan član ne ulazi u listu najčešćih (BR-046)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** anonimizovan član sa mnogo dolazaka (MEM-15)
- **Koraci:** otvorite `/stats/visits` za period u kojem je taj član dolazio.
- **Test podaci:** —
- **Očekivani rezultat:** njegovi dolasci se broje u ukupnom broju, ali ga **nema** u listi
  „Najčešći članovi“.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

---


### 3.14 JOB — zakazani poslovi, email i rezervna kopija

> Poslovi se u razvoju pokreću ručno: `npm run jobs:run -- <ime>`. Svaki posao sam provjerava da
> li mu je vrijeme došlo (noćni: poslije „Automatsko zaključivanje“, podrazumijevano 23:00;
> jutarnji: poslije 09:00; rezervna kopija: samo nedjeljom).

### [JOB-01] Noćni posao: automatska odjava i zaključenje smjene (BR-082, BR-116)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** otvorena smjena i bar jedan član u teretani. Da ne biste čekali 23:00,
  vlasnik može privremeno postaviti „Automatsko zaključivanje“ na vrijeme malo prije sadašnjeg
  (npr. sada je 14:20 → postavite `14:00`).
- **Koraci:**
  1. Prijavite člana na recepciji.
  2. Pokrenite `npm run jobs:run -- nightly` i pročitajte izlaz.
  3. Kao vlasnik otvorite `/finance/shifts` i profil člana.
  4. Pokrenite isti posao **još jednom**.
- **Test podaci:** —
- **Očekivani rezultat:** korak 2 ispisuje izvještaj sa brojem zatvorenih dolazaka i id-om
  zaključene smjene. Dolazak je odjavljen na vrijeme automatskog zaključenja, smjena je zaključena
  sa načinom „Automatski“ i bez prebrojane gotovine, izvještaj je napravljen i poslat.
  Korak 4 ne radi ništa drugi put (`ran: false`) — nema duplih zaključenja.
  **Vratite podešavanje na 23:00.**
- **Gdje provjeriti:** izlaz komande; `/finance/shifts`; profil člana → „Dolasci“
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [JOB-02] Recepcioner posle automatskog zaključenja
- **Prioritet:** Kritično
- **Uloga / preduslovi:** nastavak JOB-01, recepcioner je još prijavljen u browseru
- **Koraci:** u browseru recepcionera kliknite bilo koju stavku menija.
- **Test podaci:** —
- **Očekivani rezultat:** odjavljen je i na `/login` piše „Smjena je automatski zaključena.“
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [JOB-03] Jutarnji posao: podsjetnik o isteku članarine (BR-160)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** `EMAIL_FROM` i `RESEND_API_KEY` podešeni; član čija članarina ističe
  tačno za onoliko dana koliko piše u „Podsjetnik prije isteka (dana)“ (podrazumijevano 3) i ima
  **vašu** email adresu (ne pravog člana!)
- **Koraci:**
  1. Kao vlasnik napravite članarinu koja ističe za tačno 3 dana (koristite [Promijeni početak]).
  2. Pokrenite `npm run jobs:run -- morning`.
  3. Provjerite sanduče.
  4. Pokrenite posao ponovo.
- **Test podaci:** vaša email adresa kao email člana
- **Očekivani rezultat:** stiže email „Vaša članarina ističe dd.mm.gggg“ sa imenom člana, nazivom
  plana i nazivom teretane. Drugi poziv **ne šalje isti podsjetnik ponovo**.
- **Gdje provjeriti:** izlaz komande; email
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [JOB-04] Jutarnji posao bez podešenog emaila
- **Prioritet:** Srednje
- **Uloga / preduslovi:** `EMAIL_FROM` prazno
- **Koraci:** pokrenite `npm run jobs:run -- morning`.
- **Test podaci:** —
- **Očekivani rezultat:** izlaz pokazuje da je slanje preskočeno (`skipped`), bez greške; nijedan
  email ne odlazi.
- **Gdje provjeriti:** izlaz komande
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [JOB-05] Sedmična rezervna kopija (BR-163)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** `BACKUP_ZIP_PASSWORD` podešen; danas je **nedjelja** (posao se inače ne
  izvršava)
- **Koraci:** pokrenite `npm run jobs:run -- weekly-backup` → pročitajte izlaz → provjerite
  `/settings/gym` → provjerite sanduče primaoca kopije.
- **Test podaci:** —
- **Očekivani rezultat:** izlaz kaže `status: success`, broj tabela i redova. Na S-27 se vidi
  „Posljednja rezervna kopija: … – uspješno“. Email ima ZIP u prilogu (ili poruku da je kopija
  prevelika i da je sačuvana u Storage). U emailu **nema lozinke ZIP-a**.
- **Gdje provjeriti:** izlaz komande; UI; email; Supabase Storage → `backups`
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [JOB-06] Provjera oporavka iz rezervne kopije
- **Prioritet:** Visoko
- **Uloga / preduslovi:** **prazan, odvojen** Supabase projekat i podešeni
  `RESTORE_TEST_DATABASE_URL`, `RESTORE_TEST_SUPABASE_URL`, `RESTORE_TEST_SERVICE_ROLE_KEY`
- **Koraci:** `npm run restore:test -- --file <backup.zip>`
- **Test podaci:** ZIP iz JOB-05
- **Očekivani rezultat:** skripta odbija da radi ako je ciljni projekat isti kao radni; inače
  primjenjuje migracije, učitava podatke i ispisuje poređenje broja redova sa `manifest.json`
  bez razlike. Lozinke zaposlenih se u obnovljenom projektu moraju postaviti ponovo.
- **Gdje provjeriti:** izlaz komande
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [JOB-07] Ponovno slanje neuspjelih izvještaja
- **Prioritet:** Srednje
- **Uloga / preduslovi:** postoji smjena čiji izvještaj nije poslat (CLOSE-06)
- **Koraci:** ispravite `RESEND_API_KEY`, pa pokrenite `npm run jobs:run -- email-retry`.
- **Test podaci:** —
- **Očekivani rezultat:** izvještaj je poslat, status na `/finance/shifts` postaje „poslato“.
  Posao ne pokušava više od pet puta po smjeni.
- **Gdje provjeriti:** izlaz komande; UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

---

### 3.15 SEC — bezbjednost

### [SEC-01] Ubacivanje HTML/JS u svako tekstualno polje
- **Prioritet:** Kritično
- **Uloga / preduslovi:** sve uloge
- **Koraci:** unesite `<script>alert(1)</script>` i `<img src=x onerror=alert(1)>` u sljedeća polja
  i zatim otvorite ekrane gdje se ta vrijednost prikazuje:
  ime i prezime člana, napomena uz ispravku uplate, razlog poništavanja, opis troška, dobavljač,
  broj računa, naziv plana, naziv proizvoda, naziv kategorije, ime trenera, ime zaposlenog,
  naziv programa.
- **Test podaci:** kao gore
- **Očekivani rezultat:** nigdje se ne izvršava skripta; tekst se svuda prikazuje doslovno, i u
  PDF izvještaju. U konzoli browsera nema greške o CSP-u koju je izazvao vaš unos.
- **Gdje provjeriti:** UI, konzola browsera, PDF
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SEC-02] SQL znakovi u pretragama i poljima
- **Prioritet:** Kritično
- **Uloga / preduslovi:** —
- **Koraci:** u pretragu članova (recepcija i `/members`) i u pretragu člana na naknadnom unosu
  unesite: `'`, `"`, `;`, `' OR 1=1 --`, `%`, `_`, `\`.
- **Test podaci:** kao gore
- **Očekivani rezultat:** pretraga vraća prazan rezultat ili normalne rezultate; nikad greška
  servera, nikad svi članovi zbog `OR 1=1`. Znakovi `%` i `_` ne smiju da se ponašaju kao džokeri
  koji vraćaju sve.
- **Gdje provjeriti:** UI, Network tab
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SEC-03] Servisni ključ ne smije doći do browsera
- **Prioritet:** Kritično
- **Uloga / preduslovi:** prijavljeni bilo kojom ulogom
- **Koraci:** otvorite Developer Tools → Sources/Network → pretražite učitane skripte i HTML za
  niske `SUPABASE_SERVICE_ROLE_KEY`, `service_role`, `RESEND_API_KEY`, `CRON_SECRET`,
  `BACKUP_ZIP_PASSWORD`.
- **Test podaci:** —
- **Očekivani rezultat:** nijedan pogodak. Vidljiv smije biti samo `NEXT_PUBLIC_SUPABASE_URL` i
  anon ključ.
- **Gdje provjeriti:** Developer Tools (Network, Sources, „Search all files“)
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SEC-04] Sigurnosna zaglavlja
- **Prioritet:** Visoko
- **Uloga / preduslovi:** prijavljeni
- **Koraci:** Network tab → izaberite dokument stranice → pogledajte Response Headers.
- **Test podaci:** —
- **Očekivani rezultat:** postoje `Content-Security-Policy` (sa `frame-ancestors 'none'`,
  `object-src 'none'`, `script-src` sa nonce-om) i `Cache-Control: private, no-store`.
- **Gdje provjeriti:** Network tab
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SEC-05] Stranica se ne smije učitati u okviru (iframe)
- **Prioritet:** Srednje
- **Uloga / preduslovi:** —
- **Koraci:** napravite lokalni HTML fajl sa `<iframe src="http://localhost:3000/login"></iframe>`
  i otvorite ga.
- **Test podaci:** —
- **Očekivani rezultat:** okvir ostaje prazan, u konzoli piše da je učitavanje odbijeno.
- **Gdje provjeriti:** browser, konzola
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SEC-06] Podaci se ne zadržavaju u kešu poslije odjave
- **Prioritet:** Visoko
- **Uloga / preduslovi:** prijavljeni pa odjavljeni
- **Koraci:** otvorite `/members`, odjavite se, pa pritisnite dugme **nazad** u browseru.
- **Test podaci:** —
- **Očekivani rezultat:** ne vidi se lista članova iz keša; završavate na `/login`.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SEC-07] Upload pogrešnog tipa i prevelikog fajla
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik, `/settings/gym`
- **Koraci:** vidi SET-19; dodatno probajte `.svg` fajl i fajl od 5 MB.
- **Test podaci:** `.svg`, PNG od 5 MB
- **Očekivani rezultat:** oba odbijena porukom „Dozvoljeni su PNG i JPG do 1 MB.“ SVG je posebno
  važno odbiti jer može da nosi skriptu.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SEC-08] Tuđa sesija i izmjena kolačića
- **Prioritet:** Visoko
- **Uloga / preduslovi:** prijavljeni
- **Koraci:** u Developer Tools → Application → Cookies izmijenite vrijednost Supabase kolačića
  (promijenite nekoliko znakova) i osvježite stranicu.
- **Test podaci:** —
- **Očekivani rezultat:** sesija je odbijena i vraćeni ste na `/login`; nema prikaza podataka sa
  pokvarenim tokenom.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [SEC-09] Pokušaj pristupa finansijskim podacima kroz odgovor stranice
- **Prioritet:** Kritično
- **Uloga / preduslovi:** Recepcioner
- **Koraci:** otvorite profil člana i u Network tabu pregledajte odgovor servera za tu stranicu.
- **Test podaci:** —
- **Očekivani rezultat:** u odgovoru nema podataka o udjelu trenera, naknadi teretani ni o
  uplatama iz ranijih dana. Finansijski podaci ne smiju da „procure“ kroz HTML koji je samo skriven
  u prikazu.
- **Gdje provjeriti:** Network tab (tijelo odgovora)
- [ ] Prošlo  [ ] Palo  Napomena: ____

---

### 3.16 UX — greške, mreža, ponašanje ekrana

### [UX-01] Prekid interneta usred rada (F-27)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** Recepcioner na recepciji
- **Koraci:**
  1. Developer Tools → Network → Offline.
  2. Pokušajte da skenirate karticu i da otvorite [Dnevna karta].
  3. Vratite Online.
- **Test podaci:** —
- **Očekivani rezultat:** pojavljuje se crvena traka preko vrha: „Nema internet konekcije. Podaci
  se ne mogu sačuvati – vodite evidenciju na papiru i predajte je vlasniku.“ Dugmad koja
  evidentiraju novac su onemogućena. Po povratku veze traka nestaje u roku od 5 sekundi i sve
  ponovo radi.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [UX-02] Spor odgovor servera
- **Prioritet:** Srednje
- **Uloga / preduslovi:** —
- **Koraci:** Developer Tools → Network → Slow 3G → otvorite `/members` i prodajte članarinu.
- **Test podaci:** —
- **Očekivani rezultat:** vidi se skelet ekrana dok se učitava; dugme za čuvanje pokazuje
  indikator i ne može se kliknuti dvaput; ništa se ne duplira.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [UX-03] Greška na ekranu se prikazuje na našem jeziku
- **Prioritet:** Visoko
- **Uloga / preduslovi:** —
- **Koraci:** izazovite grešku (npr. zaustavite `npm run dev` nakratko usred radnje, ili
  pokvarite `NEXT_PUBLIC_SUPABASE_URL` i osvježite ekran).
- **Test podaci:** —
- **Očekivani rezultat:** „Došlo je do greške. Pokušajte ponovo.“ sa dugmetom [Pokušaj ponovo] i
  šifrom greške — **nikada** engleska Next.js poruka i nikada tekst baze.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [UX-04] Tastatura i fokus (pristupačnost)
- **Prioritet:** Srednje
- **Uloga / preduslovi:** —
- **Koraci:** na `/reception` i u dijalogu prodaje članarine prolazite kroz elemente tasterom Tab;
  zatvorite dijalog tasterom Esc; otvorite meni tastaturom.
- **Test podaci:** —
- **Očekivani rezultat:** fokus je uvijek vidljiv, kreće se kroz stvarne kontrole, iz dijaloga ne
  „bježi“ iza njega, Esc zatvara dijalog. Svako dugme i polje ima ime koje čitač ekrana može da
  pročita.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [UX-05] Poruke o uspjehu se same povlače
- **Prioritet:** Nisko
- **Uloga / preduslovi:** —
- **Koraci:** sačuvajte bilo šta i pratite zelenu poruku.
- **Test podaci:** —
- **Očekivani rezultat:** poruka se pojavi i nestane sama, ne zaklanja dugmad i ne ostaje zauvijek.
- **Gdje provjeriti:** UI
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [UX-06] Mnogo podataka (performanse)
- **Prioritet:** Srednje
- **Uloga / preduslovi:** više od 100 članova i više od 200 dolazaka (može se napraviti naknadnim
  unosom ili tokom stvarnog rada)
- **Koraci:** otvorite `/members`, `/stats/visits` za mjesec i `/finance/audit`.
- **Test podaci:** —
- **Očekivani rezultat:** stranice se učitavaju u razumnom vremenu (do par sekundi), straničenje
  radi, grafikoni ostaju čitljivi, dnevnik izmjena pokazuje poruku o ograničenju od 200 zapisa.
- **Gdje provjeriti:** UI; Network tab (vrijeme odgovora)
- [ ] Prošlo  [ ] Palo  Napomena: ____

---


## 4. End-to-end scenariji

Ovo su cjeloviti tokovi kroz više modula i uloga, onako kako će ih koristiti teretana. Prolazite ih
**bez prekida**, i tek na kraju provjeravate ishod.

### [E2E-01] Puni radni dan recepcionera
- **Prioritet:** Kritično · **Uloge:** Recepcioner A, Vlasnik
1. Recepcioner A se prijavljuje (`recepcija1`) → smjena se otvara.
2. Skenira praznu karticu → registruje novog člana `Ana Anić` sa mjesečnom članarinom,
   plaćeno gotovinom, „Prijavi odmah“ uključeno → zeleni dijalog.
3. Skenira karticu postojećeg člana → zeleni dijalog.
4. Prodaje 2 dnevne karte karticom.
5. Prodaje 1 vodu iz magacina, gotovinom.
6. Unosi trošak sa pulta: `Potrošni materijal`, `Krpe`, `6,00 €`.
7. Skenira karticu člana iz koraka 3 (poslije više od 2 minuta) → odjava sa trajanjem.
8. Otvara `/shift/close`, provjerava ukupnosti, unosi prebrojanu gotovinu jednaku očekivanoj,
   zaključuje smjenu.
9. Vlasnik se prijavljuje → `/finance/shifts` → preuzima PDF i provjerava status emaila.
- **Očekivani rezultat:** očekivana gotovina = (članarina + voda) − trošak iz kase; razlika 0,00 €;
  dnevne karte su u kartičnom prihodu; PDF sadrži sve stavke; status emaila „poslato“; recepcioner
  je odjavljen.
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [E2E-02] Predaja smjene između dva recepcionera
- **Prioritet:** Kritično · **Uloge:** Recepcioner A, Recepcioner B, Vlasnik
1. A se prijavljuje i naplaćuje jednu članarinu i jednu dnevnu kartu.
2. A se odjavljuje (potvrđuje da smjena ostaje otvorena).
3. B se prijavljuje → dolazi na S-02 → unosi prebrojanu gotovinu → [Preuzmi smjenu].
4. B naplaćuje još jednu dnevnu kartu.
5. B zaključuje svoju smjenu.
6. Vlasnik na `/finance/shifts` pregleda **obje** smjene.
- **Očekivani rezultat:** prva smjena je zaključena kao „Preuzeo/la <B>“ sa prebrojanom gotovinom
  koju je unio B i svojim izvještajem; druga smjena sadrži samo ono što je B naplatio.
  Stavke iz prve smjene B ne može da mijenja.
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [E2E-03] Član koji je prestao da plaća pa produžio članarinu
- **Prioritet:** Kritično · **Uloge:** Recepcioner, Vlasnik
1. Vlasnik naknadnim unosom doda dva dolaska člana `Božo Božović` prije 3 i 2 dana (bez članarine).
2. Recepcioner skenira njegovu karticu danas → očekuje se **crveni** ekran („3. neplaćeni dolazak“).
3. Sa tog ekrana klikne [Produži članarinu] → prodaje `Mjesečna`, gotovina.
4. Provjeri profil člana.
5. Skenira karticu ponovo sljedeći put.
- **Očekivani rezultat:** početak članarine je datum prvog neplaćenog dolaska; sva tri dolaska
  postaju plaćena; značka „Neplaćeni dolasci“ nestaje; sljedeći dolazak je zelen.
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [E2E-04] Novi zaposleni od kreiranja do deaktivacije
- **Prioritet:** Visoko · **Uloge:** Vlasnik/Administrator, novi Recepcioner
1. Vlasnik kreira recepcionera sa privremenom lozinkom.
2. Novi zaposleni se prijavljuje → mora da postavi svoju lozinku → dolazi na recepciju
   (ili na S-02 ako je tuđa smjena otvorena) i ima **svoju** smjenu.
3. Naplaćuje jednu dnevnu kartu.
4. Administrator na `/settings/users` provjerava da vidi njegovu novu lozinku.
5. Vlasnik mu postavlja novu lozinku; zaposleni se prijavljuje i ponovo mora da je promijeni.
6. Vlasnik ga deaktivira dok je zaposleni prijavljen u drugom browseru.
- **Očekivani rezultat:** korak 2 ne preskače promjenu lozinke i **obavezno** otvara smjenu
  (ranije je ovdje bila greška); korak 6 izbacuje zaposlenog na sljedećem kliku, a njegova smjena
  ostaje otvorena dok je neko ne preuzme ili dok je noćni posao ne zaključi.
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [E2E-05] Vlasnikov mjesečni pregled
- **Prioritet:** Visoko · **Uloge:** Vlasnik
1. `/finance` sa periodom „Ovaj mjesec“ — zapišite prihod, troškove i profit.
2. `/finance/expenses` — unesite kiriju i struju za ovaj mjesec.
3. `/finance/trainers` — pogledajte obračun po treneru i evidentirajte isplatu za Tamaru.
4. Vratite se na `/finance` i provjerite da su se troškovi i profit promijenili za tačno te iznose.
5. `/finance/audit` — provjerite da su sve te radnje zabilježene sa vašim imenom.
6. `/finance/backdated` — unesite jednu zaboravljenu uplatu od prije tri dana.
7. Ponovo `/finance` — prihod je porastao za taj iznos.
- **Očekivani rezultat:** brojke se slažu na euro; naknadni unos se vidi u finansijama sa oznakom
  „Naknadno“, ali ne ulazi ni u jednu smjenu.
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [E2E-06] Izgubljena kartica
- **Prioritet:** Visoko · **Uloge:** Recepcioner
1. Član javlja da je izgubio karticu.
2. Recepcioner ga nađe pretragom → profil → [Izgubljena kartica] → naplati naknadu → skenira
   novu praznu karticu.
3. Skenira **staru** karticu.
4. Skenira **novu** karticu.
5. Provjeri `/payments/today`.
- **Očekivani rezultat:** stara kartica daje „Kartica je poništena. Pronađite člana pretragom.“;
  nova radi normalno; uplata „Zamjenska kartica – <ime>“ je u današnjim uplatama i u smjeni.
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [E2E-07] Noć i jutro
- **Prioritet:** Visoko · **Uloge:** Recepcioner, Vlasnik, terminal
1. Recepcioner ostavi dva člana prijavljena i **ne** zaključi smjenu.
2. Pokrenite `npm run jobs:run -- nightly` (uz privremeno pomjereno vrijeme automatskog zaključenja).
3. Vlasnik provjeri `/finance/shifts` i profile ta dva člana.
4. Pokrenite `npm run jobs:run -- morning` (sa vašom email adresom kao adresom člana kojem
   članarina ističe za 3 dana).
5. Nedjeljom: `npm run jobs:run -- weekly-backup`, pa provjerite S-27 i email.
- **Očekivani rezultat:** oba dolaska su automatski odjavljena u vrijeme zaključenja; smjena je
  zaključena kao „Automatski“ bez prebrojane gotovine; izvještaj je poslat; podsjetnik je stigao
  jednom; rezervna kopija je uspješna i vidi se na S-27.
- [ ] Prošlo  [ ] Palo  Napomena: ____

### [E2E-08] Promjena cjenovnika
- **Prioritet:** Srednje · **Uloge:** Vlasnik, Recepcioner
1. Vlasnik na `/settings/plans` podigne cijenu `Mjesečna` sa 79 na 89 €.
2. Doda novi proizvod `Izotonik` (nabavna 0,60, prodajna 2,00) i unese 12 komada u magacin.
3. Recepcioner proda mjesečnu članarinu i jedan izotonik.
4. Vlasnik pogleda staru uplatu od 79 € i novu od 89 €, i `/finance/storage`.
- **Očekivani rezultat:** stare uplate ostaju na staroj cijeni; nova je 89 €; zarada na magacinu
  za izotonik je 1,40 € po komadu.
- [ ] Prošlo  [ ] Palo  Napomena: ____

---

## 5. Testiranje na uređajima

Aplikacija se razvija za dvije veličine: **desktop 1366×768** (pult) i **mobilni 375 px**.

### 5.1 Desktop (Chrome, Firefox, Edge)

| Provjera | Gdje | Prošlo |
|---|---|---|
| Ekran se ne pomjera vodoravno | svih 23 ekrana | [ ] |
| Tabele sa mnogo kolona se pomjeraju unutar svog okvira, a ne cijela stranica | `/finance/shifts`, `/finance/expenses`, `/settings/users` | [ ] |
| Dijalozi su u sredini i ne izlaze iz ekrana | „Novi član“, „Nova članarina“, „Zaključivanje smjene“ | [ ] |
| Crveni ekran neplaćenog dolaska prekriva cijeli prozor | recepcija | [ ] |
| Skeniranje radi kada je prozor manji | recepcija | [ ] |
| Štampa PDF-a (izvještaj, kartice) | `/api/pdf/...` | [ ] |
| Uvećanje na 150 % ne lomi raspored | recepcija, članovi | [ ] |
| Firefox: datum se unosi i bira kao u Chromeu | „Novi član“ | [ ] |
| Edge: zvuci pri skeniranju rade | recepcija | [ ] |

> Safari nije dostupan na Windowsu; ako se aplikacija koristi na Macu ili iPhoneu, ponovite REC-01
> do REC-11 i CLOSE-01 do CLOSE-05 u Safariju i zabilježite razlike.

### 5.2 Mobilni telefon / uzak ekran (375 px)

| Provjera | Gdje | Prošlo |
|---|---|---|
| Meni se otvara dugmetom „Otvori meni“ i zatvara | sve stranice | [ ] |
| Zaglavlje pokazuje smjenu i nalog bez preklapanja | sve stranice | [ ] |
| Tabele su čitljive (pomjeranje unutar okvira) | `/members`, `/payments/today` | [ ] |
| Dugmad su dovoljno velika za prst (visina bar 44 px) | recepcija, magacin | [ ] |
| Forme: tastatura ne prekriva polje koje popunjavate | „Novi član“, „Trošak“ | [ ] |
| Brojčana tastatura se pojavljuje za količine i iznose | „Dnevna karta“, „Prodaja“ | [ ] |
| Dijalozi se mogu skrolovati do kraja i dugme za čuvanje je dostupno | „Novi član“ | [ ] |
| Položen ekran (landscape) ne lomi raspored | recepcija, zaključenje smjene | [ ] |
| Grafikoni na statistici i finansijama ostaju čitljivi | `/stats/visits`, `/finance` | [ ] |
| Dodir radi svuda gdje radi i miš (nema oslonca na „hover“) | grafikoni (iznosi), tabele | [ ] |

---

## 6. Sumnjiva mjesta u kodu

Ovo su mjesta koja su djelovala rizično tokom čitanja koda. Uz svako stoji test kojim se
potvrđuje ili opovrgava.

> **Provjera 21.09.2026:** svih 12 je provjereno — 11 uživo protiv hostovane baze (na test
> teretanama koje su obrisane poslije provjere), a SUSPECT-10 direktnim upitom. **Sva 12 su
> potvrđena**, s tim da SUSPECT-08 i SUSPECT-12 nisu greške nego zamke koje treba znati, a
> SUSPECT-10 ima blažu posljedicu nego što je pretpostavljeno. Nalaz stoji ispod svake stavke.
>
> **Popravke 21.09.2026:** svih 12 je obrađeno — 11 je popravljeno u kodu, a SUSPECT-12 je
> dobio objašnjenje u kodu jer nije greška. Svaka popravka je provjerena uživo ili jediničnim
> testom; `npm run lint`, `npm run typecheck`, `npm run test` (122), `npm run test:db`
> (428 tvrdnji) i `npm run test:e2e` (150) prolaze.

### [SUSPECT-01] Greška statistike se prikazuje kao „nema podataka“
- **Gdje:** `app/(app)/stats/visits/page.tsx:55`
- **Zašto:** poziv `visit_stats` se čita kao `const { data } = …` — **greška se ne provjerava**.
  Kada RPC odbije zahtjev (npr. period duži od oko 400 dana), `data` je `null` i ekran prikaže
  „Nema dolazaka u izabranom periodu.“, iako dolazaka ima. Vlasnik bi pomislio da nema prometa.
- **Test:** STAT-03.

- **POTVRĐENO** (provjereno uživo, 21.09.2026). Vlasnik, period 01.01.2020 – danas (preko 400 dana): ekran pokazuje „Nema dolazaka u izabranom periodu.“ iako RPC odbija zahtjev sa `E_VALIDATION`. Uzrok je tačno kako je opisano — `const { data } = await supabase.rpc(...)` ne čita `error`. **Ozbiljnost: visoka** — vlasnik može zaključiti da nema prometa. Popravka: pročitati `error` i prikazati poruku umjesto praznog stanja.

- **POPRAVLJENO 21.09.2026.** `app/(app)/stats/visits/page.tsx` sada čita `error` i prikazuje poruku umjesto praznog stanja. Provjereno uživo: period od preko 400 dana daje „Provjerite unesene podatke.“, a ne više „Nema dolazaka“. *Tekst poruke ostaje otvoreno pitanje §7.4 — sada se bar vidi da je zahtjev odbijen.*

### [SUSPECT-02] Datum rođenja u budućnosti nema svoju poruku
- **Gdje:** `features/members/schemas.ts:27` (komentar kaže da „today“ provjerava RPC)
- **Zašto:** Zod provjerava samo donju granicu (1900-01-01). Budući datum odbija baza, pa korisnik
  vjerovatno dobija opštu poruku „Provjerite unesene podatke.“ umjesto jasne poruke ispod polja.
- **Test:** MEM-06 (red sa sutrašnjim datumom).

- **POTVRĐENO** (uživo). „Uredi podatke“ sa sutrašnjim datumom rođenja daje opštu poruku „Provjerite unesene podatke.“; poruka ispod polja („Unesite datum rođenja (dd.mm.gggg), od 01.01.1900 do danas.“) se nikada ne pojavi. Gornju granicu provjerava samo `clean_member()` u bazi. **Ozbiljnost: niska** (kozmetika poruke).

- **POPRAVLJENO.** `features/members/actions.ts` provjerava gornju granicu prema `gym_today` (BR-001, ne datum servera) i vraća poruku ispod polja. Provjereno uživo: sutrašnji datum rođenja daje „Unesite datum rođenja (dd.mm.gggg), od 01.01.1900 do danas.“, a podatak o članu ostaje nepromijenjen.

### [SUSPECT-03] Pogrešan `STAFF_EMAIL_DOMAIN` ruši prijavu umjesto da javi grešku
- **Gdje:** `lib/auth.ts:63` i `features/auth/actions.ts:38`
- **Zašto:** `usernameEmail()` **baca izuzetak** kada domen nije podešen ili nije ispravan, a
  poziva se izvan bilo kakvog hvatanja greške. Prijava korisničkim imenom bi tada završila na
  ekranu greške umjesto na poruci o prijavi.
- **Test:** privremeno obrišite `STAFF_EMAIL_DOMAIN` iz `.env.local`, restartujte `npm run dev` i
  pokušajte prijavu korisničkim imenom. Očekivano ponašanje: uredna poruka, a ne ekran greške.

- **POTVRĐENO** (uživo, na serveru pokrenutom sa neispravnim `STAFF_EMAIL_DOMAIN`). Prijava korisničkim imenom **ne daje poruku nego ekran greške**: forma za prijavu nestane i ostane „Došlo je do greške. Pokušajte ponovo.“ sa dugmetom [Pokušaj ponovo], koje ništa ne rješava. Nijedan zaposleni sa korisničkim imenom se tada ne može prijaviti, a ništa ne kaže zašto. **Ozbiljnost: visoka pri pogrešnom podešavanju produkcije.** Popravka: uhvatiti izuzetak u `loginWithUsernameOrEmail` i vratiti običnu poruku o neuspjeloj prijavi.

- **POPRAVLJENO.** `loginWithUsernameOrEmail` i `changePassword` sada hvataju izuzetak iz `usernameEmail`/`loginEmail`, upisuju uzrok u log servera i vraćaju običnu poruku. Provjereno uživo protiv servera sa neispravnim `STAFF_EMAIL_DOMAIN`: forma ostaje na ekranu i kaže „Pogrešno korisničko ime/email ili lozinka.“

### [SUSPECT-04] Ruta PDF-a kartica se oslanja samo na RLS
- **Gdje:** `app/api/pdf/cards/[batchId]/route.ts:20`
- **Zašto:** za razliku od rute izvještaja smjene, ovdje se `batch.gym_id` **ne poredi** sa
  `staff.gym_id` — zaštita je samo u bazi (politika `card_batches_select`). Danas postoji jedna
  teretana, pa je posljedica nula; ako se ikad doda druga, ostaje samo jedan sloj zaštite.
- **Test:** PERM-10 i PERM-11; pri dodavanju druge teretane obavezno ponoviti.

- **POTVRĐENO** (uživo, sa dvije test teretane). Vlasnik teretane A koji traži `/api/pdf/cards/<serija teretane B>` dobija 404 — ali zahvaljujući RLS politici `card_batches_select`, ne kodu rute; ruta zaista ne poredi `batch.gym_id` sa `staff.gym_id`. **Danas bez posljedica** (jedna teretana), ali ostaje jedan sloj zaštite umjesto dva. Popravka je jedan `.eq("gym_id", staff.gym_id)`, kao u ruti izvještaja smjene.

- **POPRAVLJENO.** Ruta `app/api/pdf/cards/[batchId]/route.ts` sada poredi `batch.gym_id` sa `staff.gym_id`, kao i ruta izvještaja smjene, pa zaštita više ne stoji samo na RLS-u. Provjereno uživo sa dvije test teretane: 404.

### [SUSPECT-05] Prebrojana gotovina pri preuzimanju smjene nema gornju granicu
- **Gdje:** `features/shifts/actions.ts:28`
- **Zašto:** obrazac dozvoljava proizvoljan broj cifara, a kolona u bazi je `numeric(10,2)`.
  Ogroman iznos vjerovatno izaziva grešku baze koja se korisniku prikaže kao opšta poruka.
  (Za zaključenje smjene granica postoji — 8 cifara.)
- **Test:** SHIFT-11.

- **POTVRĐENO** (uživo). Unos `99999999999999` na S-02 daje „Došlo je do greške. Pokušajte ponovo.“; u logu servera stoji `take_over_shift: numeric field overflow`. Uz to, nađeno usput: preuzimanje šalje iznos kao JS broj (`Number(value)`, dakle float), dok zaključenje smjene šalje decimalnu nisku — nedosljedno sa BR-003. Popravka: ista granica kao kod zaključenja (`osam cifara`) i slanje niske.

- **POPRAVLJENO.** `takeOverSchema` ima istu granicu od osam cifara kao zaključenje smjene i šalje decimalnu nisku umjesto float broja (BR-003). Provjereno uživo: prevelik iznos daje „Unesite iznos ili ostavite prazno.“ ispod polja, a `120,50` se i dalje upisuje tačno kao 120.50.

### [SUSPECT-06] Naknadni unos: poruka o datumu ne odgovara provjeri
- **Gdje:** `features/finance/schemas.ts:16` (`isoDate` provjerava samo oblik)
- **Zašto:** tekst poruke glasi „Unesite datum koji nije u budućnosti.“, ali se budućnost provjerava
  tek u bazi, pa korisnik može dobiti opštu poruku umjesto te.
- **Test:** FIN-15 (sutrašnji datum) i FIN-06 (sutrašnji datum troška).

- **POTVRĐENO** (uživo). Naknadni unos dolaska sa sutrašnjim datumom prolazi Zod i vraća se sa „Provjerite unesene podatke.“; poruka „Unesite datum koji nije u budućnosti.“ se nikada ne prikaže, iako je napisana. Isto važi i za datum troška. **Ozbiljnost: niska** (kozmetika poruke).

- **POPRAVLJENO.** Novi pomoćnik `futureDate()` u `features/finance/actions.ts` provjerava datum prema `gym_today` u svih pet akcija (trošak i četiri naknadna unosa). Provjereno uživo: sutrašnji datum daje „Unesite datum koji nije u budućnosti.“ ispod polja.

### [SUSPECT-07] Tip otpremljenog loga se uzima od browsera
- **Gdje:** `features/settings/catalog-actions.ts:326`
- **Zašto:** provjerava se `file.type`, koji šalje browser, a ne stvarni sadržaj fajla. Fajl
  preimenovan u `.png` sa lažnim tipom bi mogao da prođe. Rizik je umanjen time što je bucket
  privatan i slika se ugrađuje u PDF, ali provjeru vrijedi potvrditi.
- **Test:** SET-19 (preimenovani `.txt`) i SEC-07 (`.svg`).

- **POTVRĐENO** (uživo). Fajl sa običnim tekstom, nazvan `logo.png` i prijavljen kao `image/png`, primljen je bez primjedbe: „Logo je sačuvan.“ i `logo_path` je upisan u `gym_settings`. Provjerava se samo `file.type`, koji šalje browser. **Posljedica nije upad nego kvar:** takav „logo“ se ugrađuje u PDF kartica i izvještaja, pa generisanje PDF-a može pasti. Popravka: provjeriti prve bajtove fajla (PNG `89 50 4E 47`, JPEG `FF D8 FF`).

- **POPRAVLJENO.** `uploadLogo` sada čita prve bajtove fajla (PNG `89 50 4E 47`, JPEG `FF D8 FF`) i iz njih određuje tip i ekstenziju, umjesto da vjeruje browseru. Provjereno uživo: tekstualni fajl nazvan `logo.png` odbijen je sa „Dozvoljeni su PNG i JPG do 1 MB.“ i `logo_path` je ostao prazan.

### [SUSPECT-08] `z.coerce.boolean()` za „Iz kase“
- **Gdje:** `features/finance/schemas.ts:52`
- **Zašto:** `z.coerce.boolean()` pretvara **svaku** nepraznu nisku u `true`, uključujući `"false"`.
  Danas je bezopasno jer akcija šalje pravu logičku vrijednost (`formData.get("fromTill") === "on"`),
  ali je zamka za budućnost.
- **Test:** FIN-07 — provjerite da trošak bez kvačice „Iz kase“ zaista **nije** označen kao plaćen
  iz kase (kolona „Iz kase“ na `/finance/expenses`).

- **POTVRĐENO da je danas bezopasno.** Trošak sačuvan bez kvačice „Iz kase“ zaista je upisan sa `paid_from_till = false`. `z.coerce.boolean()` ipak ostaje zamka: niska `"false"` bi postala `true`; danas se ne dešava jer akcija šalje pravu logičku vrijednost. Popravka: isti `checkbox` obrazac koji već postoji u `catalog-schemas.ts`.

- **POPRAVLJENO.** `z.coerce.boolean()` zamijenjen je istim `checkbox` obrascem koji koriste podešavanja, pa niska `"false"` više ne može postati `true`. Pokriveno jediničnim testom `tests/unit/schema-bounds.test.ts`.

### [SUSPECT-09] Skeniranje hvata tastaturu na cijelom ekranu
- **Gdje:** `features/reception/components/reception-screen.tsx` (osluškivanje tastature na prozoru)
- **Zašto:** dok nijedno polje nema fokus, svaka cifra ulazi u „bafer skeniranja“, a Enter ga šalje.
  Slučajno kucanje po tastaturi može da izazove poruku „Neispravan kod kartice.“ Namjerno je tako
  napravljeno, ali treba potvrditi da ne smeta radu sa tastaturom (razmak na fokusiranom dugmetu,
  prečice).
- **Test:** REC-15 i REC-16.

- **POTVRĐENO** (uživo) i gore nego što je sumnja pretpostavljala. Jedna slučajna cifra otvori bafer skeniranja, a **svaki sljedeći znak, uključujući Razmak, ulazi u bafer** — provjereno tako što poslije `5` pa `Razmak` fokusirano dugme „Počni rad“ nije pritisnuto. Bafer se ne prazni sam, nego tek na Enter, pa jedna zalutala cifra oduzima tastaturu do sljedećeg Entera. Popravka: isprazniti bafer poslije oko 1 s bez kucanja — pravi skener otkuca kôd za nekoliko desetina milisekundi.

- **POPRAVLJENO.** Bafer skeniranja se sam prazni poslije 1 s bez kucanja (`SCAN_IDLE_MS`), što je daleko više nego što pravom skeneru treba za deset cifara. Provjereno uživo: poslije zalutale cifre i kratke pauze Razmak ponovo pritiska fokusirano dugme.

### [SUSPECT-10] Labava provjera identifikatora pri ponovnom slanju izvještaja
- **Gdje:** `features/finance/actions.ts:263`
- **Zašto:** umjesto provjere pravog UUID oblika koristi se `/^[0-9a-f-]{36}$/i`, što propušta i
  niske koje nisu UUID (npr. 36 crtica). Posljedica je najvjerovatnije samo greška baze umjesto
  uredne poruke, jer se smjena ionako provjerava po teretani.
- **Test:** ručno pozovite [Pošalji ponovo] sa izmijenjenim identifikatorom kroz Network tab i
  provjerite da odgovor bude uredna poruka, a ne greška servera.

- **POTVRĐENO, ali sa blažom posljedicom nego što je pretpostavljeno.** 36 crtica zaista prolazi regex `/^[0-9a-f-]{36}$/i`. Upit tada pada sa `22P02 invalid input syntax for type uuid`, ali se `error` ne čita, pa `data` ostane `null` i korisnik dobije „Nemate dozvolu za ovu radnju.“ — **nema greške servera**, ali se greška tiho guta i poruka je pogrešna. Popravka: `z.string().uuid()` umjesto ručnog regexa.

- **POPRAVLJENO.** Ručni regex zamijenjen je `z.string().uuid()` (`resendShiftSchema`), a greška upita se više ne guta — čita se i prijavljuje. Pokriveno jediničnim testom.

### [SUSPECT-11] Cijene u podešavanjima nemaju gornju granicu
- **Gdje:** `features/settings/catalog-schemas.ts:215` (i ostala polja koja koriste isti `money`)
- **Zašto:** dozvoljen je proizvoljno velik broj, a kolone su `numeric(10,2)`. Unos od npr.
  `99999999999` bi vjerovatno dao opštu grešku umjesto jasne poruke.
- **Test:** SET-18 — unesite `99999999999` u „Zamjenska kartica (€)“ i zabilježite poruku.

- **POTVRĐENO** (uživo). `99999999999` u polju „Zamjenska kartica (€)“ daje „Došlo je do greške. Pokušajte ponovo.“ kao opštu poruku iznad forme; u logu stoji `RPC failed: numeric field overflow`. Ispod polja nema ničega. Popravka: gornja granica u `money()` u `catalog-schemas.ts`, uz poruku „Unesite iznos…“.

- **POPRAVLJENO.** `money()` u `catalog-schemas.ts` ograničen je na šest cifara ispred decimalne tačke (numeric(10,2)); isto važi i za cijenu plana i za naknadu trenera, koje su imale svoje neograničene obrasce. Provjereno uživo: `99999999999` daje „Unesite iznos, na primjer 79 ili 79,50.“ ispod polja.

### [SUSPECT-12] Potvrda anonimizacije se oslanja na skriveno polje
- **Gdje:** `features/members/actions.ts` (`anonymizeSchema` poredi upisani broj sa brojem iz forme)
- **Zašto:** broj člana za poređenje dolazi iz skrivenog polja forme, pa je to zaštita od zabune,
  a ne od zlonamjernog korisnika. Pravu zaštitu daje provjera uloge i RPC. Vrijedi znati da
  „potvrda brojem“ nije bezbjednosna mjera.
- **Test:** MEM-14 i MEM-15 (uloge), a po želji izmjena skrivenog polja kroz Developer Tools —
  radnja i dalje mora da traži ulogu vlasnika.

- **POTVRĐENO** (uživo). Izmjenom skrivenog polja `memberNumber` na `999` i kucanjem `999` anonimizacija prolazi i član je anonimiziran. Potvrda brojem je dakle zaštita od zabune, ne od zlonamjernog korisnika — **prava zaštita stoji**: provjera uloge u akciji i `assert_staff_role(array['owner','admin'])` u `anonymize_member`. Nije greška, nego stvar koju treba znati.

- **Nije greška — dopisano objašnjenje u kod.** `anonymizeMember` sada nosi komentar da je kucanje broja zaštita od zabune, a da stvarnu zaštitu daju provjera uloge i `assert_staff_role` u `anonymize_member`. Ponašanje nepromijenjeno.

---

## 7. Otvorena pitanja

Ovdje su stvari koje iz koda **nisu jednoznačne**. Nije pogađano kakvo ponašanje treba da bude —
odluku donosi vlasnik.

1. **Emoji i ćirilica u imenima članova.** Kod ih nigdje izričito ne zabranjuje (ograničenje je
   samo dužina 1–50 znakova), ali nije napisano ni da su dozvoljeni, ni kako treba da izgledaju u
   PDF izvještaju. Da li ih treba odbiti pri unosu?
2. **Velika slova u korisničkom imenu.** Obrazac traži mala slova, a unos se prije provjere pretvara
   u mala. Nije jasno da li korisnik koji otkuca `Marija` treba da vidi grešku ili tiho prihvatanje.
3. **Gornja granica iznosa** za prebrojanu gotovinu pri preuzimanju smjene i za cijene u
   podešavanjima nije određena (vidi SUSPECT-05 i SUSPECT-11). Koja poruka treba da se prikaže?
4. **Period duži od 400 dana** na statistici je odbijen u bazi, ali ekran za to nema poruku
   (SUSPECT-01). Šta korisnik treba da vidi?
5. **Ponašanje pri isteku sesije** (kada Supabase token istekne nakon dužeg stajanja) nije opisano:
   da li korisnik treba da vidi poruku „sesija je istekla“ ili samo ekran prijave?
6. **Julijina naknada za personalne treninge (OQ-1)** je i dalje „nije definisano“. Obračun na
   `/finance/trainers` za nju ne pokazuje iznos za teretanu — potvrdite da je to prihvatljivo dok
   se ne odredi.
7. **Minimalna cijena personalnog treninga po treneru (OQ-2)**: sada je jedna za cijelu teretanu
   (80 €). Treba li različita po treneru?
8. **Primaoci izvještaja smjene (OQ-6)**: sada ide samo na adresu iz podešavanja. Treba li da ide i
   vlasniku kada aplikacija krene uživo?
9. **Hosting za produkciju (OQ-5)**: Vercel Hobby plan je za nekomercijalnu upotrebu. Nije odlučeno
   gdje se aplikacija hostuje kada teretana počne da je koristi.
10. **Dozvoljeni format kartice:** kôd je tačno 10 cifara i ne počinje nulom. Nije napisano šta
    raditi ako štampar isporuči kartice u drugom formatu.
11. **Ponašanje pri dva pulta u isto vrijeme:** BR-110 dozvoljava samo jednu otvorenu smjenu po
    teretani. Nije opisano šta ako teretana ikad bude imala dva pulta istovremeno.

---


## 8. Rezime

### 8.1 Broj testova po modulu i prioritetu

| Modul | Kritično | Visoko | Srednje | Nisko | Ukupno |
|---|---:|---:|---:|---:|---:|
| AUTH — prijava, lozinke, sesija | 9 | 8 | 7 | 0 | **24** |
| PERM — dozvole i rute | 10 | 3 | 0 | 0 | **13** |
| SHIFT — smjene | 5 | 3 | 3 | 0 | **11** |
| REC — recepcija i dolasci | 7 | 8 | 5 | 1 | **21** |
| MEM — članovi | 8 | 8 | 1 | 1 | **18** |
| MSHIP — članarine | 8 | 8 | 1 | 0 | **17** |
| PAY — uplate i troškovi pulta | 7 | 6 | 2 | 1 | **16** |
| STO — magacin | 1 | 8 | 2 | 1 | **12** |
| CLOSE — zaključenje smjene | 5 | 1 | 2 | 0 | **8** |
| SET — podešavanja i katalog | 6 | 10 | 3 | 1 | **20** |
| CARD — kartice | 0 | 3 | 1 | 1 | **5** |
| FIN — finansije vlasnika | 2 | 10 | 5 | 0 | **17** |
| STAT — statistika dolazaka | 0 | 2 | 3 | 0 | **5** |
| JOB — poslovi, email, kopija | 2 | 3 | 2 | 0 | **7** |
| SEC — bezbjednost | 4 | 4 | 1 | 0 | **9** |
| UX — greške i ponašanje ekrana | 1 | 1 | 3 | 1 | **6** |
| E2E — cjeloviti tokovi | 3 | 4 | 1 | 0 | **8** |
| **Ukupno** | **78** | **90** | **42** | **7** | **217** |

Uz to: **12 sumnjivih mjesta u kodu** (§6) i **11 otvorenih pitanja** (§7).

### 8.2 Preporučeni redoslijed

| Korak | Šta | Zašto tim redom | Procjena |
|---|---|---|---|
| 1 | Priprema iz §1 (seed, nalozi, kartice, test članovi) | bez ovoga ništa drugo ne može | 1 h |
| 2 | **AUTH** (sve) | ako prijava ne radi, ostatak nema smisla | 1,5 h |
| 3 | **PERM** (sve) | najskuplja greška je da recepcioner vidi finansije | 1 h |
| 4 | **SHIFT** + **CLOSE** | bez smjene se ništa ne naplaćuje, a zaključenje je dnevni obračun | 1,5 h |
| 5 | **REC** | najčešća radnja u teretani | 2 h |
| 6 | **MEM** + **MSHIP** | temelj podataka i sva pravila datuma i iznosa | 3 h |
| 7 | **PAY** + **STO** | novac na pultu | 2 h |
| 8 | **SET** + **CARD** | cijene i nalozi; kartice su potrebne već u koraku 5, pa se CARD-01 radi ranije | 2 h |
| 9 | **FIN** + **STAT** | izvještaji imaju smisla tek kad ima prometa iz prethodnih koraka | 2 h |
| 10 | **JOB** | noćni posao mijenja stanje, pa ide poslije provjere svakodnevnog rada | 1 h |
| 11 | **SEC** + **UX** | provjera otpornosti kada je sve ostalo potvrđeno | 1,5 h |
| 12 | **E2E-01 do E2E-08** | završna provjera da cjelina radi kao cjelina | 2 h |
| 13 | **§5 uređaji** (desktop i mobilni) | raspored se provjerava na gotovoj aplikaciji | 1 h |
| 14 | **§6 sumnjiva mjesta** | ciljane provjere; nalaze upisati kao bugove | 1 h |

Ukupna procjena: **oko 22 sata** pažljivog rada, odnosno tri radna dana. Ako imate manje vremena,
uradite korake 1–7 (to je oko 12 sati) — tu su svi testovi označeni kao **Kritično**.

### 8.3 Pokrivenost iz inventara (Korak 1)

- **23 ekrana** iz §2.2: svaki ima bar jedan test (recepcija, članovi, profil, uplate danas,
  magacin, S-02, S-14, statistika, sedam finansijskih, šest u podešavanjima, prijava, promjena
  lozinke, početna).
- **4 rute servisa:** `POST /api/jobs/[job]` (PERM-12, JOB-01 do JOB-07),
  `GET /api/pdf/shift/[id]` (PERM-09, CLOSE-05), `GET /api/pdf/cards/[batchId]` (PERM-10, CARD-03),
  `GET /auth/callback` (AUTH-14, AUTH-15, AUTH-16).
- **Sve forme:** prijava, promjena lozinke, reset lozinke, novi član, izmjena člana, anonimizacija,
  zamjena kartice, prodaja članarine, dnevna karta, trošak pulta, ispravka uplate, poništavanje,
  prodaja iz magacina, nova roba, ispravka prodaje, zaključenje smjene, preuzimanje smjene,
  novi/izmjena korisnika, nova lozinka korisnika, (de)aktivacija, trener, naknada trenera, program,
  dodjela, čas, plan, proizvod, kategorija, podešavanja teretane, logo, serija kartica, novi trošak
  vlasnika, poništavanje troška, četiri forme naknadnog unosa, zaključenje tuđe smjene, ponovno
  slanje izvještaja.
- **Sve uloge:** administrator, vlasnik, menadžer, recepcioner — svaka ima svoj red u PERM matrici.

---

*Kraj plana. Rezultate upisujte direktno u ovaj fajl (kvadratići i polje „Napomena“), pa
nam prijavite šta je palo.*



