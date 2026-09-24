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

> **Dopuna 24.09.2026 (2):** odluke vlasnika — emoji u imenu člana se odbija (N-16, D-66, MEM-07
> sada PROŠLO), dnevnik izmjena prikazuje nazive i vrijednosti sa ekrana (N-21), izvještaj smjene
> ide i vlasniku (D-65), N-23 ostaje bez provjere u bazi (D-67). Novo stanje: **215 prošlo ·
> 0 palo · 1 djelimično · 1 nije izvršeno** (AUTH-13, AUTH-14). Detalji u **§9.11**.

> **Dopuna 24.09.2026:** izvršena su sva 22 preostala djelimična slučaja prioriteta **Srednje** i
> **Nisko** — svi PROŠLI, sedam tek nakon popravki **N-22 do N-26**. N-23 (recepcioner radi u
> tuđoj smjeni mimo ekrana S-02) zatvoren je u aplikaciji, a S-02 više nema meni; vlasnik je
> odlučio da se to ne zabranjuje i u bazi. Popravljen je i **N-27** (CSP u produkciji blokirao stil dijaloga);
> **N-28** se tiče samo lokalnog produkcijskog testa na HTTP-u. Novo stanje: **214 prošlo · 1 palo · 1 djelimično · 1 nije izvršeno**
> (MEM-07, AUTH-13, AUTH-14). Detalji u **§9.10**.

> **Dopuna 23.09.2026:** izvršeno 18 od 19 slučajeva koji su bili NIJE IZVRŠENO (ostaje samo
> AUTH-14, stvarni link iz sandučeta). Svih 18 PROŠLO; dva tek nakon popravki **N-06** i **N-07**.
> Novo stanje: **70 prošlo · 0 palo · 146 djelimično · 1 nije izvršeno.** Detalji u **§9.5**.

> **Dopuna 23.09.2026 (5):** izvršeni svi djelimični slučajevi prioriteta **Visoko** (88 PROŠLO),
> uz popravke **N-17 do N-20**; otvoreni su nalazi **N-16** (emoji u PDF-u, MEM-07 PALO) i **N-21**
> (dnevnik izmjena prikazuje nazive kolona iz baze). Od visokih nije izvršen samo AUTH-14.
> Novo stanje: **192 prošlo · 1 palo · 23 djelimično · 1 nije izvršeno.** Detalji u **§9.9**.

> **Dopuna 23.09.2026 (4):** migracija 0027 primijenjena; još 15 kritičnih slučajeva PROŠLO
> (E2E-01 do 03, SEC-01/03/09, JOB-01, …). Od kritičnih je djelimičan ostao samo AUTH-13.
> Novo stanje: **125 prošlo · 0 palo · 91 djelimično · 1 nije izvršeno.** Detalji u **§9.8**.

> **Dopuna 23.09.2026 (3):** još 25 kritičnih slučajeva PROŠLO, uz popravke **N-13 do N-15** i
> odluku D-64. Novo stanje: **110 prošlo · 0 palo · 106 djelimično · 1 nije izvršeno.**
> Detalji u **§9.7**.

> **Dopuna 23.09.2026 (2):** preostali koraci 15 kritičnih djelimičnih slučajeva izvršeni i PROŠLI,
> uz popravke **N-09 do N-12**. Novo stanje: **85 prošlo · 0 palo · 131 djelimično · 1 nije izvršeno.**
> Detalji u **§9.6**.

> **Izvršavanje 22.09.2026:** rezultati ovog prolaza upisani su uz svih 217 slučajeva u §3–4.
> **48 prošlo · 2 palo · 148 djelimično · 19 nije izvršeno.**
> Djelimična provjera nije kompletan prolaz: napomena navodi dokaz i preostale korake.
> Tehničke provjere, novi nalazi i ograničenja su u **§9**. Stariji nalazi/popravke iz §6
> ostavljeni su kao istorija i ne znače da je svaki njihov UI korak ponovljen danas.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-access.spec.ts`: `/` vodi na `/login`; seed vlasnik (`matija.vojinovic@eurotehnikamn.me` + `SEED_OWNER_PASSWORD`) dolazi na `/finance`; zaglavlje „KP Fitness“, meni naloga „Vlasnik“; navigacija tačno Recepcija, Članovi, Uplate danas, Magacin, Statistika dolazaka, Finansije, Podešavanja (bez „Zaključi smjenu“). Samo čitanje; nalog odmah odjavljen. Raniji dokaz (22.09.): E2E admin.spec.ts: vlasnik sa korisničkim imenom dolazi na /finance; foundation.spec.ts: odjavljeni / ide na /login. Seed vlasnik sa emailom i kompletan meni nisu provjereni ovim testom.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-access.spec.ts`: korisničko ime → `/reception`, značka „Smjena: <ime> od HH:MM“, meni ima „Zaključi smjenu“, a nema „Finansije“ ni „Statistika dolazaka“; u bazi tačno jedna otvorena smjena tog recepcionera. Raniji dokaz (22.09.): E2E shifts.spec.ts: prijava korisničkim imenom, /reception, značka i tačno jedna otvorena smjena provjereni. Kompletna navigacija nije posebno upoređena.

### [AUTH-03] Pogrešna lozinka
- **Prioritet:** Kritično
- **Uloga / preduslovi:** bilo koji nalog
- **Koraci:** unesite tačno korisničko ime i namjerno pogrešnu lozinku → [Prijavi se].
- **Test podaci:** `recepcija1` / `pogresna123`
- **Očekivani rezultat:** crvena poruka „Pogrešno korisničko ime/email ili lozinka.“ Ostajete na
  `/login`, polje lozinke se ne pamti.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** E2E auth.spec.ts + dodatna UI provjera: neutralna poruka, ostaje /login, polje lozinke se prazni.

### [AUTH-04] Nepostojeći nalog daje istu poruku (bez otkrivanja naloga)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** —
- **Koraci:** prijavite se kao `ne.postoji` sa bilo kojom lozinkom; zatim kao
  `nepostojeci@primjer.com`.
- **Test podaci:** `ne.postoji` / `bilosta123`
- **Očekivani rezultat:** ista poruka kao u AUTH-03, riječ u riječ. Ništa ne smije da nagovijesti
  da nalog ne postoji, ni vrijeme odgovora ne smije biti bitno različito.
- **Gdje provjeriti:** UI; Network tab (status i tijelo odgovora isti kao kod pogrešne lozinke)
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO uz napomenu.** `test-plan-rest.spec.ts`: pogrešna lozinka postojećeg naloga, nepostojeće korisničko ime `ne.postoji` i nepostojeći email daju riječ u riječ „Pogrešno korisničko ime/email ili lozinka.“ i ostaju na `/login`. Medijan vremena (3 pokušaja, dev server): 327 ms za postojeći nalog, 220/225 ms za nepostojeće — razlika od ~0,1 s dolazi iz Supabase Auth provjere lozinke; nije mjereno na produkciji (§9.8). Raniji dokaz (22.09.): UI: nepostojeće korisničko ime i email daju istu neutralnu poruku. Nisu mjerena vremena odgovora radi detekcije naloga.

### [AUTH-05] Prazna polja
- **Prioritet:** Visoko
- **Uloga / preduslovi:** —
- **Koraci:** kliknite [Prijavi se] bez ijednog unosa; zatim unesite samo korisničko ime;
  zatim samo lozinku.
- **Test podaci:** prazno / prazno
- **Očekivani rezultat:** u sva tri slučaja „Pogrešno korisničko ime/email ili lozinka.“
  Aplikacija ne puca i ne šalje zahtjev u nedogled.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** Dodatne UI provjere u Chromeu, na odvojenim test nalozima; izvršeni unosi, preusmjerenja i očekivane poruke iz ovog slučaja. AUTH-09: testiran vlasnik.

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
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** Dodatne UI provjere u Chromeu, na odvojenim test nalozima; izvršeni unosi, preusmjerenja i očekivane poruke iz ovog slučaja. AUTH-09: testiran vlasnik.

### [AUTH-07] Lozinka kraća od 8 znakova
- **Prioritet:** Visoko
- **Uloga / preduslovi:** ekran S-01b (nastavak AUTH-06)
- **Koraci:** u „Nova lozinka“ i „Ponovi lozinku“ unesite `1234567` → [Sačuvaj].
- **Test podaci:** `1234567` (7 znakova)
- **Očekivani rezultat:** poruka ispod polja „Lozinka mora imati najmanje 8 znakova.“ Ništa nije
  sačuvano.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** Dodatne UI provjere u Chromeu, na odvojenim test nalozima; izvršeni unosi, preusmjerenja i očekivane poruke iz ovog slučaja. AUTH-09: testiran vlasnik.

### [AUTH-08] Lozinke se ne poklapaju
- **Prioritet:** Visoko
- **Uloga / preduslovi:** ekran S-01b
- **Koraci:** „Nova lozinka“ = `Lozinka5678`, „Ponovi lozinku“ = `Lozinka5679` → [Sačuvaj].
- **Test podaci:** kao gore
- **Očekivani rezultat:** poruka uz polje za ponavljanje: „Lozinke se ne poklapaju.“
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** Dodatne UI provjere u Chromeu, na odvojenim test nalozima; izvršeni unosi, preusmjerenja i očekivane poruke iz ovog slučaja. AUTH-09: testiran vlasnik.

### [AUTH-09] Granica dužine lozinke: tačno 8 znakova prolazi
- **Prioritet:** Srednje
- **Uloga / preduslovi:** ekran S-01b
- **Koraci:** unesite `Lozinka1` dvaput → [Sačuvaj].
- **Test podaci:** `Lozinka1` (8 znakova)
- **Očekivani rezultat:** lozinka je prihvaćena; recepcioner nastavlja na `/reception` (ili na
  S-02 ako je tuđa smjena otvorena), vlasnik/menadžer na svoj početni ekran.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** Dodatne UI provjere u Chromeu, na odvojenim test nalozima; izvršeni unosi, preusmjerenja i očekivane poruke iz ovog slučaja. AUTH-09: testiran vlasnik.

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
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** Dodatne UI provjere u Chromeu, na odvojenim test nalozima; izvršeni unosi, preusmjerenja i očekivane poruke iz ovog slučaja. AUTH-09: testiran vlasnik.

### [AUTH-11] Admin vidi novu lozinku zaposlenog (D-59)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Administrator; zaposleni iz AUTH-10 je upravo promijenio lozinku
- **Koraci:** prijavite se kao administrator → `/settings/users` → u redu tog zaposlenog kliknite
  [Prikaži] u koloni „Lozinka“.
- **Test podaci:** —
- **Očekivani rezultat:** prikazuje se **nova** lozinka u čitljivom obliku (ne stara). Dugme se
  mijenja u [Sakrij].
- **Gdje provjeriti:** UI; baza: `staff_credentials.password`
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** Dodatne UI provjere u Chromeu, na odvojenim test nalozima; izvršeni unosi, preusmjerenja i očekivane poruke iz ovog slučaja. AUTH-09: testiran vlasnik.

### [AUTH-12] Zaboravljena lozinka za nalog sa korisničkim imenom
- **Prioritet:** Srednje
- **Uloga / preduslovi:** odjavljeni
- **Koraci:** `/login` → [Zaboravljena lozinka?] → unesite `recepcija1` → [Pošalji link].
- **Test podaci:** `recepcija1`
- **Očekivani rezultat:** poruka „Lozinku vam postavlja administrator, vlasnik ili menadžer.“
  Nikakav email se ne šalje.
- **Gdje provjeriti:** UI; Network tab
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** E2E foundation.spec.ts, desktop i 375 px: korisničko ime dobija poruku da lozinku postavlja administrator/vlasnik/menadžer.

### [AUTH-13] Zaboravljena lozinka za nepostojeći email ne otkriva naloge
- **Prioritet:** Kritično
- **Uloga / preduslovi:** odjavljeni
- **Koraci:** [Zaboravljena lozinka?] → `nepostoji@primjer.com` → [Pošalji link]. Ponovite sa
  email adresom administratora.
- **Test podaci:** `nepostoji@primjer.com`, pa `ADMIN_EMAIL`
- **Očekivani rezultat:** **obje** radnje daju istu poruku: „Ako nalog postoji, poslali smo link za
  promjenu lozinke na taj email.“ Email stiže samo u drugom slučaju.
- **Gdje provjeriti:** UI; sanduče administratora
- [ ] Prošlo  [ ] Palo  Napomena: **22.09.2026 — DJELOMIČNO.** Dodatna UI provjera nepostojećeg emaila vraća očekivanu neutralnu poruku. Reset postojećeg email naloga i prijem reset linka nisu potvrđeni; testovi poslovnog emaila ne dokazuju Supabase Auth/SMTP.

### [AUTH-14] Link iz emaila vodi na promjenu lozinke
- **Prioritet:** Visoko
- **Uloga / preduslovi:** email iz AUTH-13 je stigao; `APP_URL` je podešen
- **Koraci:** otvorite link iz emaila; postavite novu lozinku; prijavite se njome.
- **Test podaci:** nova lozinka `AdminNova123`
- **Očekivani rezultat:** link vodi na `/auth/callback?...next=/change-password`, pa na ekran
  promjene lozinke. Nakon čuvanja, prijava novom lozinkom uspijeva.
- **Gdje provjeriti:** UI, adresna linija, email
- [ ] Prošlo  [ ] Palo  Napomena: **22.09.2026 — NIJE IZVRŠENO.** Nije dostupan stvarni recovery link iz sandučeta testnog Auth naloga. Slanje poslovnih emailova kroz Resend nije ovaj tok.

### [AUTH-15] Neispravan ili istekao kod u callbacku
- **Prioritet:** Srednje
- **Uloga / preduslovi:** odjavljeni
- **Koraci:** otvorite `http://localhost:3000/auth/callback?code=neispravan` i
  `http://localhost:3000/auth/callback` (bez koda).
- **Test podaci:** `code=neispravan`
- **Očekivani rezultat:** oba puta preusmjerenje na `/login`, bez poruke o grešci i bez sesije.
- **Gdje provjeriti:** UI, adresna linija
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** Dodatne UI provjere u Chromeu, na odvojenim test nalozima; izvršeni unosi, preusmjerenja i očekivane poruke iz ovog slučaja. AUTH-09: testiran vlasnik.

### [AUTH-16] Callback ne smije da vodi van aplikacije (otvoreno preusmjerenje)
- **Prioritet:** Kritično (bezbjednost)
- **Uloga / preduslovi:** —
- **Koraci:** otvorite `/auth/callback?next=//example.com` i `/auth/callback?next=https://example.com`.
- **Test podaci:** kao gore
- **Očekivani rezultat:** nikada ne odlazite na `example.com`. Završavate na `/change-password`
  ili `/login`.
- **Gdje provjeriti:** adresna linija, Network tab
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO poslije popravke.** Nalaz N-03 je potvrđen: `/\example.org` je prolazio filter i `new URL` ga je razrješavao na `https://example.org/`. Odredište sada bira `inAppRedirect` u `features/auth/schemas.ts`, koje poredi razriješeni origin sa origin-om aplikacije; `app/auth/callback/route.ts` ga koristi. Pokriveno sa 5 jediničnih testova u `tests/unit/auth-schemas.test.ts` (obrnuta kosa crta, `//`, strani apsolutni URL, `javascript:`, prazno). Kompletan napad sa važećim recovery kodom i dalje nije izveden.

### [AUTH-17] Odjava recepcionera traži potvrdu dok je smjena otvorena
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Recepcioner A sa otvorenom smjenom
- **Koraci:** meni naloga → [Odjava] → pročitajte dijalog → potvrdite.
- **Test podaci:** —
- **Očekivani rezultat:** dijalog „Odjava“ sa tekstom „Smjena ostaje otvorena. Odjaviti se?“.
  Nakon potvrde ste na `/login`, a smjena u bazi **ostaje otvorena**.
- **Gdje provjeriti:** UI; baza: `shifts.closed_at` i dalje `null`
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** E2E shifts.spec.ts: potvrda odjave, prelazak na /login i otvorena smjena ostaje u bazi; oba viewporta.

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
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** Dodatne UI provjere u Chromeu, na odvojenim test nalozima; izvršeni unosi, preusmjerenja i očekivane poruke iz ovog slučaja. AUTH-09: testiran vlasnik.

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
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** E2E auth.spec.ts + DB 0001: deaktiviran testni nalog na sljedećem zahtjevu gubi pristup.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-a.spec.ts`: F5 na recepciji zadržava sesiju i značku; `/members` → nazad → naprijed radi; druga kartica na `/payments/today` ima istu značku; odjava u prvoj kartici (uz potvrdu da smjena ostaje otvorena), klik u meniju druge kartice vodi na `/login`. Raniji dokaz (22.09.): Dodatna SEC-06 provjera: Nazad nakon odjave ostaje na /login. Osvježavanje i sinhronizacija dvije kartice nisu izvršeni kao cijeli scenario.

### [AUTH-22] Razmaci i velika slova u korisničkom imenu
- **Prioritet:** Srednje
- **Uloga / preduslovi:** Recepcioner A
- **Koraci:** prijavite se sa `  Recepcija1  ` (razmaci ispred i iza, veliko R).
- **Test podaci:** `  Recepcija1  `
- **Očekivani rezultat:** prijava uspijeva — ime se skraćuje i pretvara u mala slova prije nego
  što se preslika u internu adresu. Ako padne, to je bug.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** Dodatne UI provjere u Chromeu, na odvojenim test nalozima; izvršeni unosi, preusmjerenja i očekivane poruke iz ovog slučaja. AUTH-09: testiran vlasnik.

### [AUTH-23] HTML/JS i SQL znakovi u polju za prijavu
- **Prioritet:** Kritično (bezbjednost)
- **Uloga / preduslovi:** —
- **Koraci:** u polje „Korisničko ime ili email“ redom unesite vrijednosti ispod i svaki put
  kliknite [Prijavi se].
- **Test podaci:** `<script>alert(1)</script>` · `' OR 1=1 --` · `"; drop table members; --` · `admin@x.com' --`
- **Očekivani rezultat:** svaki put samo „Pogrešno korisničko ime/email ili lozinka.“ Nema
  iskačućeg prozora, nema greške servera (HTTP 500), tabela `members` i dalje postoji.
- **Gdje provjeriti:** UI, Network tab, konzola browsera
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** Dodatne UI provjere u Chromeu, na odvojenim test nalozima; izvršeni unosi, preusmjerenja i očekivane poruke iz ovog slučaja. AUTH-09: testiran vlasnik.

### [AUTH-24] Vrlo dug unos
- **Prioritet:** Srednje
- **Uloga / preduslovi:** —
- **Koraci:** nalijepite 10 000 znakova `a` u polje korisničkog imena i u lozinku → [Prijavi se].
- **Test podaci:** 10 000 × `a`
- **Očekivani rezultat:** uredno odbijanje (ista poruka o pogrešnoj prijavi) ili poruka o grešci;
  aplikacija se ne ruši i stranica ostaje upotrebljiva.
- **Gdje provjeriti:** UI, Network tab
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** Dodatne UI provjere u Chromeu, na odvojenim test nalozima; izvršeni unosi, preusmjerenja i očekivane poruke iz ovog slučaja. AUTH-09: testiran vlasnik.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-access.spec.ts`: recepcioner otvara `/reception`, `/members`, `/members/<id>`, `/payments/today`, `/storage`, `/shift/close`; svih 7 `/finance/...`, 6 `/settings/...` i `/stats/visits` daju stranicu 404. Sa svojom otvorenom smjenom `/shift/gate` se otvara (ostaje na toj adresi). Raniji dokaz (22.09.): Dodatna UI matrica otvorila je sve statičke rute za recepcionera, menadžera, vlasnika i admina: dozvoljene imaju naslov, zabranjene 404. Profil konkretnog člana i svi detalji menija nisu dio matrice; /shift/gate za recepcionera pokriva shifts.spec.ts.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-access.spec.ts`: menadžer otvara pultne ekrane, profil člana, `/stats/visits`, `/settings/users`, `/settings/trainers`, `/settings/cards`; 404 za svih 7 finansijskih ruta, `/settings/plans`, `/settings/products`, `/settings/gym`, `/shift/close` i `/shift/gate`. Raniji dokaz (22.09.): Dodatna UI matrica otvorila je sve statičke rute za recepcionera, menadžera, vlasnika i admina: dozvoljene imaju naslov, zabranjene 404. Profil konkretnog člana i svi detalji menija nisu dio matrice; /shift/gate za recepcionera pokriva shifts.spec.ts.

### [PERM-03] Matrica pristupa — vlasnik i administrator
- **Prioritet:** Kritično
- **Uloga / preduslovi:** Vlasnik, pa Administrator
- **Koraci:** otvorite sve rute iz §2.2.
- **Test podaci:** sve rute
- **Očekivani rezultat:** obje uloge otvaraju sve osim `/shift/close` i `/shift/gate` (404, to je
  samo recepcionerovo). Administrator vidi isto što i vlasnik, plus kolonu „Lozinka“ na S-23.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-access.spec.ts`: vlasnik i administrator otvaraju sve rute uključujući profil člana, a 404 dobijaju samo `/shift/close` i `/shift/gate`. Kolonu „Lozinka“ za administratora potvrđuje PERM-08. Raniji dokaz (22.09.): Dodatna UI matrica otvorila je sve statičke rute za recepcionera, menadžera, vlasnika i admina: dozvoljene imaju naslov, zabranjene 404. Profil konkretnog člana i svi detalji menija nisu dio matrice; /shift/gate za recepcionera pokriva shifts.spec.ts.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `tests/e2e/test-plan-extra.spec.ts`: glavni meni i podmeni „Podešavanja“ upoređeni za recepcionera, menadžera, vlasnika i administratora (1366 px). Tačno očekivane stavke i redoslijed; vlasnik/administrator nemaju „Zaključi smjenu“. Mobilni meni nije posebno prepisan.

### [PERM-05] Menadžer ne smije da mijenja vlasnika ni administratora (AS-5, P-03)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** Menadžer, postoje nalozi vlasnika i administratora
- **Koraci:** `/settings/users` → pogledajte redove vlasnika i administratora.
- **Test podaci:** —
- **Očekivani rezultat:** ti redovi nemaju nijedno dugme radnje ([Uredi], [Nova lozinka],
  [Deaktiviraj]). Menadžer u formi „Novi korisnik“ u padajućoj listi uloga **ne smije** moći da
  sačuva vlasnika ili administratora; ako pokuša, odgovor je „Nemate dozvolu za ovu radnju.“
- **Gdje provjeriti:** UI; Network tab (odgovor server akcije)
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-critical.spec.ts`: menadžeru redovi vlasnika i administratora nemaju nijedno dugme (recepcioner ima [Uredi]); lista uloga nema „Vlasnik“ ni „Administrator“. Krivotvoreni zahtjev (opcija `owner` ubačena u DOM) vraća „Nemate dozvolu za ovu radnju.“, a nalog nije napravljen. Raniji dokaz (22.09.): E2E auth/admin.spec.ts: menadžeru nisu ponuđeni vlasnik i akcija uređivanja vlasnika. Sve izmjene zahtjeva i administratorskog reda nisu ponovljene.

### [PERM-06] Recepcioner ne vidi tuđe uplate ni tuđe troškove
- **Prioritet:** Kritično
- **Uloga / preduslovi:** Recepcioner A; vlasnik je ranije unio trošak, i postoji uplata od juče
- **Koraci:** `/payments/today` → pogledajte sekcije „Uplate“ i „Moji troškovi danas“.
- **Test podaci:** —
- **Očekivani rezultat:** vidi **samo današnje** uplate koje nisu naknadni unos, i **samo svoje**
  troškove. Naslov sekcije troškova glasi „Moji troškovi danas“ (vlasnik vidi „Troškovi danas“).
- **Gdje provjeriti:** UI; uporedite sa istim ekranom kao vlasnik
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-access.spec.ts`: recepcioner na S-12 ima sekciju „Moji troškovi danas“ (ne „Troškovi danas“), vidi svoj trošak, a ne vidi vlasnikov trošak, jučerašnju uplatu ni današnju naknadno unesenu. Vlasnik vidi „Troškovi danas“ sa oba troška; ni vlasnikov S-12 ne prikazuje naknadne unose (to je S-22). Raniji dokaz (22.09.): DB 0006_members i 0008_desk_money: RLS vidljivost uplata/troškova po ulogama prolazi. Nije u cijelosti upoređen svaki red i oznaka u UI-ju.

### [PERM-07] Profil člana: istorija uplata po ulogama
- **Prioritet:** Visoko
- **Uloga / preduslovi:** član sa uplatama iz više dana
- **Koraci:** otvorite profil tog člana kao recepcioner, pa kao vlasnik; uporedite karticu „Uplate“.
- **Test podaci:** član `Ana Anić`
- **Očekivani rezultat:** recepcioner vidi samo današnje uplate; vlasnik vidi sve, uključujući
  naknadne (oznaka „Naknadno“) i poništene (oznaka „Poništeno“, precrtano).
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-a.spec.ts`: član sa naknadnom uplatom od prije 3 dana, poništenom od prije 2 dana i današnjom prodajom: recepcioner na kartici „Uplate“ vidi samo današnju; vlasnik vidi sve tri, dvije sa „Naknadno“, poništenu sa „Poništeno“ i precrtanu. Raniji dokaz (22.09.): DB 0006_members i 0008_desk_money: RLS vidljivost uplata/troškova po ulogama prolazi. Nije u cijelosti upoređen svaki red i oznaka u UI-ju.

### [PERM-08] Lozinke zaposlenih vidi samo administrator
- **Prioritet:** Kritično (bezbjednost)
- **Uloga / preduslovi:** Vlasnik i Menadžer
- **Koraci:** `/settings/users` kao vlasnik, pa kao menadžer.
- **Test podaci:** —
- **Očekivani rezultat:** kolona „Lozinka“ **ne postoji** ni za vlasnika ni za menadžera. Samo
  administrator je vidi.
- **Gdje provjeriti:** UI; Network tab (u odgovoru stranice ne smije biti lozinki)
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-critical.spec.ts`: vlasnik i menadžer nemaju kolonu „Lozinka“; u HTML-u i svim RSC odgovorima `/settings/users` nema nijedne sačuvane lozinke (ni vlasnikove, ni menadžerove, ni zajedničke testne). Administrator vidi kolonu i sačuvanu vrijednost nakon [Prikaži]. Raniji dokaz (22.09.): E2E admin.spec.ts i DB 0002: samo admin vidi lozinke; vlasnik/menadžer ne. Nije posebno pretražen svaki RSC odgovor za lozinke.

### [PERM-09] PDF izvještaja smjene je samo vlasnikov
- **Prioritet:** Kritično
- **Uloga / preduslovi:** postoji zaključena smjena sa izvještajem; zabilježite njen `id` iz S-19
- **Koraci:** kao vlasnik otvorite `/api/pdf/shift/<id>`; zatim se prijavite kao menadžer, pa kao
  recepcioner, i otvorite isti URL.
- **Test podaci:** id zaključene smjene
- **Očekivani rezultat:** vlasnik i administrator dobijaju PDF; menadžer i recepcioner dobijaju
  **404**, bez ikakvog sadržaja.
- **Gdje provjeriti:** browser, Network tab
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-critical.spec.ts`: za zaključenu smjenu sa izvještajem `/api/pdf/shift/<id>` vraća 200 `application/pdf` (`%PDF-`) vlasniku i administratoru, a 404 bez PDF sadržaja menadžeru i recepcioneru. Raniji dokaz (22.09.): DB 0010 potvrđuje pristup podacima izvještaja, E2E close-shift potvrđuje privatni PDF. Sve četiri uloge nisu pozvale samu PDF rutu.

### [PERM-10] PDF lista kartica
- **Prioritet:** Visoko
- **Uloga / preduslovi:** postoji serija kartica
- **Koraci:** otvorite `/api/pdf/cards/<batchId>` kao vlasnik, menadžer i recepcioner.
- **Test podaci:** id serije iz S-28
- **Očekivani rezultat:** vlasnik, administrator i menadžer dobijaju PDF; recepcioner 404.
- **Gdje provjeriti:** browser
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-a.spec.ts`: `/api/pdf/cards/<batchId>` vraća PDF vlasniku, administratoru i menadžeru, a 404 bez PDF-a recepcioneru. Raniji dokaz (22.09.): E2E cards.spec.ts: vlasnik preuzima PDF, recepcioner dobija 404. Admin/menadžer nisu zasebno preuzeli PDF.

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
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** Dodatni Chrome/HTTP test: sva tri neispravna URL-a člana prikazuju 404; oba navedena neispravna PDF URL-a vraćaju HTTP 404. Ovo ne dokazuje zasebno izolaciju dvije teretane na PDF ruti.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-critical.spec.ts`: GET, POST bez zaglavlja i POST sa `x-cron-secret: pogresno` vraćaju 401 `{"error":"unauthorized"}`; nepostojeći posao sa ispravnom tajnom 404 `{"error":"unknown job"}`. Broj redova `job_runs` isti prije i poslije. Raniji dokaz (22.09.): E2E jobs.spec.ts + dodatni HTTP: GET, POST bez/pogrešnom tajnom daju 401; nepostojeći posao sa ispravnom tajnom daje 404 i očekivani JSON. Broj redova job_runs nije mjeren prije/poslije.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO (bezbjednost) uz odstupanje u poruci.** `test-plan-critical.spec.ts`: menadžer na `/finance/expenses` dobija stranicu 404 (HTTP status je 200 zbog streaminga, vidi §9.6). Snimljen zahtjev server akcije `saveExpense` ponovljen sa menadžerovom sesijom vraća HTTP 500 i opštu grešku umjesto „Nemate dozvolu za ovu radnju.“ (`requireOwner` baca izuzetak). Ništa nije upisano u bazu. Raniji dokaz (22.09.): E2E finance.spec.ts: zabranjene rute; DB 0012: RPC/finansijske tabele nedostupne pogrešnim ulogama. Prepravljeni Next server-action zahtjev nije poslat.

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
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** E2E shifts.spec.ts i DB 0005: nastavak smjene, S-02, preuzimanje sa 120,50 €, zatvaranje prethodne, nova značka i sačuvani PDF. Stvarno slanje izvještaja dodatno provjereno u §9.

### [SHIFT-02] Drugi recepcioner dobija ekran „Otvorena smjena“ (S-02)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** Recepcioner A ima otvorenu smjenu; prijavljujete se kao Recepcioner B
- **Koraci:** odjavite A (smjena ostaje otvorena) → prijavite se kao `recepcija2`.
- **Test podaci:** `recepcija2`
- **Očekivani rezultat:** ekran `/shift/gate` sa naslovom „Otvorena smjena“ i tekstom
  „Otvorena je smjena: <ime A> (od dd.mm.gggg HH:MM).“ Ispod: polje „Prebrojana gotovina za
  prethodnu smjenu (€)“, dugmad [Preuzmi smjenu] i [Odjavi se].
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** E2E shifts.spec.ts i DB 0005: nastavak smjene, S-02, preuzimanje sa 120,50 €, zatvaranje prethodne, nova značka i sačuvani PDF. Stvarno slanje izvještaja dodatno provjereno u §9.

### [SHIFT-03] Preuzimanje smjene (E19)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** nastavak SHIFT-02; u smjeni A postoji bar jedna uplata
- **Koraci:** unesite `150,50` u polje prebrojane gotovine → [Preuzmi smjenu].
- **Test podaci:** `150,50`
- **Očekivani rezultat:** prelazite na `/reception`; značka pokazuje **vaše** ime i novo vrijeme.
  Smjena A je zatvorena sa načinom „Preuzeo/la <ime B>“ i za nju je napravljen PDF izvještaj
  (vidljiv vlasniku na `/finance/shifts`).
- **Gdje provjeriti:** UI; `/finance/shifts` kao vlasnik; email ako je `EMAIL_FROM` podešen
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** E2E shifts.spec.ts i DB 0005: nastavak smjene, S-02, preuzimanje sa 120,50 €, zatvaranje prethodne, nova značka i sačuvani PDF. Stvarno slanje izvještaja dodatno provjereno u §9.

### [SHIFT-04] Prebrojana gotovina na S-02 je neobavezna i validira se
- **Prioritet:** Visoko
- **Uloga / preduslovi:** ekran S-02
- **Koraci:** probajte redom: prazno polje; `abc`; `-5`; `12,345`; `0`; `1000`.
- **Test podaci:** kao gore
- **Očekivani rezultat:** prazno i `0` i `1000` prolaze. `abc`, `-5` i `12,345` (tri decimale)
  daju „Unesite iznos ili ostavite prazno.“
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO uz napomenu.** `test-plan-high-a.spec.ts`: `abc`, `-5`, `12,345` → „Unesite iznos ili ostavite prazno.“ i ostaje se na S-02; `1000`, `0` i prazno prolaze (tri uzastopna preuzimanja), u bazi 1000, 0 i `null`. Napomena: nakon poruke forma briše upisanu vrijednost (§9.9). Raniji dokaz (22.09.): E2E preuzimanje prihvata 120,50; pgTAP pokriva preuzimanje. Cijela tabela prazno/abc/-5/12,345/0/1000 nije izvršena.

### [SHIFT-05] Odjava sa S-02 ne dira tuđu smjenu
- **Prioritet:** Visoko
- **Uloga / preduslovi:** ekran S-02
- **Koraci:** kliknite [Odjavi se].
- **Test podaci:** —
- **Očekivani rezultat:** ste na `/login`; smjena recepcionera A je i dalje otvorena i pripada njemu.
- **Gdje provjeriti:** UI; prijava kao A vodi pravo na recepciju
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-extra.spec.ts`: B na S-02 → [Odjavi se] → `/login`; u bazi je i dalje otvorena samo smjena A; prijava kao A vodi pravo na `/reception`.

### [SHIFT-06] Značka smjene u zaglavlju za sve uloge
- **Prioritet:** Srednje
- **Uloga / preduslovi:** jednom sa otvorenom smjenom, jednom bez
- **Koraci:** prijavite se kao vlasnik dok je smjena otvorena; pa zaključite smjenu i pogledajte
  ponovo.
- **Test podaci:** —
- **Očekivani rezultat:** sa smjenom: „Smjena: <ime recepcionera> od HH:MM“. Bez smjene:
  „Nema otvorene smjene“.
- **Gdje provjeriti:** UI zaglavlje
- [x] Prošlo  [ ] Palo  Napomena: **24.09.2026 — PROŠLO.** `test-plan-medium-a.spec.ts`: bez otvorene smjene vlasnik, menadžer i administrator vide „Nema otvorene smjene“. Dok je smjena otvorena, recepcioner, menadžer, administrator i vlasnik vide istu značku „Smjena: E2E Ana SA od HH:MM“, sa vremenom početka smjene. Kad je vlasnik zaključi sa `/finance/shifts`, vlasnik, menadžer i administrator poslije osvježavanja vide „Nema otvorene smjene“, a recepcioner je odjavljen (`/login?auto=1`). Raniji dokaz (22.09.): Značka recepcionera i odsustvo nove smjene pri prijavi vlasnika provjereni u shifts.spec.ts; sve kombinacije uloga i otvorena/zatvorena nisu upoređene.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-critical.spec.ts`: bez otvorene smjene vlasnik vidi onemogućene [Dnevna karta], [Trošak], [Prodaja] i [Nova članarina], svako sa razlogom „Nema otvorene smjene. Recepcioner mora biti prijavljen.“ (`title`); u [Nova roba] je „Iz kase“ onemogućeno uz isti razlog, a „Van kase“ moguće. Zapažanje (pristupačnost): dok je dugme onemogućeno, njegovo pristupačno ime je samo razlog, bez naziva dugmeta (§9.6). Raniji dokaz (22.09.): Unit money-action.test.ts + DB 0006/0009 odbijaju novčane radnje bez smjene i dozvoljavaju nabavku van kase. Sva navedena dugmad nisu posebno kliknuta u UI-ju.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO (nakon popravke N-09).** Prvi pokušaj PALO: nakon što vlasnik zaključi smjenu, recepcioner je klikom u meniju nastavio da radi — provjera je bila samo u zajedničkom layoutu, koji Next pri klijentskoj navigaciji ne izvršava ponovo. Sada: klik na „Članovi“ vodi na `/login?auto=1` sa „Smjena je automatski zaključena.“, vlasnik ostaje prijavljen, `counted_cash` prazno. Vidi **N-09** i otvoreno pitanje o `close_type` u §9.6. Raniji dokaz (22.09.): E2E jobs.spec.ts: automatsko zatvaranje testne smjene odjavljuje recepcionera. Zatvaranje dugmetom vlasnika u drugom browseru nije zasebno izvedeno.

### [SHIFT-09] Ekran S-02 kada je smjena u međuvremenu zatvorena
- **Prioritet:** Srednje
- **Uloga / preduslovi:** Recepcioner B stoji na `/shift/gate`; vlasnik u drugom browseru
- **Koraci:** vlasnik zaključi otvorenu smjenu; zatim B klikne [Preuzmi smjenu].
- **Test podaci:** —
- **Očekivani rezultat:** B ne dobija grešku — otvara mu se nova smjena i prelazi na `/reception`.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-extra.spec.ts`: B stoji na S-02, vlasnik u drugom kontekstu zaključi smjenu na `/finance/shifts` („Smjena je zaključena.“), B klikne [Preuzmi smjenu] bez greške i dolazi na `/reception`; otvorena je tačno jedna smjena, B-ova.

### [SHIFT-10] Ostale uloge nemaju S-02 ni S-14
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik, pa Menadžer
- **Koraci:** ukucajte `/shift/gate`, pa `/shift/close`.
- **Test podaci:** —
- **Očekivani rezultat:** 404 u sva četiri slučaja.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** Dodatna UI matrica: /shift/gate i /shift/close su 404 za vlasnika i menadžera.

### [SHIFT-11] Ogroman iznos prebrojane gotovine na S-02 (granica)
- **Prioritet:** Srednje
- **Uloga / preduslovi:** ekran S-02 (vidi SUSPECT-05)
- **Koraci:** unesite `999999999999` → [Preuzmi smjenu].
- **Test podaci:** `999999999999`
- **Očekivani rezultat:** jasna poruka o neispravnom iznosu; **ne** smije se pojaviti opšte
  „Došlo je do greške. Pokušajte ponovo.“ niti 500. Ako se pojavi opšta greška, zabilježite kao bug.
- **Gdje provjeriti:** UI; serverska konzola (`npm run dev`)
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-extra.spec.ts`: `999999999999` → ispod polja „Unesite iznos ili ostavite prazno.“, bez opšte greške i bez greške na stranici; ostaje se na S-02, smjena A netaknuta. (Provjera je `^\d{1,8}(\.\d{1,2})?$`, vidi SUSPECT-05.)

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
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** E2E reception.spec.ts: skeniranje prazne kartice otvara registraciju; izvršena i uspješna registracija.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-reception.spec.ts`: jedno skeniranje, bez klika, otvara zeleni dijalog sa imenom i brojem člana, „Članarina“, „Važi do“, „Preostalo termina: Neograničeno“ i „Status: Aktivna“; dijalog je još otvoren nakon 3 s i sam se zatvara nakon ~5 s; „U teretani: 1 · Danas dolazaka: 1“ i član u listi. Zvuk nije preslušan (automatski test ga ne čuje). Raniji dokaz (22.09.): E2E reception.spec.ts + DB 0007: pokriveni/žuti/crveni dolazak i upis u bazu prolaze. Zvuk nije preslušan; svi vremenski i vizuelni detalji nisu pojedinačno provjereni.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-reception.spec.ts`: G+T član → „Prijava: <ime>“, Teretana predizabrana, Grupni ponuđen; trener i čas se pojavljuju tek za Grupni, predložena je trenerica članarine i „Čas: HH:MM“ iz rasporeda. Bez časa u roku od 90 min nudi se „Bez časa iz rasporeda“. Zatvaranje dijaloga ne upisuje dolazak. Raniji dokaz (22.09.): E2E reception.spec.ts: G+T izbor grupnog dolaska, trenera i aktuelnog časa. Sve ponuđene/predizabrane vrijednosti i varijanta bez časa nisu zasebno provjerene.

### [REC-04] Grupni dolazak bez trenera se ne može sačuvati
- **Prioritet:** Visoko
- **Uloga / preduslovi:** dijalog iz REC-03, izabrana vrsta „Grupni“
- **Koraci:** obrišite izbor trenera (ako je moguće) i kliknite [Prijavi].
- **Test podaci:** —
- **Očekivani rezultat:** poruka „Izaberite trenera.“, dolazak nije evidentiran.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-a.spec.ts`: u dijalogu je prazan izbor trenera onemogućen i [Prijavi] traži trenera, pa se kroz UI ne može poslati. Krivotvoren zahtjev sa `trainerId: null` za grupni dolazak vraća „Izaberite trenera.“; dolazak nije upisan. Raniji dokaz (22.09.): DB 0007 provjerava pravila trenera/programa i izbor termina; UI poruke i kompletne liste trenera nisu ponovljene.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-a.spec.ts`: za Grupni se nude samo Milena i Julija (dodijeljene grupnom programu), za Personalni Julija i Tatjana. Krivotvoren zahtjev sa Tatjanom za grupni dolazak vraća „Trener nije dodijeljen ovom programu.“; dolazak nije upisan. Raniji dokaz (22.09.): DB 0007 provjerava pravila trenera/programa i izbor termina; UI poruke i kompletne liste trenera nisu ponovljene.

### [REC-06] Prvi neplaćeni dolazak — žuto upozorenje
- **Prioritet:** Kritično
- **Uloga / preduslovi:** član `Božo Božović` bez važeće članarine, nije u teretani
- **Koraci:** skenirajte njegovu karticu.
- **Test podaci:** —
- **Očekivani rezultat:** **žuti** dijalog sa imenom i tekstom „Članarina nije važeća – neplaćeni
  dolazak.“ i dugmadima [Produži članarinu] i [Zatvori]. Zvuk je drugačiji nego kod zelenog.
  Dijalog se **ne** zatvara sam. Dolazak je ipak evidentiran (ulaz se ne brani, BR-078).
- **Gdje provjeriti:** UI; profil člana → kartica „Dolasci“ (oznaka „Neplaćeno“)
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-reception.spec.ts`: član bez članarine → žuti dijalog sa imenom, „Članarina nije važeća – neplaćeni dolazak.“, [Produži članarinu] i [Zatvori]; i nakon 7 s je otvoren. Dolazak je upisan (`is_unpaid`, bez članarine); profil pokazuje „Neplaćeno“ i „Neplaćeni dolasci: 1“. Zvuk nije preslušan. Raniji dokaz (22.09.): E2E reception.spec.ts + DB 0007: pokriveni/žuti/crveni dolazak i upis u bazu prolaze. Zvuk nije preslušan; svi vremenski i vizuelni detalji nisu pojedinačno provjereni.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-reception.spec.ts`: odjava pa nova prijava istog člana → crveni ekran preko cijelog prozora (1366×768 od 1366×768) sa „PAŽNJA: 2. neplaćeni dolazak!“, [Produži članarinu] i [Zatvori]. Zvuk nije preslušan. Raniji dokaz (22.09.): E2E reception.spec.ts + DB 0007: pokriveni/žuti/crveni dolazak i upis u bazu prolaze. Zvuk nije preslušan; svi vremenski i vizuelni detalji nisu pojedinačno provjereni.

### [REC-08] Odjava skeniranjem i prikaz trajanja
- **Prioritet:** Kritično
- **Uloga / preduslovi:** član je u teretani duže od vrijednosti „Zaštita od duplog skeniranja“
  (podrazumijevano 120 s)
- **Koraci:** skenirajte karticu člana koji je unutra.
- **Test podaci:** —
- **Očekivani rezultat:** zeleni „toast“ sa tekstom „Odjavljen/a: <ime> – Xh Ymin“. Član nestaje
  iz liste „U teretani“.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-reception.spec.ts`: unutar 120 s skeniranje pita „… prije N s. Odjaviti?“; [Ne] ostavlja člana unutra, [Odjavi] ga odjavljuje uz „Odjavljen/a: … – 0h 0min“. Član unutra 1 h 35 min se odjavljuje bez pitanja uz „Odjavljen/a: E2E Ana Anić – 1h 35min“ i nestaje iz liste. Raniji dokaz (22.09.): E2E reception.spec.ts i DB 0007 pokrivaju odjavu i zaštitu od duplog skena. Sve grane [Ne]/[Odjavi] i tačan prikaz trajanja nisu posebno upoređeni.

### [REC-09] Zaštita od duplog skeniranja
- **Prioritet:** Visoko
- **Uloga / preduslovi:** član je upravo prijavljen (prije manje od 120 s)
- **Koraci:** odmah ponovo skenirajte istu karticu.
- **Test podaci:** —
- **Očekivani rezultat:** pitanje „<ime> je prijavljen/a prije N s. Odjaviti?“ sa [Odjavi] i [Ne].
  [Ne] ostavlja člana unutra; [Odjavi] ga odjavljuje.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-reception.spec.ts` (REC-08/REC-07): ponovno skeniranje unutar 120 s pita „<ime> je prijavljen/a prije N s. Odjaviti?“; [Ne] ostavlja člana unutra, [Odjavi] ga odjavljuje uz „Odjavljen/a: … – 0h 0min“. Raniji dokaz (22.09.): E2E reception.spec.ts i DB 0007 pokrivaju odjavu i zaštitu od duplog skena. Sve grane [Ne]/[Odjavi] i tačan prikaz trajanja nisu posebno upoređeni.

### [REC-10] Promjena praga duplog skeniranja
- **Prioritet:** Srednje
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** `/settings/gym` → „Zaštita od duplog skeniranja (s)“ postavite na `0` → sačuvajte →
  vratite se na recepciju i dvaput skenirajte istu karticu za redom.
- **Test podaci:** `0`, zatim vratite na `120`
- **Očekivani rezultat:** sa 0 nema pitanja — drugo skeniranje odmah odjavljuje člana.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-extra.spec.ts`: vlasnik kroz `/settings/gym` postavi 0 (u bazi `double_scan_seconds = 0`); dva skeniranja iste kartice: prvo zeleno, drugo odmah „Odjavljen/a: … – 0h 0min“, bez pitanja „Odjaviti?“. Vrijednost vraćena na 120.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO uz napomenu o planu.** `test-plan-reception.spec.ts`: `1234567890` → „Nepoznata kartica.“; poništena kartica → „Kartica je poništena. Pronađite člana pretragom.“; `12345` i `12345678901` → „Neispravan kod kartice.“; svaka poruka je u statusnoj liniji, bez dijaloga, i nestaje. `abcdefghij` ne daje ništa: slova se namjerno ne tretiraju kao skener (REC-16, SUSPECT-09) — red iz plana za slova protivrječi REC-16. Raniji dokaz (22.09.): E2E: neispravan i nepoznat kod; DB 0007: i poništena kartica. Dodatno UI: neispravan kod nestaje nakon 5 s. Nisu svih pet unosa ponovljeni u UI-ju.

### [REC-12] Član je već u teretani (ručna prijava)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** član je unutra
- **Koraci:** pronađite tog člana pretragom na recepciji i kliknite na njegovo ime u rezultatima.
- **Test podaci:** —
- **Očekivani rezultat:** poruka „Član je već u teretani.“, ništa se ne evidentira.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-a.spec.ts`: član unutra, izabran iz rezultata pretrage na recepciji → „Član je već u teretani.“; i dalje tačno jedan dolazak u bazi. Raniji dokaz (22.09.): DB 0007 potvrđuje jedan otvoreni dolazak i odbijanje ponovne prijave. Ručni klik rezultata pretrage nije zasebno izvršen.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO uz napomenu.** `test-plan-high-a.spec.ts`: `ani` daje tačno 8 redova (od 11 Anića), svaki sa [Otvori profil]; `anic` i `ANIĆ` nalaze „Anić“; broj `3` nalazi člana #3; `0691` nalazi po telefonu; `zzzz` → „Nema članova koji odgovaraju pretrazi.“ Napomene (§9.9): samo `069` ne nalazi nikoga po telefonu (potrebne su 3 cifre nakon vodeće nule); rezultati su stigli ~0,85 s nakon posljednjeg znaka na dev serveru (250 ms čekanja + upit). Raniji dokaz (22.09.): DB 0006 i E2E members.spec.ts potvrđuju pretragu bez kvačica; dodatna UI provjera praznog rezultata. Ostali upiti i mjerenje 250 ms nisu potpuno izvršeni.

### [REC-14] Escape i brisanje pretrage
- **Prioritet:** Nisko
- **Uloga / preduslovi:** rezultati pretrage otvoreni
- **Koraci:** pritisnite Esc; zatim obrišite tekst ručno.
- **Test podaci:** —
- **Očekivani rezultat:** lista rezultata se zatvara i polje se prazni; ekran ostaje upotrebljiv za
  skeniranje.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** Dodatni UI test: Escape prazni polje i uklanja rezultate pretrage.

### [REC-15] Skeniranje ne smije da krade tastaturu dok kucate u polje
- **Prioritet:** Visoko
- **Uloga / preduslovi:** recepcija
- **Koraci:** kliknite u polje pretrage i otkucajte `1234567890` pa Enter.
- **Test podaci:** `1234567890`
- **Očekivani rezultat:** to je pretraga, a **ne** skeniranje: ne pojavljuje se poruka o kartici.
  Isto važi dok je otvoren dijalog „Novi član“, „Dnevna karta“ ili „Trošak“.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-a.spec.ts`: `1234567890` + Enter u polju pretrage je pretraga, bez poruke o kartici; kucanje cifara u otvorenim dijalozima „Trošak“, „Dnevna karta“ i „Novi član“ ne pokreće skeniranje; nije evidentirana nijedna uplata. Raniji dokaz (22.09.): Dodatni UI test: 1234567890 + Enter u pretrazi ne skenira karticu. Nije ponovljeno u sva tri navedena dijaloga.

### [REC-16] Slučajno kucanje po ekranu
- **Prioritet:** Srednje
- **Uloga / preduslovi:** recepcija, ništa nije fokusirano
- **Koraci:** otkucajte `55` pa Enter; zatim slovo `a` pa Enter.
- **Test podaci:** `55`, `a`
- **Očekivani rezultat:** `55` + Enter daje „Neispravan kod kartice.“ Samo slovo `a` (bez prethodne
  cifre) se ignoriše i Enter ne pokreće ništa. (Vidi SUSPECT-09.)
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** Dodatni UI test: zalutala cifra, pauza 1,2 s, Space aktivira fokusirano dugme Počni rad; regresija SUSPECT-09 nije reprodukovana.

### [REC-17] Lista „U teretani“ i brojači
- **Prioritet:** Visoko
- **Uloga / preduslovi:** prijavite dva člana
- **Koraci:** pogledajte desnu tablu; sačekajte minut; odjavite jednog dugmetom [Odjavi] iz liste.
- **Test podaci:** —
- **Očekivani rezultat:** naslov „U teretani: 2 · Danas dolazaka: N“; svaki red ima ime, broj člana,
  oznaku vrste dolaska, vrijeme ulaska i trajanje koje se osvježava svakog minuta. Nakon [Odjavi]
  član nestaje, a brojač „U teretani“ pada na 1. Prazno stanje: „Trenutno nema nikoga u teretani.“
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO uz napomenu.** `test-plan-high-a.spec.ts`: sa dva člana „U teretani: 2 · Danas dolazaka: 2“; red ima ime, broj, vrstu dolaska, vrijeme ulaska i trajanje; trajanje prelazi sa „0h 1min“ na „0h 2min“ poslije minuta; [Odjavi] spušta brojač na 1, pa „Trenutno nema nikoga u teretani.“ Napomena: brojač otkucava od učitavanja stranice, pa trajanje kasni do minut (§9.9). Raniji dokaz (22.09.): DB 0007 reception_panel i E2E reception provjeravaju prisutne članove; sve promjene brojača između dva pulta nisu upoređene.

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
- [x] Prošlo  [ ] Palo  Napomena: **24.09.2026 — PROŠLO uz napomenu.** `test-plan-medium-a.spec.ts`: poslije prijave stoji preklop sa „Uključuje zvuk za rezultate skeniranja.“ i fokusiranim [Počni rad]; zaglavlje ispod njega radi (Članovi → Recepcija, preklop je i dalje tu). Poslije klika ga nema ni nakon osvježavanja ni nakon odlaska i povratka kroz meni; nova sesija browsera (incognito) ga opet prikazuje. Zvuk: `/sounds/ok.mp3`, `warning.mp3` i `alarm.mp3` vraćaju 200 `audio/mpeg`, a poslije osvježavanja i skeniranja browser izvršava `play()` za `ok.mp3` bez blokade. **Napomena:** nova kartica istog browsera ponovo prikazuje preklop, jer se oznaka čuva u `sessionStorage`, koji važi po kartici; zvuk se ionako mora otključati u svakoj kartici posebno. Da li se zvuk zaista čuje, automatski se ne može provjeriti. Raniji dokaz (22.09.): Dodatni UI test: Počni rad uklanja početni ekran, osvježavanje ga ne vraća. Nova kartica browsera i stvarni audio nisu provjereni.

### [REC-19] Dolazak preko ponoći i trajanje
- **Prioritet:** Srednje
- **Uloga / preduslovi:** član prijavljen prije ponoći (moguće samo ako testirate kasno uveče ili
  naknadnim unosom, vidi FIN-16)
- **Koraci:** prijavite člana kasno uveče, ostavite ga do poslije ponoći i odjavite.
- **Test podaci:** —
- **Očekivani rezultat:** dolazak se broji u dan **kada je počeo**; trajanje je ispravno (prelazi
  ponoć). Noćni posao u 23:00 ga automatski odjavljuje (vidi JOB-01), pa to provjerite prije 23:00.
- **Gdje provjeriti:** profil člana → „Dolasci“; `/stats/visits`
- [x] Prošlo  [ ] Palo  Napomena: **24.09.2026 — PROŠLO.** `test-plan-medium-a.spec.ts`: otvoren dolazak od juče u 23:10 (upisan direktno, jer noćni posao u 23:00 zatvara samo ranije dolaske), pa odjava skeniranjem ujutru: „Odjavljen/a: E2E Ponoć Kasni – 9h 53min“, tačno trajanje preko ponoći (±1 min). Profil → Dolasci: datum 23.09.2026, ulaz 23:10, izlaz današnje vrijeme. `/stats/visits` za 23.–24.09.: taj dolazak je u stupcu 23.09, dana kada je počeo. Raniji dokaz (22.09.): Unit format.test.ts i DB 0000/0001 provjeravaju lokalni datum/prelaz ponoći i trajanje. Stvarni noćni UI scenario nije izvršen.

### [REC-20] Ručna prijava iz profila člana
- **Prioritet:** Visoko
- **Uloga / preduslovi:** član nije u teretani
- **Koraci:** `/members` → otvorite profil → [Ručna prijava].
- **Test podaci:** —
- **Očekivani rezultat:** prolazi isti tok kao skeniranje (zeleni/žuti/crveni dijalog), a dolazak je
  u bazi označen kao ručni.
- **Gdje provjeriti:** UI; profil → „Dolasci“
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-extra.spec.ts`: recepcioner na profilu člana sa važećom članarinom → [Ručna prijava] → zeleni rezultat (`data-result=covered`); u bazi jedan otvoren dolazak sa `is_manual = true`. Žuti/crveni tok iz profila nije posebno ponovljen (isti RPC kao skeniranje, pokriven u REC-06/07).

### [REC-21] Dva pulta prijavljuju istog člana (trka)
- **Prioritet:** Srednje
- **Uloga / preduslovi:** dva browsera, oba na recepciji, isti član nije unutra
- **Koraci:** skenirajte istu karticu u oba browsera što je moguće bliže u vremenu.
- **Test podaci:** —
- **Očekivani rezultat:** tačno jedan dolazak je evidentiran; drugi browser dobija
  „Član je već u teretani.“ ili pitanje o odjavi. Nikada dva otvorena dolaska za istog člana.
- **Gdje provjeriti:** UI; profil člana → „Dolasci“
- [x] Prošlo  [ ] Palo  Napomena: **24.09.2026 — PROŠLO.** `test-plan-medium-a.spec.ts`: dva browsera na recepciji, ista kartica skenirana istovremeno (cifre u oba, pa Enter u oba), tri puta. Svaki put je evidentiran tačno jedan dolazak; drugi pult dobija pitanje „E2E Trka Dvojica je prijavljen/a prije 0 s. Odjaviti?“ (zaštita od duplog skeniranja), a Esc ostavlja člana unutra. Nikada dva otvorena dolaska; profil pokazuje tri dolaska. Raniji dokaz (22.09.): DB 0007 potvrđuje zabranu drugog otvorenog dolaska. Nije izvršena istovremena trka iz dva browsera.

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
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** E2E members.spec.ts/reception.spec.ts: sačuvan član, kartica, članarina, uplata i trenutni dolazak; bez validne skenirane kartice Sačuvaj je onemogućen.

### [MEM-02] Bez skenirane kartice se ne može sačuvati (BR-033)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** recepcija
- **Koraci:** kliknite [Novi član] iz dugmadi na recepciji (bez skeniranja), popunite sve ostalo i
  pokušajte da sačuvate.
- **Test podaci:** —
- **Očekivani rezultat:** dugme za čuvanje je onemogućeno dok kartica nije potvrđena; uz polje
  kartice stoji „Skenirajte praznu karticu.“
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** E2E members.spec.ts/reception.spec.ts: sačuvan član, kartica, članarina, uplata i trenutni dolazak; bez validne skenirane kartice Sačuvaj je onemogućen.

### [MEM-03] Kartica koja nije prazna
- **Prioritet:** Visoko
- **Uloga / preduslovi:** kartica koja je već dodijeljena nekom članu
- **Koraci:** u dijalogu „Novi član“ u polje kartice unesite kôd već dodijeljene kartice.
- **Test podaci:** kartica člana Ana Anić
- **Očekivani rezultat:** „Ova kartica nije prazna.“ i dugme za čuvanje ostaje onemogućeno.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-b.spec.ts`: u dijalogu „Novi član“ kôd kartice koja pripada drugom članu → „Ova kartica nije prazna.“, [Sačuvaj] onemogućeno. Raniji dokaz (22.09.): DB 0006 provjerava karticu pri registraciji; kompletne UI varijante zauzete/poništene kartice nisu izvršene.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-forms.spec.ts`: registracija skeniranjem prazne kartice. Prazno ime, 51 znak i samo razmaci → „Unesite ime (1–50 znakova).“; prazno/51 znak prezime → „Unesite prezime (1–50 znakova).“; `ana@` i email od 257 znakova → „Unesite ispravan email.“ Poruke su ispod svog polja, dijalog ostaje otvoren sa unesenim vrijednostima, ništa nije sačuvano. Ime od tačno 50 znakova prolazi. Raniji dokaz (22.09.): Unit members.test.ts provjerava neispravna polja i putanju greške, DB 0006 ograničenja registracije; nisu svi granični unosi izvedeni kroz formu.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-reception.spec.ts` (dijalog „Uredi podatke“, ista provjera kao „Novi član“): `069123456`, `+382…`, `00382…`, sa razmacima i sa `-`/`/` → sačuvano kao `+382…` i tako prikazano na profilu; `1234567`, `06912345a`, prazno i 19 cifara → „Unesite ispravan broj telefona sa pozivnim brojem.“ Raniji dokaz (22.09.): Unit phone.test.ts + members.test.ts, DB 0006 i UI normalizacija 067 123 456 → +38267123456. Cijela tabela unosa nije ponovljena u UI-ju.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-forms.spec.ts` (dijalog „Uredi podatke“, ista provjera kao „Novi član“): prihvaćeni `15.03.1995`, `1.3.1995`, `01.01.1900`, `29.02.2024` i sačuvani tačno; odbijeni `31.12.1899`, `31.02.2000`, `29.02.2023`, sutrašnji datum, `15/03/1995` i prazno — svi sa „Unesite datum rođenja (dd.mm.gggg), od 01.01.1900 do danas.“ (i sutrašnji; SUSPECT-06 se ovdje ne javlja). Kalendar upisuje izabrani datum kao `08.07.1994`. Raniji dokaz (22.09.): Unit members.test.ts provjerava oba formata, nepostojeće datume i donju granicu. Gornja granica i poruka server akcije nisu ponovo testirane uživo.

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
- [x] Prošlo  [ ] Palo  Napomena: **24.09.2026 — PROŠLO (nakon odluke vlasnika i popravke N-16).** `test-plan-high-b.spec.ts`: `Ćira Ćirić Šušnjić-Žižić`, `Ђорђе Петровић` i `  Ana  ` (sačuvano kao `Ana`) i dalje se ispravno prikazuju u listi, profilu, pretrazi i PDF-u. Vlasnik je odlučio da se emoji u imenu odbija (D-66): `Ana😀` / `Emoji 🇲🇪` sada daju „Ime ne smije sadržati emoji.“ i „Prezime ne smije sadržati emoji.“ ispod polja, a u bazi ništa nije sačuvano; baza isto odbija i direktan poziv (migracija 0028, pgTAP). Prvi nalaz (23.09.): **PALO (N-16, emoji u PDF-u).** `test-plan-high-b.spec.ts`: `Ćira Ćirić Šušnjić-Žižić`, `Ђорђе Петровић` i `  Ana  ` (sačuvano kao `Ana`) ispravno se prikazuju u listi, profilu, pretrazi (`ciric susnjic`, `петров`) i u PDF izvještaju smjene. `Ana😀` se prihvata i prikazuje na ekranima i u pretrazi, ali **u PDF-u emoji nestaje** (ostaje prazno mjesto, bez kvadratića) — font izvještaja nema emoji. Po kriterijumu plana to je nalaz; odluka je vlasnikova (§9.9, §7 pitanje 1). Raniji dokaz (22.09.): E2E registracija i pretraga Ćosić, unit normalizacija razmaka i PDF testovi čćšžđ prolaze. Ćirilica i emoji nisu provjereni.

### [MEM-08] Upozorenje o duplikatu (BR-043)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** postoji član sa telefonom `+38269123456`
- **Koraci:** u novom unosu upišite isti telefon i **izađite iz polja** (Tab).
- **Test podaci:** `069123456`
- **Očekivani rezultat:** upozorenje „Već postoji član sa istim telefonom ili emailom:“ sa
  brojem i imenom postojećeg člana, dugmetom [Otvori postojećeg] i dugmetom [Ipak sačuvaj].
  Ovo je **upozorenje, ne zabrana** — [Ipak sačuvaj] pravi drugog člana.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-b.spec.ts`: `069123456` pa Tab → „Već postoji član sa istim telefonom ili emailom:“ sa „#1 E2E Zauzeta Kartica“, [Otvori postojećeg] i [Ipak sačuvaj]; [Ipak sačuvaj] pravi drugog člana sa istim telefonom (upozorenje, ne zabrana). Raniji dokaz (22.09.): DB 0006 provjerava duplikate BR-043; dijalog upozorenja i potvrda u UI-ju nisu provjereni.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO uz napomenu.** `test-plan-high-b.spec.ts`: kolone Broj, Ime i prezime, Telefon, Status, Posljednji dolazak; 35 članova → 25 + 10, „Strana 1 od 2“ ↔ „Strana 2 od 2“; pretraga po imenu, broju i telefonu; `zzzz` → „Nema članova…“; filter „Status“ mijenja adresu i listu (aktivnih 6); `page=-1`, `page=abc`, `status=izmisljeno` → prva strana, `page=999` prazna lista bez pada. Napomena (§9.9): ako se filter promijeni u roku od 250 ms nakon brisanja pretrage, odložena pretraga ga poništi. Raniji dokaz (22.09.): E2E members.spec.ts pretraga cosic nalazi Ćosić. Statusni filteri i straničenje preko 25 članova nisu potpuno izvršeni.

### [MEM-10] Prazno stanje kad nema nijednog člana
- **Prioritet:** Srednje
- **Uloga / preduslovi:** baza bez ijednog člana (provjerljivo samo na svježoj bazi)
- **Koraci:** otvorite `/members`.
- **Test podaci:** —
- **Očekivani rezultat:** „Još nema članova. Skenirajte praznu karticu na recepciji da dodate prvog.“
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** E2E screens.spec.ts/members.spec.ts: tačno očekivano prazno stanje na oba viewporta.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-b.spec.ts`: zaglavlje ima ime, „#1“ i „Aktivna kartica <kôd>“; kartice mijenjaju `?tab=` u adresi, osvježavanje ostaje na „Dolasci“; prazna stanja „Član još nema članarinu.“, „Nema uplata za prikaz.“, „Nema dolazaka.“; dugme nazad vraća prethodnu karticu. Raniji dokaz (22.09.): E2E members/payments provjeravaju profil, prodaju/produženje i povezane zapise. Sve tri kartice i sva polja nisu pojedinačno provjereni.

### [MEM-12] Straničenje dolazaka u profilu
- **Prioritet:** Nisko
- **Uloga / preduslovi:** član sa više od 20 dolazaka (može se napraviti naknadnim unosom)
- **Koraci:** kartica „Dolasci“ → [Sljedeća] → [Prethodna]; probajte `?tab=dolasci&strana=999`.
- **Test podaci:** —
- **Očekivani rezultat:** po 20 dolazaka po strani; nevažeći broj strane ne ruši stranicu.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-extra.spec.ts`: 45 dolazaka → „Strana 1 od 3“ sa 20 redova, [Sljedeća] → 2 od 3 (20), 3 od 3 (5), [Prethodna] → 2 od 3. `strana=abc` i `strana=-4` → strana 1; `strana=999` → HTTP 200, profil se prikazuje, tabela je prazna i **nema navigacije stranama** (vrati se klikom na karticu „Dolasci“). Nije pad; vidi SG u §9.5.

### [MEM-13] Izmjena podataka o članu
- **Prioritet:** Visoko
- **Uloga / preduslovi:** bilo koja uloga (BR-045)
- **Koraci:** profil → [Uredi podatke] → promijenite prezime i telefon → sačuvajte.
- **Test podaci:** prezime `Anić-Marković`, telefon `068999111`
- **Očekivani rezultat:** „Podaci su sačuvani.“, novi podaci se odmah vide u profilu i u listi.
  Ista validacija kao pri unosu (probajte prazno ime — mora pasti).
- **Gdje provjeriti:** UI; vlasnik: `/finance/audit` mora imati zapis izmjene
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-b.spec.ts`: prazno ime → „Unesite ime (1–50 znakova).“; prezime `Anić-Marković` i telefon `068999111` → „Podaci su sačuvani.“, odmah na profilu (`+38268999111`) i u listi; vlasnik u `/finance/audit` vidi „last_name: Profil → Anić-Marković“. Raniji dokaz (22.09.): DB 0006 provjerava izmjenu člana i audit; forma nije zasebno izvršena.

### [MEM-14] Anonimizacija smije samo vlasnik/administrator (BR-046)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** prvo recepcioner i menadžer, zatim vlasnik
- **Koraci:** otvorite profil člana kao recepcioner, pa kao menadžer — potražite dugme
  [Anonimiziraj]. Zatim kao vlasnik.
- **Test podaci:** —
- **Očekivani rezultat:** dugmeta nema za recepcionera i menadžera; postoji za vlasnika i
  administratora.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-reception.spec.ts`: na istom profilu [Anonimiziraj] nema za recepcionera i menadžera, a ima za vlasnika i administratora. Raniji dokaz (22.09.): E2E members.spec.ts: recepcioneru nema anonimizacije, vlasnik anonimizuje i profil postaje read-only; DB 0006 provjerava podatke. Admin i svi detalji istorije nisu posebno provjereni.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-forms.spec.ts`: tekst dijaloga navodi šta se briše i traži broj člana; `999` → „Upisani broj se ne poklapa sa brojem člana.“ i ništa se ne mijenja; tačan broj → „Član je anonimiziran.“ U bazi: ime „Anonimizirani“, prezime „član #2“, telefon/email/datum rođenja prazni. Članarina i 3 dolaska ostaju. Pretraga po imenu i telefonu ne nalazi člana; „Najčešći članovi“ ne pokazuju staro ime. Raniji dokaz (22.09.): E2E members.spec.ts uspješna potvrda brojem i anonimizacija. Pogrešan broj i izmijenjeno skriveno polje nisu ponovo testirani.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-b.spec.ts`: „Naknada za novu karticu: 5,00 €“ → Gotovina → [Nastavi] → nova prazna kartica → „Nova kartica dodijeljena. Stara kartica je poništena.“; profil pokazuje novi kôd; S-12 ima „Zamjenska kartica – #1 E2E Zauzeta Kartica“ 5,00 €; stara kartica na recepciji → „Kartica je poništena. Pronađite člana pretragom.“ Raniji dokaz (22.09.): E2E members.spec.ts + DB 0006: zamjena praznom karticom, naknada i statusi kartica. Sve navedene negativne kombinacije nisu izvedene u UI-ju.

### [MEM-17] Zamjena kartice bez otvorene smjene
- **Prioritet:** Visoko
- **Uloga / preduslovi:** nema otvorene smjene; prijavljeni kao vlasnik
- **Koraci:** pokušajte [Izgubljena kartica].
- **Test podaci:** —
- **Očekivani rezultat:** radnja je onemogućena ili odbijena porukom „Nema otvorene smjene.
  Recepcioner mora biti prijavljen.“
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-b.spec.ts`: bez otvorene smjene [Izgubljena kartica] je onemogućena sa razlogom „Nema otvorene smjene. Recepcioner mora biti prijavljen.“ Raniji dokaz (22.09.): DB i unit zaštita novčanih radnji bez smjene prolaze; konkretan dijalog zamjene nije otvoren bez smjene.

### [MEM-18] HTML i SQL znakovi u podacima člana
- **Prioritet:** Kritično (bezbjednost)
- **Uloga / preduslovi:** dijalog „Novi član“
- **Koraci:** napravite člana sa imenom `<script>alert(1)</script>` i prezimenom `O'Brien";--`,
  pa otvorite njegov profil, listu članova, `/payments/today` i PDF izvještaja smjene.
- **Test podaci:** kao gore
- **Očekivani rezultat:** tekst se svuda prikazuje **doslovno**, kao običan tekst. Nema iskačućeg
  prozora, nema greške u konzoli, PDF se pravi normalno. Apostrof u prezimenu se uredno čuva.
- **Gdje provjeriti:** UI, konzola browsera, PDF
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-extra.spec.ts`: član `<script>alert(1)</script>` / `O'Brien";--` registrovan skeniranjem prazne kartice uz gotovinsku uplatu. Tekst doslovno na recepciji, profilu, `/members` i `/payments/today`; nema `alert` dijaloga ni grešaka u konzoli; apostrof sačuvan u bazi. Nakon zaključenja smjene `/api/pdf/shift/<id>` vraća 200 `application/pdf` koji počinje sa `%PDF-`. Sadržaj PDF-a nije vizuelno pregledan.

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
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** E2E members.spec.ts + DB 0006: prodaja Personalni, odbijanje ispod minimuma i produženje mjesečne od dana nakon isteka; sintetički datumi/podaci.

### [MSHIP-02] Produženje se nadovezuje na postojeću članarinu (BR-052, E2)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** član sa članarinom koja još traje
- **Koraci:** profil → [Produži] u redu te članarine → izaberite `Mjesečna`.
- **Test podaci:** —
- **Očekivani rezultat:** prije čuvanja piše „Nastavlja se na članarinu koja važi do dd.mm.gggg“,
  a „Početak“ je **prvi dan poslije** isteka postojeće. Nakon čuvanja status nove članarine je
  „Buduća“.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** E2E members.spec.ts + DB 0006: prodaja Personalni, odbijanje ispod minimuma i produženje mjesečne od dana nakon isteka; sintetički datumi/podaci.

### [MSHIP-03] Članarina počinje od prvog neplaćenog dolaska (E3)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** član `Božo Božović` ima 1–2 neplaćena dolaska u posljednjih nekoliko dana
- **Koraci:** profil → [Nova članarina] → `Mjesečna` → pogledajte obrazloženje → sačuvajte.
- **Test podaci:** —
- **Očekivani rezultat:** obrazloženje „Počinje od prvog neplaćenog dolaska dd.mm.gggg“, a početak
  je datum tog dolaska. Nakon čuvanja, ti dolasci **više nisu neplaćeni** (oznaka „Neplaćeno“ je
  nestala), a značka „Neplaćeni dolasci“ u zaglavlju profila je nestala.
- **Gdje provjeriti:** UI; profil → „Dolasci“
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO uz napomenu o planu.** `test-plan-reception.spec.ts`: član sa 2 neplaćena dolaska danas → „Počinje od prvog neplaćenog dolaska dd.mm.gggg“, početak = datum dolaska; oba dolaska povezana sa novom članarinom, značka „Neplaćeni dolasci“ nestaje. Oznaka „Neplaćeno“ uz same dolaske **ostaje**: glosar (doc 02) kaže da neplaćeni dolazak ostaje označen zauvijek radi istorije, pa je očekivanje plana da nestane netačno. Raniji dokaz (22.09.): E2E reception.spec.ts i DB 0006/0007 potvrđuju povezivanje neplaćenih dolazaka i početak članarine. Sve poruke pregleda nisu pojedinačno upoređene.

### [MSHIP-04] Prestari neplaćeni dolasci (E5, upozorenje)
- **Prioritet:** Srednje
- **Uloga / preduslovi:** član sa neplaćenim dolaskom starijim od trajanja izabranog plana
  (npr. dolazak prije 20 dana + plan „Nedeljna“ od 7 dana); dolazak napravite naknadnim unosom (FIN-16)
- **Koraci:** profil → [Nova članarina] → `Nedeljna`.
- **Test podaci:** —
- **Očekivani rezultat:** upozorenje „Neplaćeni dolasci su stariji od trajanja ove članarine i
  ostaju neplaćeni.“, a početak je **danas**. Nakon čuvanja ti dolasci ostaju neplaćeni.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **24.09.2026 — PROŠLO.** `test-plan-medium-a.spec.ts`: neplaćeni dolazak od prije 20 dana unesen naknadnim unosom (vlasnik). Prodaja `Nedeljna` (7 dana) na profilu prikazuje „Neplaćeni dolasci su stariji od trajanja ove članarine i ostaju neplaćeni.“ i „Počinje danas“, 24.09.2026–01.10.2026. Poslije čuvanja dolazak ostaje neplaćen i nepovezan sa članarinom. Kraj je 01.10, jer BR-051 i E5 daju D + 7 (02.09 → 09.09). Raniji dokaz (22.09.): DB 0006/0007: datumi BR-052, prestari dolasci, vlasnikova prava, E14 kraj mjeseca, limiti/statusi, smjena i finansijski snapshot. Ovo potvrđuje baznu logiku, ne sve korake/poruke UI slučaja.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-c.spec.ts`: recepcioner u prodaji nema [Promijeni početak]; vlasnik ga ima, unos datuma odmah preračunava „Važi do“ i obrazloženje je „Početak je odredio vlasnik.“; `32.13.2026` → „Unesite datum u formatu dd.mm.gggg.“ i ništa se ne čuva. Raniji dokaz (22.09.): DB 0006/0007: datumi BR-052, prestari dolasci, vlasnikova prava, E14 kraj mjeseca, limiti/statusi, smjena i finansijski snapshot. Ovo potvrđuje baznu logiku, ne sve korake/poruke UI slučaja.

### [MSHIP-06] Iznos može da mijenja samo vlasnik (BR-059)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** prvo recepcioner, zatim vlasnik
- **Koraci:** u dijalogu prodaje mjesečne članarine potražite [Promijeni iznos]; kao vlasnik
  postavite iznos na `70`.
- **Test podaci:** `70`
- **Očekivani rezultat:** recepcioner ne može promijeniti iznos (ili dobija „Samo vlasnik može
  mijenjati iznos.“). Vlasnik može, i uplata je 70,00 €.
- **Gdje provjeriti:** UI; `/payments/today`
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-rest.spec.ts`: recepcioner u prodaji Mjesečne nema [Promijeni iznos] ni polje iznosa; vlasnik mijenja iznos na 70 → uplata 70,00 € u bazi i na `/payments/today`. Raniji dokaz (22.09.): DB 0006/0007: datumi BR-052, prestari dolasci, vlasnikova prava, E14 kraj mjeseca, limiti/statusi, smjena i finansijski snapshot. Ovo potvrđuje baznu logiku, ne sve korake/poruke UI slučaja.

### [MSHIP-07] Personalni: iznos i broj termina su obavezni
- **Prioritet:** Kritično
- **Uloga / preduslovi:** otvorena smjena
- **Koraci:** dijalog prodaje → `Personalni` → ostavite iznos i termine prazne → [Naplati i sačuvaj].
- **Test podaci:** —
- **Očekivani rezultat:** „Unesite iznos, na primjer 79 ili 79,50.“ uz iznos i „Unesite broj termina
  od 1 do 50.“ uz termine. Uz polje iznosa stoji podsjetnik „Minimalno 80,00 €“.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-forms.spec.ts`: Personalni sa trenerom, prazni iznos i termini → „Unesite iznos, na primjer 79 ili 79,50.“ uz iznos i „Unesite broj termina od 1 do 50.“ uz termine; podsjetnik „Minimalno 80,00 €“ vidljiv; nije sačuvana članarina. Raniji dokaz (22.09.): Unit members.test.ts i DB 0006: obavezni iznos/termini/trener/način plaćanja i format iznosa. Cijela tabela graničnih vrijednosti nije ponovljena kroz UI.

### [MSHIP-08] Personalni: minimalna cijena (E13)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** minimalna cijena personalnog je 80 € (S-27)
- **Koraci:** prodajte `Personalni` sa iznosom `79,99`, trenerom Tamarom i 8 termina.
- **Test podaci:** `79,99`
- **Očekivani rezultat:** „Iznos ne može biti manji od 80.00 €.“ (tačna vrijednost iz podešavanja).
  Sa `80` prolazi.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** E2E members.spec.ts + DB 0006: prodaja Personalni, odbijanje ispod minimuma i produženje mjesečne od dana nakon isteka; sintetički datumi/podaci.

### [MSHIP-09] Broj termina — granice
- **Prioritet:** Visoko
- **Uloga / preduslovi:** prodaja personalne članarine
- **Koraci:** probajte redom `0`, `1`, `50`, `51`, `2.5`, `-3`, `abc`.
- **Test podaci:** kao gore
- **Očekivani rezultat:** `1` i `50` prolaze; `0`, `51`, `2.5`, `-3`, `abc` daju
  „Unesite broj termina od 1 do 50.“
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-c.spec.ts`: `0`, `51`, `2.5`, `-3`, `abc` termina → „Unesite broj termina od 1 do 50.“ bez čuvanja; `1` i `50` se čuvaju. Raniji dokaz (22.09.): Unit members.test.ts i DB 0006: obavezni iznos/termini/trener/način plaćanja i format iznosa. Cijela tabela graničnih vrijednosti nije ponovljena kroz UI.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-c.spec.ts`: `100,50` i `100.50` se čuvaju; `100,555`, `-100`, `abc` i prazno → „Unesite iznos, na primjer 79 ili 79,50.“; `0` → „Iznos ne može biti manji od 80,00 €.“ (E13); `999999999` → „Unesite iznos, …“ ispod polja, bez opšte greške. Raniji dokaz (22.09.): Unit members.test.ts i DB 0006: obavezni iznos/termini/trener/način plaćanja i format iznosa. Cijela tabela graničnih vrijednosti nije ponovljena kroz UI.

### [MSHIP-11] Trener je obavezan za Grupni, G+T i Personalni (BR-058)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** otvorena smjena
- **Koraci:** izaberite `Grupni (3x nedeljno)` bez trenera → sačuvajte. Ponovite za `G+T` i
  `Personalni`.
- **Test podaci:** —
- **Očekivani rezultat:** svaki put „Izaberite trenera.“ Za `Mjesečna` polje trenera se ne traži.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO uz napomenu.** `test-plan-rest.spec.ts`: za člana bez ranijeg trenera Grupni, G+T i Personalni bez trenera daju „Izaberite trenera.“ i ništa se ne čuva; za Mjesečnu polja trenera nema. Kad član ima ranijeg trenera, on je predložen, a prazan izbor se više ne može vratiti (onemogućena opcija) — „bez trenera“ tada nije moguće izabrati. Raniji dokaz (22.09.): Unit members.test.ts i DB 0006: obavezni iznos/termini/trener/način plaćanja i format iznosa. Cijela tabela graničnih vrijednosti nije ponovljena kroz UI.

### [MSHIP-12] Način plaćanja je obavezan
- **Prioritet:** Visoko
- **Uloga / preduslovi:** prodaja bilo koje članarine
- **Koraci:** popunite sve osim načina plaćanja → [Naplati i sačuvaj].
- **Test podaci:** —
- **Očekivani rezultat:** „Izaberite način plaćanja.“
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-c.spec.ts`: prodaja bez načina plaćanja → „Izaberite način plaćanja.“, ništa se ne čuva. Raniji dokaz (22.09.): Unit members.test.ts i DB 0006: obavezni iznos/termini/trener/način plaćanja i format iznosa. Cijela tabela graničnih vrijednosti nije ponovljena kroz UI.

### [MSHIP-13] Granica trajanja: 31.01 + 1 mjesec (E14)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik (može da postavi početak)
- **Koraci:** prodajte `Mjesečna` sa početkom `31.01.2027` i pogledajte „Važi do“. Ponovite sa
  početkom `31.01.2028` (prestupna godina) i sa `31.12.2026` (prelazak godine).
- **Test podaci:** kao gore
- **Očekivani rezultat:** `31.01.2027` → važi do `27.02.2027`; `31.01.2028` → do `28.02.2028`;
  `31.12.2026` → do `30.01.2027`. (Posljednji važeći dan je uključen.)
- **Gdje provjeriti:** UI (prikaz „Važi do“ prije čuvanja)
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO uz napomenu o planu.** `test-plan-high-c.spec.ts`: vlasnikov početak → „Važi do“ po BR-051 (`kraj = početak + N kalendarskih mjeseci`, oba dana uključena): 01.01.2026 → 01.02.2026, 31.01.2027 → 28.02.2027 (E14), 31.01.2028 → 29.02.2028, 31.12.2026 → 31.01.2027. Brojke u planu (27.02.2027, 28.02.2028, 30.01.2027) protivrječe BR-051 i E14 (doc 03), pa je netačan plan, ne aplikacija. Raniji dokaz (22.09.): DB 0006/0007: datumi BR-052, prestari dolasci, vlasnikova prava, E14 kraj mjeseca, limiti/statusi, smjena i finansijski snapshot. Ovo potvrđuje baznu logiku, ne sve korake/poruke UI slučaja.

### [MSHIP-14] Iskorišćeni termini i status „Iskorištena“ (BR-054, BR-055)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** član sa planom `Mjesečna 12 termina` (12 dolazaka u teretanu)
- **Koraci:** prijavite i odjavite člana nekoliko puta i pratite „Preostalo termina“ u zelenom
  dijalogu; naknadnim unosom dodajte dolaske dok ne potrošite svih 12.
- **Test podaci:** —
- **Očekivani rezultat:** brojač opada 12, 11, 10 … Kada dođe na 0, status članarine postaje
  „Iskorištena“, a sljedeći dolazak je **neplaćen** (žuti dijalog).
- **Gdje provjeriti:** UI; profil → „Članarine“, kolona „Preostalo termina“
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-c.spec.ts`: plan sa 12 dolazaka i 10 iskorištenih: prijava → „Teretana: 1 preostalo“, sljedeća → „Teretana: 0 preostalo“; na profilu status „Iskorištena“; sljedeći dolazak je neplaćen (žuti dijalog). Raniji dokaz (22.09.): DB 0006/0007: datumi BR-052, prestari dolasci, vlasnikova prava, E14 kraj mjeseca, limiti/statusi, smjena i finansijski snapshot. Ovo potvrđuje baznu logiku, ne sve korake/poruke UI slučaja.

### [MSHIP-15] [Produži članarinu] iz upozorenja o neplaćenom dolasku
- **Prioritet:** Visoko
- **Uloga / preduslovi:** žuti ili crveni dijalog iz REC-06/REC-07
- **Koraci:** kliknite [Produži članarinu] → prodajte `Mjesečna` → sačuvajte.
- **Test podaci:** —
- **Očekivani rezultat:** dijalog prodaje se otvara za tog člana, sa predloženim trenerom iz
  posljednje članarine iste vrste. Nakon prodaje, neplaćeni dolasci koje nova članarina pokriva
  postaju plaćeni.
- **Gdje provjeriti:** UI; profil → „Dolasci“
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** E2E reception.spec.ts: produženje iz upozorenja o neplaćenom dolasku i povezivanje oba dolaska.

### [MSHIP-16] Prodaja bez otvorene smjene
- **Prioritet:** Kritično
- **Uloga / preduslovi:** nema otvorene smjene; vlasnik prijavljen
- **Koraci:** profil člana → [Nova članarina].
- **Test podaci:** —
- **Očekivani rezultat:** dugme je onemogućeno sa razlogom „Nema otvorene smjene. Recepcioner mora
  biti prijavljen.“
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-critical.spec.ts` (SHIFT-07): bez otvorene smjene vlasnik na profilu člana ima onemogućeno [Nova članarina] sa razlogom „Nema otvorene smjene. Recepcioner mora biti prijavljen.“ Raniji dokaz (22.09.): DB 0006/0007: datumi BR-052, prestari dolasci, vlasnikova prava, E14 kraj mjeseca, limiti/statusi, smjena i finansijski snapshot. Ovo potvrđuje baznu logiku, ne sve korake/poruke UI slučaja.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-c.spec.ts`: prodaja Mjesečne za 79 €, cijena plana promijenjena na 89 (uz napomenu „Promjena cijene važi samo za nove prodaje.“), nova prodaja 89 €; u bazi i na S-12 stara uplata ostaje 79,00 €. Cijena vraćena na 79. Raniji dokaz (22.09.): DB 0006/0007: datumi BR-052, prestari dolasci, vlasnikova prava, E14 kraj mjeseca, limiti/statusi, smjena i finansijski snapshot. Ovo potvrđuje baznu logiku, ne sve korake/poruke UI slučaja.

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
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** E2E payments.spec.ts + DB 0008: dnevne karte i trošak pulta, iznosi i zapisi u bazi.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-c.spec.ts`: [Jedna manje] onemogućeno na 1, [Jedna više] na 20; kucanje u polje se vraća u opseg: `0`→1, `-1`→1, `21`→20, `abc`→1, `2.5`→2; na 20 „Ukupno: 200,00 €“. Raniji dokaz (22.09.): Unit payments.test.ts + DB 0008: količina, način plaćanja, opis/kategorija i novčane granice. Nisu svi unosi ponovljeni kroz UI.

### [PAY-03] Dnevna karta bez načina plaćanja
- **Prioritet:** Visoko
- **Uloga / preduslovi:** dijalog „Dnevna karta“
- **Koraci:** ne birajte način plaćanja → [Naplati].
- **Test podaci:** —
- **Očekivani rezultat:** „Izaberite način plaćanja.“
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-c.spec.ts`: [Naplati] bez načina plaćanja → „Izaberite način plaćanja.“; nijedna dnevna karta nije evidentirana. Raniji dokaz (22.09.): Unit payments.test.ts + DB 0008: količina, način plaćanja, opis/kategorija i novčane granice. Nisu svi unosi ponovljeni kroz UI.

### [PAY-04] Dnevna karta kada plan nije podešen
- **Prioritet:** Nisko
- **Uloga / preduslovi:** Vlasnik privremeno deaktivira plan „Dnevna karta“ u `/settings/plans`
- **Koraci:** otvorite [Dnevna karta] na recepciji.
- **Test podaci:** —
- **Očekivani rezultat:** „Dnevna karta nije podešena. Vlasnik je dodaje u planovima.“
  Vratite plan u aktivno stanje poslije testa.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO (nakon popravke N-06).** Prvi pokušaj: deaktivacija „Dnevne karte“ kroz `/settings/plans` nije bila moguća — vidi **N-06**. Nakon popravke: plan deaktiviran kroz UI, [Dnevna karta] na recepciji prikazuje „Dnevna karta nije podešena. Vlasnik je dodaje u planovima.“ Plan vraćen u aktivno stanje.

### [PAY-05] Trošak sa pulta (happy path)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** otvorena smjena
- **Koraci:** `/reception` → [Trošak] → Kategorija `Potrošni materijal`, Opis `Sredstvo za čišćenje`,
  Iznos `12,50` → sačuvajte.
- **Test podaci:** kao gore
- **Očekivani rezultat:** u dijalogu stoji nepromjenjiva napomena „Plaćeno iz kase · danas“.
  Nakon čuvanja „Trošak je sačuvan.“ Stavka je na `/payments/today` u sekciji troškova.
- **Gdje provjeriti:** UI; `/payments/today`
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** E2E payments.spec.ts + DB 0008: dnevne karte i trošak pulta, iznosi i zapisi u bazi.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-c.spec.ts`: bez kategorije → „Izaberite kategoriju.“; opis 1 i 201 znak → „Unesite opis (2–200 znakova).“; iznos `0`, `10000,01`, `-5`, `12,345`, `abc` → „Unesite iznos od 0,01 do 10.000,00 €.“; `0,01` i `10000` se čuvaju. Raniji dokaz (22.09.): Unit payments.test.ts + DB 0008: količina, način plaćanja, opis/kategorija i novčane granice. Nisu svi unosi ponovljeni kroz UI.

### [PAY-07] Kategorija „Plate“ nije dostupna na pultu (D-37)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** dijalog „Trošak“
- **Koraci:** otvorite padajuću listu kategorija.
- **Test podaci:** —
- **Očekivani rezultat:** kategorije `Plate` nema u listi. (Vlasnik je ima na `/finance/expenses`.)
  Ako se ipak pošalje, odgovor je „Ova kategorija nije dozvoljena.“
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-c.spec.ts`: kategorija za plate nije ponuđena na pultu; krivotvoren zahtjev sa njom → „Ova kategorija nije dozvoljena.“ Raniji dokaz (22.09.): DB 0008 provjerava ograničenja troškova pulta. Cijeli spisak ponuđenih kategorija nije zasebno upoređen.

### [PAY-08] Ispravka uplate — način i napomena (BR-094)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** Recepcioner; uplata iz **njegove otvorene** smjene
- **Koraci:** `/payments/today` → [Ispravi] na uplati → promijenite način na „Platna kartica“,
  unesite napomenu `Greška pri naplati` → sačuvajte.
- **Test podaci:** napomena 20 znakova
- **Očekivani rezultat:** „Uplata je ispravljena.“ Način je promijenjen. Polje iznosa je
  recepcioneru nedostupno ili daje „Samo vlasnik može mijenjati iznos.“
- **Gdje provjeriti:** UI; vlasnik: `/finance/audit`
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-money.spec.ts`: recepcioner u dijalogu ispravke nema polje iznosa; promjena načina na „Platna kartica“ i napomena „Greška pri naplati“ → „Uplata je ispravljena.“; u bazi `method = card`, napomena upisana, iznos 10 nepromijenjen. Vlasnik u `/finance/audit` vidi red „Izmjena · Uplate danas · note: — → Greška pri naplati, method: cash → card“. Raniji dokaz (22.09.): E2E payments.spec.ts i DB 0008 pokrivaju ispravke, vlasnikovu promjenu iznosa, zaključenu smjenu i poništavanje članarine. Nisu sve negativne varijante i svaki tekst iz plana izvršeni kroz UI.

### [PAY-09] Ispravka iznosa je vlasnikova
- **Prioritet:** Kritično
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** `/payments/today` → [Ispravi] → promijenite iznos na `70` → sačuvajte.
- **Test podaci:** `70`
- **Očekivani rezultat:** iznos je izmijenjen i vidi se u dnevnim ukupnostima i u izvještaju smjene.
  Napomena duža od 500 znakova daje „Napomena može imati najviše 500 znakova.“
- **Gdje provjeriti:** UI; `/finance/audit`
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-money.spec.ts`: vlasnik mijenja iznos na 70 → „Uplata je ispravljena.“, red pokazuje 70,00 €; podnožje „Otvorena smjena“ na S-12 i S-14 recepcionera pokazuju „Platna kartica (prihod) 70,00 €“. Raniji dokaz (22.09.): E2E payments.spec.ts i DB 0008 pokrivaju ispravke, vlasnikovu promjenu iznosa, zaključenu smjenu i poništavanje članarine. Nisu sve negativne varijante i svaki tekst iz plana izvršeni kroz UI.

### [PAY-10] Stavka iz zaključene smjene nije izmjenjiva (AS-14)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** postoji zaključena smjena sa uplatom; prijavljeni kao recepcioner u novoj smjeni
- **Koraci:** otvorite `/payments/today` i potražite stavku iz ranije, zaključene smjene istog dana.
- **Test podaci:** —
- **Očekivani rezultat:** uz nju stoji „Stavka iz zaključene smjene – samo vlasnik je može
  mijenjati.“ i dugmad [Ispravi]/[Poništi] su nedostupna. Vlasnik ih ima. Pokušaj ispravke bez
  dozvole daje „Ova stavka se ne može mijenjati (smjena je zaključena).“
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-money.spec.ts`: nakon zaključenja smjene isti recepcioner (nova smjena) i menadžer vide stavku stare smjene sa onemogućenim [Ispravi]/[Poništi] i razlogom „Stavka iz zaključene smjene – samo vlasnik je može mijenjati.“; vlasnik ih ima omogućene. Poruka RPC-a za zaobiđeni UI nije ponovo izazvana (pokriva je DB test 0008). Raniji dokaz (22.09.): E2E payments.spec.ts i DB 0008 pokrivaju ispravke, vlasnikovu promjenu iznosa, zaključenu smjenu i poništavanje članarine. Nisu sve negativne varijante i svaki tekst iz plana izvršeni kroz UI.

### [PAY-11] Poništavanje uplate traži razlog (BR-095)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** uplata iz otvorene smjene
- **Koraci:** [Poništi] → probajte razlog `ab` (2 znaka), pa 201 znak, pa `Greška u naplati`.
- **Test podaci:** kao gore
- **Očekivani rezultat:** prva dva puta „Unesite razlog (3–200 znakova).“ Treći put
  „Stavka je poništena.“ Stavka ostaje u listi, precrtana, sa oznakom „Poništeno“, i **ne ulazi** u
  ukupnosti smjene.
- **Gdje provjeriti:** UI; `/shift/close` ukupnosti
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-money.spec.ts`: razlog `ab` i 201 znak → „Unesite razlog (3–200 znakova).“; `Greška u naplati` → „Stavka je poništena.“; red ostaje, precrtan, sa „(Poništeno)“; „Gotovina (prihod)“ na S-14 pada sa 10,00 € na 0,00 €. Raniji dokaz (22.09.): E2E payments.spec.ts i DB 0008 pokrivaju ispravke, vlasnikovu promjenu iznosa, zaključenu smjenu i poništavanje članarine. Nisu sve negativne varijante i svaki tekst iz plana izvršeni kroz UI.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-money.spec.ts`: članarina prodata danas i ručna prijava koju pokriva; [Poništi] na uplati pokazuje „Poništavanjem ove uplate poništava se i članarina, a njeni dolasci postaju neplaćeni.“; nakon potvrde članarina ima status „Poništena“, dolazak „Neplaćeno“, a značka „Neplaćeni dolasci: 1“ se vraća. Raniji dokaz (22.09.): E2E payments.spec.ts i DB 0008 pokrivaju ispravke, vlasnikovu promjenu iznosa, zaključenu smjenu i poništavanje članarine. Nisu sve negativne varijante i svaki tekst iz plana izvršeni kroz UI.

### [PAY-13] Poništena stavka se ne poništava dvaput
- **Prioritet:** Srednje
- **Uloga / preduslovi:** poništena uplata iz PAY-11
- **Koraci:** pokušajte ponovo [Ispravi] i [Poništi] na istoj stavci.
- **Test podaci:** —
- **Očekivani rezultat:** dugmad nisu dostupna; ako se zahtjev ipak pošalje, odgovor je jasna
  poruka o grešci, a ne dupli zapis.
- **Gdje provjeriti:** UI; `/finance/audit` (samo jedan zapis poništenja)
- [x] Prošlo  [ ] Palo  Napomena: **24.09.2026 — PROŠLO uz napomenu.** `test-plan-medium-a.spec.ts`: poništena dnevna karta ostaje precrtana, bez dugmadi [Ispravi] i [Poništi]. Drugi pult, koji je imao otvoren dijalog poništavanja, dobija „Ova stavka se ne može mijenjati (smjena je zaključena).“; direktni pozivi `void_payment` i `correct_payment` iz sesije recepcionera vraćaju `E_RECORD_NOT_EDITABLE`. Razlog i način plaćanja se ne mijenjaju, a u dnevniku izmjena je tačno jedan zapis „Poništeno“. **Napomena:** tekst poruke (doc 08) navodi „smjena je zaključena“ i kada je stvarni razlog to što je stavka već poništena; prijedlog je u §9.10. Raniji dokaz (22.09.): DB 0008 potvrđuje pravila poništavanja uplata/troškova. UI ponovnog poništavanja nije posebno testiran.

### [PAY-14] Poništavanje troška
- **Prioritet:** Visoko
- **Uloga / preduslovi:** trošak iz PAY-05, ista otvorena smjena
- **Koraci:** [Poništi] → razlog `Pogrešan iznos` → potvrdite.
- **Test podaci:** —
- **Očekivani rezultat:** „Stavka je poništena.“ Trošak je precrtan i ne ulazi u „Troškovi iz kase“
  na zaključenju smjene.
- **Gdje provjeriti:** UI; `/shift/close`
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-c.spec.ts`: trošak od 0,01 € poništen razlogom „Pogrešan iznos“ → „Stavka je poništena.“, red precrtan; „Troškovi iz kase“ na S-14 pada sa 10.000,01 € na 10.000,00 €. Raniji dokaz (22.09.): DB 0008 potvrđuje pravila poništavanja uplata/troškova. UI ponovnog poništavanja nije posebno testiran.

### [PAY-15] Prazno stanje ekrana „Uplate danas“
- **Prioritet:** Srednje
- **Uloga / preduslovi:** dan bez uplata (npr. odmah ujutro ili na svježoj bazi)
- **Koraci:** otvorite `/payments/today`.
- **Test podaci:** —
- **Očekivani rezultat:** „Danas još nema uplata.“ i „Danas još nema troškova.“ (odnosno
  „Danas još nema prodaje.“ za magacin).
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** E2E screens.spec.ts: „Danas još nema uplata.“ na oba viewporta.

### [PAY-16] Dupli klik na [Naplati]
- **Prioritet:** Visoko
- **Uloga / preduslovi:** dijalog dnevne karte ili prodaje članarine
- **Koraci:** kliknite dugme dvaput vrlo brzo.
- **Test podaci:** —
- **Očekivani rezultat:** evidentira se **tačno jedna** uplata. Dugme se onemogućava dok traje
  čuvanje i prikazuje indikator učitavanja.
- **Gdje provjeriti:** UI; `/payments/today` (broj stavki)
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-extra.spec.ts`: `dblclick` na [Naplati] u dnevnoj karti → tačno jedna nova uplata `day_pass`; `dblclick` na [Naplati i sačuvaj] u prodaji članarine → tačno jedna članarina. Onemogućeno dugme i indikator provjereni u UX-02.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-d.spec.ts`: [Nova roba] 24 × 0,35 € „Iz kase“ → „Roba je evidentirana.“, stanje 24, nabavna cijena proizvoda 0,35 €; na S-12 trošak „Roba za prodaju“ 8,40 €; „Troškovi iz kase“ na S-14 8,40 €. Raniji dokaz (22.09.): E2E storage.spec.ts + DB 0009: nabavka iz kase, prodaja, odbijanje viška, ispravka i poništavanje prolaze. Nisu svi filteri i prikazi sa svih ekrana upoređeni.

### [STO-02] Unos robe van kase
- **Prioritet:** Visoko
- **Uloga / preduslovi:** može i bez otvorene smjene
- **Koraci:** [Nova roba] → Količina `12`, cijena `0,30`, Plaćanje `Van kase` → sačuvajte.
- **Test podaci:** —
- **Očekivani rezultat:** stanje raste za 12; trošak je zabilježen bez načina plaćanja
  („Van kase“) i **ne** umanjuje očekivanu gotovinu u smjeni.
- **Gdje provjeriti:** UI; `/shift/close` („Troškovi iz kase“ se ne mijenja)
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-d.spec.ts`: 12 × 0,30 € „Van kase“ → stanje 36; trošak 3,60 € bez načina i nije iz kase; „Troškovi iz kase“ ostaju 8,40 €. Raniji dokaz (22.09.): DB 0009: nabavka van kase, negativna zaliha, poništavanje i vidljivost vrijednosti/zarade po ulogama. UI koraci nisu u cijelosti izvršeni.

### [STO-03] Nabavna cijena — granice (D-55)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** dijalog „Nova roba“
- **Koraci:** probajte `0`, `0,001`, `0,01`, `-1`, `abc`, prazno.
- **Test podaci:** kao gore
- **Očekivani rezultat:** samo `0,01` i više prolazi; ostalo daje
  „Nabavna cijena mora biti najmanje 0,01 €.“ Besplatna isporuka nije dozvoljena.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-d.spec.ts`: nabavna cijena `0`, `0,001`, `-1`, `abc` i prazno → „Nabavna cijena mora biti najmanje 0,01 €.“; ništa nije upisano (0,01 i više prolaze u STO-01/02/09). Raniji dokaz (22.09.): Unit storage.test.ts + DB 0009: pozitivna nabavna cijena i količine; granice nisu sve ponovljene u browseru.

### [STO-04] Količina — granice
- **Prioritet:** Visoko
- **Uloga / preduslovi:** dijalozi „Nova roba“ i „Prodaja“
- **Koraci:** probajte `0`, `1`, `10000`, `10001`, `-5`, `2.5`, `abc`.
- **Test podaci:** kao gore
- **Očekivani rezultat:** `1` i `10000` prolaze; ostalo daje „Unesite količinu od 1 do 10000.“
  (za prodaju je gornja granica stanje na zalihi).
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO uz napomenu.** `test-plan-high-d.spec.ts`: nabavka `0`, `10001`, `-5`, `2.5` → „Unesite količinu od 1 do 10000.“; prodaja `0` i `-1` → ista poruka, `37` pri stanju 36 → „Nema dovoljno na stanju (stanje: 36).“ `abc` se ne može ni unijeti (polje je `type=number`). Raniji dokaz (22.09.): Unit storage.test.ts + DB 0009: pozitivna nabavna cijena i količine; granice nisu sve ponovljene u browseru.

### [STO-05] Prodaja iz magacina
- **Prioritet:** Visoko
- **Uloga / preduslovi:** stanje veće od 0; otvorena smjena
- **Koraci:** [Prodaja] za `Voda` → Količina `2` → [Gotovina] → [Naplati].
- **Test podaci:** 2 × 1,50 €
- **Očekivani rezultat:** „Ukupno: 3,00 €“ prije naplate; poslije „Prodaja je sačuvana.“
  Stanje pada za 2. Na `/payments/today` je stavka „Voda × 2“.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-d.spec.ts`: prodaja 2 × 1,50 € gotovinom → „Ukupno: 3,00 €“, „Prodaja je sačuvana.“, stanje 36 → 34; na S-12 „E2E Voda × 2“. Raniji dokaz (22.09.): E2E storage.spec.ts + DB 0009: nabavka iz kase, prodaja, odbijanje viška, ispravka i poništavanje prolaze. Nisu svi filteri i prikazi sa svih ekrana upoređeni.

### [STO-06] Prodaja više nego što ima na stanju (E17)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** stanje npr. 5
- **Koraci:** pokušajte da prodate 6 komada (po potrebi ukucajte broj direktno u polje).
- **Test podaci:** 6
- **Očekivani rezultat:** „Nema dovoljno na stanju (stanje: 5).“ Prodaja nije evidentirana i
  stanje se ne mijenja.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-money.spec.ts`: stanje 5, prodaja 6 → „Nema dovoljno na stanju (stanje: 5).“; stanje ostaje 5, nema izlaza robe u bazi. Raniji dokaz (22.09.): E2E storage.spec.ts + DB 0009: nabavka iz kase, prodaja, odbijanje viška, ispravka i poništavanje prolaze. Nisu svi filteri i prikazi sa svih ekrana upoređeni.

### [STO-07] Prodaja kada je stanje 0
- **Prioritet:** Srednje
- **Uloga / preduslovi:** proizvod sa stanjem 0
- **Koraci:** pogledajte red proizvoda na `/storage`.
- **Test podaci:** —
- **Očekivani rezultat:** stoji „Nema na stanju.“ i dugme [Prodaja] je nedostupno.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **24.09.2026 — PROŠLO (nakon popravke N-22).** `test-plan-medium-a.spec.ts`. Prvi pokušaj PALO: [Prodaja] je bilo onemogućeno, ali bez objašnjenja — `MoneyButton` je prepisivao opis „Nema na stanju.“. Sada je dugme onemogućeno i nosi „Nema na stanju.“ (tooltip, a čitač ekrana čuje „Prodaja E2E Prazno Nema na stanju.“); proizvod koji ima stanje zadržava običan naziv. Tekst je tooltip, kako je zapisano u izvještaju M-09, a kolona „Stanje“ pokazuje 0. Raniji dokaz (22.09.): DB 0009: nabavka van kase, negativna zaliha, poništavanje i vidljivost vrijednosti/zarade po ulogama. UI koraci nisu u cijelosti izvršeni.

### [STO-08] Ispravka i poništavanje prodaje iz magacina
- **Prioritet:** Visoko
- **Uloga / preduslovi:** prodaja iz STO-05 u otvorenoj smjeni
- **Koraci:** `/payments/today` → sekcija „Prodaja iz magacina“ → [Ispravi] (promijenite način) →
  zatim [Poništi] uz razlog `Test`.
- **Test podaci:** —
- **Očekivani rezultat:** ispravka mijenja samo način plaćanja. Poništavanje vraća **količinu na
  stanje** (provjerite na `/storage`) i stavka je precrtana.
- **Gdje provjeriti:** UI; `/storage`
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-d.spec.ts`: [Ispravi] mijenja samo način (na karticu; količina i cijena ostaju, polja količine nema); [Poništi] uz razlog „Test“ → „Stavka je poništena.“, red precrtan, stanje se vraća na 36. Raniji dokaz (22.09.): E2E storage.spec.ts + DB 0009: nabavka iz kase, prodaja, odbijanje viška, ispravka i poništavanje prolaze. Nisu svi filteri i prikazi sa svih ekrana upoređeni.

### [STO-09] Poništavanje nabavke kada je roba već prodata (E18)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik; nabavka od 24 komada i prodatih npr. 20, stanje 4
- **Koraci:** `/finance/storage` → u listi „Ulazi robe“ → [Poništi] na toj nabavci.
- **Test podaci:** —
- **Očekivani rezultat:** „Poništavanje nije moguće – stanje bi bilo negativno.“ Ako stanje
  dozvoljava, poništavanje uspijeva i **zajedno s njim** se poništava automatski trošak nabavke.
- **Gdje provjeriti:** UI; `/payments/today` ili `/finance/expenses`
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-d.spec.ts`: nakon prodaje 30 kom (stanje 6) poništavanje nabavke od 24 → „Poništavanje nije moguće – stanje bi bilo negativno.“; nova nabavka od 5 se poništava i zajedno s njom njen trošak od 2,00 €; stanje 6. Raniji dokaz (22.09.): DB 0009: nabavka van kase, negativna zaliha, poništavanje i vidljivost vrijednosti/zarade po ulogama. UI koraci nisu u cijelosti izvršeni.

### [STO-10] Trošak nabavke se ne poništava zasebno
- **Prioritet:** Srednje
- **Uloga / preduslovi:** trošak nastao iz nabavke robe
- **Koraci:** pokušajte [Poništi] na tom trošku na `/payments/today` ili `/finance/expenses`.
- **Test podaci:** —
- **Očekivani rezultat:** radnja nije dozvoljena; stoji objašnjenje „Trošak nabavke poništava
  vlasnik zajedno sa nabavkom.“
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **24.09.2026 — PROŠLO uz napomenu.** `test-plan-medium-a.spec.ts`: nabavka „Iz kase“ (10 × 0,30 €). Na `/payments/today` i recepcioner i vlasnik vide [Poništi] onemogućeno sa objašnjenjem „Trošak nabavke poništava vlasnik zajedno sa nabavkom.“; vlasnikov direktni poziv `void_expense` vraća `E_RECORD_NOT_EDITABLE`. **Napomena:** na `/finance/expenses` red nabavke nema dugme [Poništi], ali ni objašnjenje zašto. Raniji dokaz (22.09.): DB 0009: nabavka van kase, negativna zaliha, poništavanje i vidljivost vrijednosti/zarade po ulogama. UI koraci nisu u cijelosti izvršeni.

### [STO-11] Recepcioner ne vidi vrijednost zalihe ni zaradu (BR-144)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Recepcioner
- **Koraci:** otvorite `/storage` i uporedite sa vlasnikovim `/finance/storage`.
- **Test podaci:** —
- **Očekivani rezultat:** recepcioner vidi kolone Proizvod, Stanje, Nabavna cijena, Prodajna
  cijena — ali nigdje ukupnu vrijednost zalihe ni zaradu. Te brojke su samo na vlasnikovom ekranu.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-d.spec.ts`: recepcioner na `/storage` ima kolone Proizvod, Stanje, Nabavna cijena, Prodajna cijena i nigdje „vrijednost zalihe“ ni „zarada“; vlasnikov `/finance/storage` prikazuje „Vrijednost zalihe“. Raniji dokaz (22.09.): DB 0009: nabavka van kase, negativna zaliha, poništavanje i vidljivost vrijednosti/zarade po ulogama. UI koraci nisu u cijelosti izvršeni.

### [STO-12] Prazan magacin
- **Prioritet:** Nisko
- **Uloga / preduslovi:** svi proizvodi neaktivni
- **Koraci:** deaktivirajte `Voda` u `/settings/products` i otvorite `/storage`.
- **Test podaci:** —
- **Očekivani rezultat:** „Nema proizvoda. Vlasnik dodaje proizvode u Podešavanjima.“
  Vratite proizvod u aktivno stanje.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-extra.spec.ts`: jedini proizvod deaktiviran kroz `/settings/products` → `/storage` prikazuje „Nema proizvoda. Vlasnik dodaje proizvode u Podešavanjima.“ Proizvod vraćen u aktivno stanje.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-rest.spec.ts`: smjena sa vlasnikovom članarinom 70 € gotovinom, dnevnom kartom 10 € karticom, poništenom dnevnom kartom 10 € gotovinom, prodajom 2 × 1,50 € gotovinom i troškom iz kase 4 €: „Gotovina (prihod)“ 73,00 €, „Platna kartica (prihod)“ 10,00 €, „Troškovi iz kase“ 4,00 €, „Očekivana gotovina“ 69,00 €; „Uplate: 1 · Dnevne karte: 1 · Prodaja: 1 · Poništeno: 1“; „U teretani je još 1 osoba.“ Poništena stavka nije u iznosima. Raniji dokaz (22.09.): E2E close-shift.spec.ts i DB 0010 provjeravaju E15 obračun i stavke smjene. Nije ručno vizuelno upoređen svaki red sa štampanim izvještajem.

### [CLOSE-02] Pregled stavki
- **Prioritet:** Srednje
- **Uloga / preduslovi:** ekran S-14
- **Koraci:** kliknite [Pregledaj stavke], pa [Sakrij stavke].
- **Test podaci:** —
- **Očekivani rezultat:** razvija se spisak svih stavki smjene po grupama (uplate, dnevne karte,
  zamjenske kartice, prodaja, troškovi, poništeno). Recepcioner vidi **samo svoje** troškove.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **24.09.2026 — PROŠLO uz napomenu.** `test-plan-medium-a.spec.ts`: [Pregledaj stavke] otvara listu, [Sakrij stavke] je zatvara (`aria-expanded`). Lista: članarina (Gotovina, 39,00 €), nabavka iz kase −3,00 €, prodaja vode karticom 3,00 €, recepcionerov trošak −4,00 €. Vlasnikov trošak iz kase (7 €) u istoj smjeni **nije** na recepcionerovoj listi (BR-134), ali jeste u „Troškovi iz kase: 14,00 €“. **Napomena:** lista je hronološka i svaki red navodi vrstu, a nije podijeljena po grupama kako plan pretpostavlja; poništene stavke se samo broje („Poništeno: 1“) i ne navode se, dok ih PDF izvještaj navodi. Doc 06 (S-14) kaže samo da dugme „razvija cijelu listu“. Raniji dokaz (22.09.): E2E close-shift.spec.ts i DB 0010 provjeravaju E15 obračun i stavke smjene. Nije ručno vizuelno upoređen svaki red sa štampanim izvještajem.

### [CLOSE-03] Prebrojana gotovina je obavezna i računa razliku
- **Prioritet:** Kritično
- **Uloga / preduslovi:** ekran S-14
- **Koraci:** pokušajte da zaključite bez unosa; zatim unesite iznos manji od očekivanog, pa veći.
- **Test podaci:** prazno; `abc`; `-10`; `12,345`; očekivano − 5; očekivano + 5
- **Očekivani rezultat:** prazno i neispravni oblici daju „Unesite prebrojanu gotovinu, na primjer
  225 ili 225,50.“ Kod manjeg iznosa piše „Razlika: … (Manjak)“, kod većeg „(Višak)“.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO (nakon popravke N-10).** Prvi pokušaj: za prazan i neispravan iznos dugme [Zaključi smjenu i odjavi me] je samo onemogućeno, bez ikakve poruke — poruka iz plana se nikad nije prikazivala. Sada `test-plan-forms.spec.ts`: `abc`, `-10`, `12,345` i ponovo ispražnjeno polje prikazuju „Unesite prebrojanu gotovinu, na primjer 225 ili 225,50.“ uz onemogućeno dugme; očekivano 84,00 € → 79 daje „Razlika: -5,00 € (Manjak)“, 89 daje „Razlika: 5,00 € (Višak)“. Raniji dokaz (22.09.): E2E E15 provjerava razliku za 225,00 €, DB 0010 pravila zaključenja. Svi neispravni iznosi nisu ponovljeni u formi.

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
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** E2E close-shift.spec.ts: potvrda, zatvaranje, odjava i PDF; namjerno pogrešan Resend ključ daje failed, smjena ostaje zaključena.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO uz napomenu.** `test-plan-flows.spec.ts`: PDF se preuzima kao `smjena-gggg-mm-dd.pdf` (Content-Disposition) i, pročitan kao tekst, sadrži recepcionera, način zaključenja („Zaključio/la <ime>“, D-64), sve stavke, ukupnosti, prebrojanu gotovinu, razliku i „U teretani pri zaključenju: 1“. Status emaila u testnom okruženju je namjerno „neuspješno“ (N-05); stvarno slanje sa PDF prilogom i naslov potvrđeni su 22.09. (§9.3, `tests/unit/shift-report.test.ts`). Sanduče danas nije ponovo provjereno. Raniji dokaz (22.09.): PDF generisan, preuzet iz Storage i email stvarno poslat sa noreply@stamenkovicc.com; Resend delivered za testnog primaoca. Nisu vizuelno upoređeni svi PDF redovi sa UI-jem. Sa postojećim EMAIL_FROM=onboarding@resend.dev slanje na tu adresu pada 403, vidi N-04.

### [CLOSE-06] Neuspjelo slanje ne ruši zaključenje (BR-118)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** namjerno pokvaren `RESEND_API_KEY` u `.env.local` (restartujte `npm run dev`)
- **Koraci:** zaključite smjenu kao recepcioner; zatim kao vlasnik otvorite `/finance/shifts`.
- **Test podaci:** —
- **Očekivani rezultat:** smjena je **ipak zaključena**, recepcioner je odjavljen, a status emaila
  je „neuspješno“ sa dugmetom [Pošalji ponovo]. Vratite ispravan ključ i kliknite [Pošalji ponovo]
  → status postaje „poslato“ i pojavljuje se „Izvještaj je ponovo poslat.“
- **Gdje provjeriti:** UI; email
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** E2E close-shift.spec.ts: potvrda, zatvaranje, odjava i PDF; namjerno pogrešan Resend ključ daje failed, smjena ostaje zaključena.

### [CLOSE-07] Zaključena smjena se više ne mijenja
- **Prioritet:** Kritično
- **Uloga / preduslovi:** zaključena smjena iz CLOSE-04
- **Koraci:** prijavite se kao isti recepcioner (otvara se nova smjena) i pokušajte [Ispravi] i
  [Poništi] na stavci iz **stare** smjene na `/payments/today`.
- **Test podaci:** —
- **Očekivani rezultat:** radnja je nedostupna; poruka „Ova stavka se ne može mijenjati
  (smjena je zaključena).“ Samo vlasnik može.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-money.spec.ts`: isti recepcioner se nakon zaključenja ponovo prijavi (nova smjena); [Ispravi] i [Poništi] na stavci stare smjene su onemogućeni sa razlogom „Stavka iz zaključene smjene – samo vlasnik je može mijenjati.“; vlasnik ih može koristiti. Raniji dokaz (22.09.): DB 0010 i E2E payments provjeravaju zatvorenu/tuđu smjenu i prava izmjene. Sve UI putanje ovog slučaja nisu ponovljene.

### [CLOSE-08] Zaključenje kada nema svoje smjene
- **Prioritet:** Srednje
- **Uloga / preduslovi:** Recepcioner B dok smjenu drži A (ne preuzimajte je)
- **Koraci:** otvorite `/shift/close`.
- **Test podaci:** —
- **Očekivani rezultat:** „Nemate otvorenu smjenu.“ bez forme za zaključenje.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **24.09.2026 — PROŠLO (nakon popravke N-23); očekivani rezultat je promijenjen.** `test-plan-medium-a.spec.ts`. Prvi pokušaj: recepcioner B na `/shift/close` dobija „Nemate otvorenu smjenu.“ bez forme, ali je kucanjem `/reception` mogao da radi bez preuzimanja i prodao dnevnu kartu koja je upisana u **Aninu** smjenu (N-23). Sada B, dok ne preuzme smjenu, sa svakog ekrana (`/shift/close`, `/reception`, `/payments/today`, `/storage`, `/members`, klik u meniju) završava na S-02 „Otvorena smjena“, pa „Nemate otvorenu smjenu.“ više ne vidi. Ana i dalje normalno radi i zaključuje. S-02 više ne prikazuje meni. Direktan RPC poziv iz B-ove sesije baza i dalje prihvata; vlasnik je odlučio da tako ostane (§9.10). Raniji dokaz (22.09.): DB 0010 i E2E payments provjeravaju zatvorenu/tuđu smjenu i prava izmjene. Sve UI putanje ovog slučaja nisu ponovljene.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-access.spec.ts`: **menadžer** kreira recepcionera (vlasnika pokriva auth.spec.ts); polja „Email“ nema; „Korisnik je kreiran.“; tabela ima kolone Ime, Korisničko ime/Email, Uloga, Aktivan, Kreiran; prva prijava vodi na S-01b. Raniji dokaz (22.09.): E2E auth.spec.ts: kreiranje recepcionera, prva prijava, nova lozinka, ulazak na recepciju. Sve druge uloge kreiranja nisu provjerene.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-forms.spec.ts`: `ab`, 31 znak, crtica, razmak i ćirilica → poruka o korisničkom imenu uz polje; 3 i 30 znakova prolaze; ponovljeno ime → „Korisničko ime je zauzeto.“ `Mx…` sa velikim slovom se **prihvata i čuva malim slovima** (odgovor na §7 pitanje 2). Tokom testa nađen **N-12**: ponovo otvoren dijalog je prikazivao poruku iz prethodnog pokušaja — popravljeno. Raniji dokaz (22.09.): Unit auth-schemas.test.ts + DB 0002 provjeravaju username, uloge i identitet administratora. Cijele tabele graničnih unosa nisu ponovljene kroz S-23.

### [SET-03] Ime i prezime i privremena lozinka — granice
- **Prioritet:** Visoko
- **Uloga / preduslovi:** forma „Novi korisnik“
- **Koraci:** probajte ime od 1 znaka, 2 znaka, 100 znakova, 101 znak; lozinku od 7 i od 8 znakova.
- **Test podaci:** kao gore
- **Očekivani rezultat:** 1 i 101 znak: „Unesite ime i prezime (2–100 znakova).“ 2 i 100 prolaze.
  Lozinka od 7: „Lozinka mora imati najmanje 8 znakova.“; 8 prolazi.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-e.spec.ts`: ime od 1 i 101 znaka → „Unesite ime i prezime (2–100 znakova).“; 2 i 100 znakova se čuvaju; lozinka od 7 znakova → „Lozinka mora imati najmanje 8 znakova.“, od 8 se čuva. Raniji dokaz (22.09.): Unit auth-schemas.test.ts + DB 0002 provjeravaju username, uloge i identitet administratora. Cijele tabele graničnih unosa nisu ponovljene kroz S-23.

### [SET-04] Administrator se pravi sa emailom
- **Prioritet:** Visoko
- **Uloga / preduslovi:** prijavljeni kao Administrator
- **Koraci:** [Novi korisnik] → Uloga `Administrator` → pogledajte koja se polja traže → unesite
  `novi.admin@primjer.com`; probajte i `nijeemail`.
- **Test podaci:** kao gore
- **Očekivani rezultat:** za administratora se traži **email**, ne korisničko ime.
  `nijeemail` daje „Unesite ispravan email.“; već zauzeta adresa daje „Email je zauzet.“
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-e.spec.ts`: za ulogu Administrator forma traži **email**, bez polja za korisničko ime; `nijeemail` → „Unesite ispravan email.“; email postojećeg administratora → „Email je zauzet.“; nova adresa se čuva. Raniji dokaz (22.09.): Unit auth-schemas.test.ts + DB 0002 provjeravaju username, uloge i identitet administratora. Cijele tabele graničnih unosa nisu ponovljene kroz S-23.

### [SET-05] Izmjena korisnika mijenja samo ime
- **Prioritet:** Srednje
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** [Uredi] na nekom korisniku → pogledajte koja su polja dostupna.
- **Test podaci:** novo ime `Marija Marić-Popović`
- **Očekivani rezultat:** mijenja se samo ime i prezime; korisničko ime i uloga su nepromjenjivi.
  Poruka „Podaci su sačuvani.“
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-extra.spec.ts`: dijalog „Uredi korisnika“ ima samo polje „Ime i prezime“ (nema polja za korisničko ime ni izbora uloge). `Marija Marić-Popović` → „Podaci su sačuvani.“; u bazi se promijenilo samo `full_name`, `username` i `role` isti.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-extra.spec.ts`: vlasnik → [Nova lozinka] → dijalog sa „Korisnik će morati da postavi svoju lozinku pri sljedećoj prijavi.“ → `NovaLoz123` → „Nova lozinka je postavljena.“ Administrator odmah vidi `NovaLoz123` u koloni „Lozinka“. Prijava tim nalogom vodi na `/change-password` sa tekstom S-01b.

### [SET-07] Deaktivacija i ponovna aktivacija
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik i jedan recepcioner
- **Koraci:** [Deaktiviraj] na recepcioneru → pokušajte da se prijavite tim nalogom → [Aktiviraj] →
  prijavite se ponovo.
- **Test podaci:** —
- **Očekivani rezultat:** „Korisnik je deaktiviran.“, kolona „Aktivan“ = Ne; prijava daje
  „Pogrešno korisničko ime/email ili lozinka.“ Nakon aktivacije prijava radi.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-e.spec.ts`: [Deaktiviraj] → „Korisnik je deaktiviran.“, „Aktivan: Ne“; prijava tim nalogom → „Pogrešno korisničko ime/email ili lozinka.“; [Aktiviraj] → „Korisnik je aktiviran.“ i prijava vodi na `/reception`. Raniji dokaz (22.09.): E2E auth.spec.ts: deaktivacija prekida pristup. Ponovna aktivacija nije izvršena kroz UI.

### [SET-08] Ne možete deaktivirati sami sebe (D-60)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** bilo koji nalog koji smije da administrira
- **Koraci:** u svom redu potražite [Deaktiviraj].
- **Test podaci:** —
- **Očekivani rezultat:** dugmeta nema. Ako se zahtjev ipak pošalje, odgovor je
  „Ne možete deaktivirati sopstveni nalog.“
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** E2E admin.spec.ts: sopstveni nalog ne može da se deaktivira.

### [SET-09] Posljednji vlasnik (ili administrator) mora ostati (D-60)
- **Prioritet:** Kritično
- **Uloga / preduslovi:** Administrator; u teretani je **jedan** aktivan vlasnik
- **Koraci:** pokušajte da deaktivirate tog vlasnika.
- **Test podaci:** —
- **Očekivani rezultat:** „Mora ostati bar jedan aktivan nalog ove uloge. Prvo dodajte zamjenu.“
  Nakon što napravite drugog vlasnika (`vlasnik.test`), deaktivacija prvog prolazi.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-critical.spec.ts`: administrator ne može da deaktivira jedinog vlasnika („Mora ostati bar jedan aktivan nalog ove uloge. Prvo dodajte zamjenu.“); nakon kreiranja drugog vlasnika deaktivacija prvog prolazi („Korisnik je deaktiviran.“). Posljednji administrator se kroz UI ne može dovesti u tu situaciju (sebe ne može deaktivirati, D-60; vlasnik ne upravlja administratorima) — pokriva ga samo DB test. Raniji dokaz (22.09.): E2E admin.spec.ts: posljednji vlasnik ne može da se deaktivira. Posljednji administrator nije zasebno testiran.

### [SET-10] Treneri: dodavanje, izmjena, deaktivacija
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik ili Menadžer
- **Koraci:** `/settings/trainers` → [Dodaj trenera] → ime `Novi Trener` → sačuvajte; izmijenite ime;
  skinite kvačicu „Aktivan“ i sačuvajte; provjerite da li se pojavljuje u prodaji članarine.
- **Test podaci:** ime od 1 znaka i 101 znaka za validaciju
- **Očekivani rezultat:** „Sačuvano.“ Kratko/dugo ime daje „Unesite ime trenera (2–100 znakova).“
  Neaktivan trener se više ne nudi pri prodaji ni pri prijavi dolaska.
- **Gdje provjeriti:** UI; dijalog „Nova članarina“
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-e.spec.ts`: ime od 1 i 101 znaka → „Unesite ime trenera (2–100 znakova).“; „Novi Trener“ dodat i preimenovan; nakon skidanja „Aktivan“ ne nudi se ni u prodaji personalne članarine ni pri grupnoj prijavi dolaska. Raniji dokaz (22.09.): DB 0003 i E2E settings.spec.ts provjeravaju katalog i da se za čas nude samo dodijeljeni treneri. Cijeli CRUD i deaktivacije trenera/programa/rasporeda nisu izvršeni.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO (nakon popravke N-13).** Prvi pokušaj PALO: polje naknade je prikazivalo „80,00 €“, pa je svako čuvanje u tom redu (npr. samo udjela 70) odbijano **bez ikakve poruke**. Sada `test-plan-access.spec.ts`: menadžer ne vidi polja; vlasnik čuva udio 70 uz nepromijenjenu naknadu 80; prazna polja → „nije definisano“ / „sa plana“; `101` i `-5` → „Udio mora biti između 0 i 100, ili prazno.“ i ništa se ne mijenja. Raniji dokaz (22.09.): E2E settings.spec.ts: vlasnik vidi/mijenja naknadu, menadžer je ne vidi. DB 0003 provjerava D-62 udio; svi UI unosi nisu izvršeni.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-e.spec.ts`: naziv programa od 1 i 51 znaka → „Unesite naziv programa (2–50 znakova).“; „Pilates“ (Grupni) dodat; dodjela trenera se čuva odmah na klik uz „Sačuvano.“ i isto tako skida. Raniji dokaz (22.09.): DB 0003 i E2E settings.spec.ts provjeravaju katalog i da se za čas nude samo dodijeljeni treneri. Cijeli CRUD i deaktivacije trenera/programa/rasporeda nisu izvršeni.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO uz napomenu.** `test-plan-high-e.spec.ts`: čas bez vremena → „Unesite vrijeme u formatu HH:mm.“; Ponedjeljak 18:00 se čuva i vidi u rasporedu; čas za danas u ovom trenutku se nudi kao „Čas: HH:MM“ pri grupnoj prijavi. `25:00`, `8:0` i `abc` se ne mogu ni unijeti (polje je `type=time`). Raniji dokaz (22.09.): DB 0003 i E2E settings.spec.ts provjeravaju katalog i da se za čas nude samo dodijeljeni treneri. Cijeli CRUD i deaktivacije trenera/programa/rasporeda nisu izvršeni.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO (nakon popravki N-14 i N-15).** `test-plan-access.spec.ts`, 14 kombinacija: dnevna karta sa trajanjem i teretana bez trajanja → „Dnevna karta nema trajanje; …“; personalni sa cijenom i teretana bez cijene → „Personalni nema unaprijed određenu cijenu; …“; naziv `a`/51 znak → „Unesite naziv plana (2–50 znakova).“; `79,50` i `79.50` sačuvani kao 79,5; `-5`/`abc` → „Unesite iznos, …“; ograničenje `0`/`-1` → „Unesite cijeli broj veći od 0 ili ostavite prazno.“; udio `101` → „Udio mora biti između 0 i 100.“; redoslijed `1000` → „Unesite cijeli broj od 0 do 999.“ Prvi pokušaj: teretana bez trajanja se **sačuvala** (N-14), a ograničenje i redoslijed su odbijani bez poruke (N-15). Raniji dokaz (22.09.): DB 0003 provjerava ograničenja plana, E2E settings izmjenu cijene i napomenu. Sve kombinacije trajanja nisu unesene kroz formu.

### [SET-15] Deaktiviranje plana
- **Prioritet:** Srednje
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** deaktivirajte jedan plan; otvorite prodaju članarine.
- **Test podaci:** `Studentska mjesečna`
- **Očekivani rezultat:** plan i dalje stoji u tabeli planova (sa oznakom da je neaktivan), ali se
  **ne nudi** pri prodaji. Ranije prodate članarine tog plana ostaju netaknute.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-extra.spec.ts`: `Studentska` deaktivirana kroz UI → u tabeli ostaje sa „Aktivan: Ne“; u prodaji članarine ne nudi se (ni neaktivna dnevna karta); postojeća članarina tog plana nepromijenjena u bazi i vidljiva na profilu. [Produži] na toj članarini otvara prodaju bez preselekcije (nudi samo aktivne planove).

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-e.spec.ts`: prodajna `0` → „Prodajna cijena mora biti veća od 0.“; nabavna `-1` i `abc` → „Unesite iznos, na primjer 79 ili 79,50.“; naziv od 1 i 51 znaka → „Unesite naziv proizvoda (2–50 znakova).“; „Izotonik“ 0,60/2,00 se odmah vidi na `/storage`. Raniji dokaz (22.09.): E2E settings.spec.ts: dodavanje proizvoda i cijena. Izmjena i deaktivacija nisu potpuno izvršene.

### [SET-17] Kategorije troškova (BR-131)
- **Prioritet:** Srednje
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** `/settings/gym` → sekcija „Kategorije troškova“ → dodajte `Čišćenje`; pokušajte da
  deaktivirate sistemsku kategoriju `Roba za prodaju`.
- **Test podaci:** —
- **Očekivani rezultat:** nova kategorija se čuva i odmah nudi u dijalogu troška. Sistemska
  kategorija se **ne može** deaktivirati (označena je kao „Sistemska“). Kategorije se nikad ne brišu.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **24.09.2026 — PROŠLO.** `test-plan-medium-b.spec.ts`: „E2E Čišćenje“ je sačuvana („Sačuvano.“) kao aktivna i odmah se nudi u dijalogu troška vlasnika (`/finance/expenses`) i recepcije. „Roba za prodaju“ nosi oznaku „Sistemska“, a polje „Aktivan“ je štiklirano i onemogućeno; direktan poziv za deaktivaciju vraća `E_CATEGORY_NOT_ALLOWED` i kategorija ostaje aktivna. U tabeli kategorija postoji samo [Uredi]; brisanja nema. Raniji dokaz (22.09.): E2E settings dodaje kategoriju; DB 0003 zabranjuje deaktivaciju sistemske kategorije. Sve UI varijante nisu izvršene.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO (nakon popravke N-17).** `test-plan-high-e.spec.ts`: zamjenska kartica `5` i `0` se čuvaju, `-1`/`abc` → „Unesite iznos, …“; minimalna cijena `80` i `0` se čuvaju; podsjetnik `1` i `14` prolaze, `0`/`15` → „Unesite broj dana od 1 do 14.“; zaštita `0` i `600` prolaze, `-1`/`601` → „Unesite broj sekundi od 0 do 600.“; prazni primaoci → „Unesite bar jednu adresu.“, `a@b.com, nijeemail` → „Jedna od adresa nije ispravna.“, dvije adrese u dva reda se čuvaju. Prvi pokušaj: podsjetnik i zaštita su vraćali englesku Zod poruku („Too small: expected number to be >=1“) — **N-17**. Vrijeme zaključivanja je `type=time`, pa `24:00`/`9:0` ne mogu ni da se unesu. Podrazumijevane vrijednosti vraćene. Raniji dokaz (22.09.): E2E settings i dodatni UI: ogromna cijena zamjenske kartice odbijena porukom ispod polja. Unit schema-bounds prolazi. Sva ostala polja/granice iz plana nisu izvršeni.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO uz napomenu.** `test-plan-high-e.spec.ts`: PDF i `.txt` preimenovan u `.png` → „Dozvoljeni su PNG i JPG do 1 MB.“, logo se ne čuva; JPG pa PNG → „Logo je sačuvan.“; PDF kartica tada ima sliku više (logo pored QR koda). Bez izabranog fajla forma se ne šalje — zaustavlja je browser jer je polje obavezno, bez poruke aplikacije (§9.9). Prevelik PNG: SEC-07/N-01. Raniji dokaz (22.09.): Tekst preimenovan u PNG i SVG odbijeni; logo_path ostaje null. PNG od 5 MB je davao HTTP 500 — popravljeno, vidi SEC-07 i N-01. Validan PNG/JPG upload i dalje nije ponovljen.

### [SET-20] Prikaz posljednje rezervne kopije
- **Prioritet:** Nisko
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** `/settings/gym` → pročitajte red o rezervnoj kopiji prije i poslije pokretanja
  `npm run jobs:run -- weekly-backup`.
- **Test podaci:** —
- **Očekivani rezultat:** prije: „Posljednja rezervna kopija: Još nije napravljena“.
  Poslije: „Posljednja rezervna kopija: dd.mm.gggg HH:MM – uspješno“ (ili „neuspješno: <greška>“).
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** E2E jobs.spec.ts: nije napravljena, neuspješna i uspješna posljednja kopija na S-27.

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
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** E2E cards.spec.ts + DB 0004: 100 jedinstvenih desetocifrenih kodova, bez vodeće nule, prazne kartice i serija.

### [CARD-02] Granice broja kartica
- **Prioritet:** Visoko
- **Uloga / preduslovi:** ekran S-28
- **Koraci:** probajte `0`, `1`, `100`, `101`, `-5`, `abc`, prazno, `2.5`.
- **Test podaci:** kao gore
- **Očekivani rezultat:** `1` i `100` prolaze; ostalo daje „Unesite broj između 1 i 100.“
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-d.spec.ts` (menadžer): `0`, `101`, `-5`, `abc`, prazno i `2.5` → „Unesite broj između 1 i 100.“ bez nove serije; `1` i `100` → „Kartice su generisane.“ Raniji dokaz (22.09.): Dodatni UI: 0, 101, -1 i 1.5 ne kreiraju seriju; E2E 100 prolazi, DB 0/101 odbija. Nisu sve poruke i sve ostale vrijednosti iz plana provjerene.

### [CARD-03] PDF liste kartica
- **Prioritet:** Visoko
- **Uloga / preduslovi:** postoji serija
- **Koraci:** [Preuzmi PDF] → otvorite fajl.
- **Test podaci:** —
- **Očekivani rezultat:** fajl `kartice-gggg-mm-dd.pdf`; svaka kartica ima kôd (i bar kôd/QR ako je
  predviđen), naziv teretane, logo ako je otpremljen, i liniju „Ime i prezime:“ za upisivanje.
  Kodovi u PDF-u se poklapaju sa onima koje aplikacija prihvata pri skeniranju.
- **Gdje provjeriti:** PDF; skeniranje jednog koda iz PDF-a
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO uz napomenu.** `test-plan-high-d.spec.ts`: PDF se preuzima kao `kartice-gggg-mm-dd.pdf`, sadrži naziv teretane, „Ime i prezime:“ i kôd kartice (u grupama `ddd ddd dddd`, Courier); taj kôd skeniran na recepciji otvara registraciju (prazna kartica). QR sadržaj i dimenzije pokriva `tests/unit/card-sheet.test.ts`; fizička štampa i skeniranje sa papira nisu izvedeni. Raniji dokaz (22.09.): E2E PDF preuzimanje + unit card-sheet.test.ts: QR payload, broj kartica po A4, dimenzije i čćšžđ. Fizička štampa, rezanje i skeniranje papira nisu izvršeni.

### [CARD-04] Brojač praznih kartica se smanjuje
- **Prioritet:** Srednje
- **Uloga / preduslovi:** serija od 10 kartica
- **Koraci:** registrujte člana jednom karticom iz te serije, pa se vratite na `/settings/cards`.
- **Test podaci:** —
- **Očekivani rezultat:** kolona „Prazne“ pada sa 10 na 9.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **24.09.2026 — PROŠLO.** `test-plan-medium-b.spec.ts`: vlasnik generiše seriju od 10 („Kartice su generisane.“, red 10 / Prazne 10), recepcioner registruje člana jednom karticom iz serije, a poslije osvježavanja red pokazuje „10 9“. Raniji dokaz (22.09.): E2E members i DB 0006 potvrđuju prelazak kartice iz unassigned u active. Brojač na S-28 nije zasebno upoređen prije/poslije.

### [CARD-05] Prazno stanje
- **Prioritet:** Nisko
- **Uloga / preduslovi:** baza bez serija
- **Koraci:** otvorite `/settings/cards`.
- **Test podaci:** —
- **Očekivani rezultat:** „Nema generisanih serija.“
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** Dodatni UI + E2E cards.spec.ts: prazna serija prikazuje Nema generisanih serija.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-f.spec.ts`: recepcija proda Mjesečnu (79, gotovina), Grupni i G+T sa trenerom (69 i 99, kartica), Personalni (100, gotovina) i jednu dnevnu kartu koju poništi. Na `/finance` svaki izbor („Danas“, „Ova sedmica“, „Ovaj mjesec“, „Prošli mjesec“, „Ova godina“, „Proizvoljno“ juče–danas + [Prikaži]) upisuje `?period=…` (i `from`/`to`) u adresu i preživljava osvježavanje; „Prihod“ je 347,00 € u svim periodima koji sadrže danas, a 0,00 € za „Prošli mjesec“; kartice „Troškovi“, „Profit“, „Zarada na magacinu“, „Aktivni članovi“ su prisutne. Da „Ova sedmica“ ide od ponedjeljka do nedjelje provjereno je unit testom (`tests/unit/period.test.ts`: ponedjeljak, srijeda, nedjelja i sedmica preko dva mjeseca). Raniji dokaz (22.09.): E2E finance.spec.ts + DB 0012: zbirni prihodi/troškovi, podjele i grafikon za 12 mjeseci. Svi periodi i svaki detalj iz plana nisu provjereni.

### [FIN-02] Proizvoljan period — neispravne vrijednosti
- **Prioritet:** Srednje
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** ručno izmijenite adresu: `?period=custom&from=2026-09-30&to=2026-09-01` (obrnuto),
  `?period=custom&from=abc&to=xyz`, `?period=izmisljeno`.
- **Test podaci:** kao gore
- **Očekivani rezultat:** stranica se ne ruši; vraća se na podrazumijevani period „Ovaj mjesec“.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO (nakon popravke N-07).** Tri adrese iz plana (obrnut period, `abc/xyz`, `izmisljeno`) daju HTTP 200 i „Ovaj mjesec“, bez greške. Dodatna provjera `from=2026-02-31` je prihvaćena kao proizvoljan period sa nepostojećim datumom — vidi **N-07**; nakon popravke i ona vraća „Ovaj mjesec“. Regresija: `tests/unit/period.test.ts`.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-f.spec.ts`: za danas „Prihod po vrsti članarine“ = 100 + 99 + 79 + 69 = 347,00 € (poklapa se sa karticom „Prihod“), „Prihod po načinu plaćanja“ = Gotovina 179,00 € + Platna kartica 168,00 €; poništena dnevna karta se nigdje ne broji. „Troškovi po kategoriji“ bez troškova → „Nema podataka za izabrani period.“, isto i za oba raščlanjenja u „Prošlom mjesecu“. „Ističe u narednih 7 dana“ prikazuje člana čija članarina ističe za 3 dana (sa datumom), „Članovi sa neplaćenim dolascima“ člana sa neplaćenim dolaskom; oba imena vode na profil člana. Raniji dokaz (22.09.): E2E finance.spec.ts + DB 0012: zbirni prihodi/troškovi, podjele i grafikon za 12 mjeseci. Svi periodi i svaki detalj iz plana nisu provjereni.

### [FIN-04] Grafikon prihoda i troškova po mjesecima
- **Prioritet:** Srednje
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** pređite mišem preko stupaca; smanjite prozor na 375 px i pogledajte ponovo.
- **Test podaci:** —
- **Očekivani rezultat:** uz grafikon stoji „Pređite mišem preko mjeseca za iznose.“ i iznosi se
  pojavljuju. Na uskom ekranu grafikon ostaje čitljiv i ne izlazi iz ekrana (bez vodoravnog
  pomjeranja cijele stranice).
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **24.09.2026 — PROŠLO (nakon popravke N-24).** `test-plan-medium-b.spec.ts`: uz grafikon stoji „Pređite mišem preko mjeseca za iznose.“; prelaz preko tekućeg mjeseca prikazuje „sep 26 — Prihod: 170,00 €, Troškovi: 7,20 €“, isto kao kartice, a kad miš ode, vraća se uputstvo. Prvi pokušaj PALO na 375 px: cijela stranica `/finance` bila je široka 660 px i pomjerala se u stranu. Sada se na 375 px stranica ne pomjera, a grafikon (640 px) se pomjera unutar svog okvira od 343 px. Dodir na mjesec (emulirani telefon) prikazuje iste iznose. Snimci pregledani. Raniji dokaz (22.09.): E2E finance.spec.ts + DB 0012: zbirni prihodi/troškovi, podjele i grafikon za 12 mjeseci. Svi periodi i svaki detalj iz plana nisu provjereni.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-rest.spec.ts`: Kirija, „Zakup septembar“, 500, danas, Gotovina, PDV Da, „Agencija“, „123/26“ → „Trošak je sačuvan.“; red ima kategoriju, dobavljača, račun, način, „Iz kase: Ne“, 500,00 € i ime vlasnika; u bazi PDV `true`. „Ukupno“ na S-17 i kartica „Troškovi“ na S-16 pokazuju 504,00 € (sa troškom pulta od 4 €). Raniji dokaz (22.09.): E2E finance.spec.ts i DB 0012: vlasnik unosi trošak za raniji datum. Sve opcione kombinacije forme nisu provjerene.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO (nakon popravke N-11).** `test-plan-forms.spec.ts`: `0`, `0,001`, `100000,01` → „Unesite iznos između 0,01 i 100.000,00 €.“; `0,01` i `100000` sačuvani; opis od 1 i 201 znaka → „Unesite opis (2–200 znakova).“; sutrašnji datum → „Unesite datum koji nije u budućnosti.“; datum od prije 35 dana sačuvan. Dobavljač od 101 i račun od 51 znaka su bili odbijeni **bez ikakve poruke** (N-11); sada „Dobavljač može imati najviše 100 znakova.“ / „Račun može imati najviše 50 znakova.“, a 100/50 znakova prolazi. Raniji dokaz (22.09.): Unit schema-bounds i DB 0012 provjeravaju dio validacije. Budući datum i svi rubni iznosi nisu ponovljeni kroz UI.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-f.spec.ts`: uz kvačicu „Iz kase“ stoji „Datum se postavlja na danas, način na gotovinu, i traži otvorenu smjenu.“; polje datuma postaje nepromjenjivo sa današnjim datumom, a „Način“ nepromjenjiv na „Gotovina“. Sa otvorenom smjenom recepcionerke trošak od 20 se čuva (`cash`, `paid_from_till`, današnji datum, vezan za smjenu) i očekivana gotovina otvorene smjene pada sa 179,00 na 159,00 €. Kada smjena više nije otvorena: „Nema otvorene smjene. Recepcioner mora biti prijavljen.“; bez kvačice se isti trošak čuva kao običan (nije iz kase, bez smjene). Raniji dokaz (22.09.): Unit schema-bounds: on/true/false/null i niska false; DB 0012 finansijski obračun. Checkbox i sve kombinacije plaćanja nisu ponovljeni kroz UI.

### [FIN-08] Trener se bira samo uz kategoriju „Plate“
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** u formi izaberite kategoriju `Plate` pa pogledajte da li se pojavilo polje „Trener“;
  zatim promijenite kategoriju na `Kirija`.
- **Test podaci:** —
- **Očekivani rezultat:** polje „Trener“ se pojavljuje samo za `Plate`. Trošak sa trenerom u
  nesalarijskoj kategoriji mora biti odbijen („Provjerite unesene podatke.“).
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-f.spec.ts`: polje „Trener“ se pojavljuje uz kategoriju sa oznakom plate i nestaje uz „Kirija“. Krivotvorena forma koja ipak šalje trenera uz „Kirija“ → „Provjerite unesene podatke.“ i trošak nije sačuvan. Raniji dokaz (22.09.): DB 0012 provjerava vlasnikov trošak/isplatu treneru; prikaz/skrivanje trenera po kategoriji nije zasebno izvršen.

### [FIN-09] Filteri na ekranu troškova
- **Prioritet:** Srednje
- **Uloga / preduslovi:** više troškova različitih kategorija i načina
- **Koraci:** filtrirajte po kategoriji, načinu plaćanja i korisniku koji je unio; kombinujte sa
  periodom.
- **Test podaci:** —
- **Očekivani rezultat:** lista se sužava, ukupan iznos se mijenja, izbor ostaje u adresi.
  Prazan rezultat: „Nema troškova u izabranom periodu.“
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-extra.spec.ts`: tri troška i jedan poništen; kategorija → 2 reda, + „Van kase“ → 1, + „Platna kartica“ → „Nema troškova u izabranom periodu.“; „Unio/la“ = menadžer → 1 red; izbor ostaje u adresi (`categoryId`, `method`, `createdBy`) i preživljava promjenu perioda. Zbir „Ukupno“ (dodat po odluci **D-63**) prati svaki filter: 60,00 → 40,00 → 30,00 → 0,00 → 30,00 €; poništeni trošak se prikazuje, ali se ne sabira, uz napomenu „Poništeni troškovi nisu uračunati.“

### [FIN-10] Poništavanje troška vlasnika
- **Prioritet:** Visoko
- **Uloga / preduslovi:** trošak iz FIN-05
- **Koraci:** [Poništi] → razlog kraći od 3 znaka, pa ispravan razlog.
- **Test podaci:** `ab`, pa `Duplirana faktura`
- **Očekivani rezultat:** prvo „Unesite razlog (3–200 znakova).“, zatim „Poništeno“ — stavka ostaje
  precrtana i izlazi iz ukupnih troškova.
- **Gdje provjeriti:** UI; `/finance` kartica „Troškovi“
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO (nakon popravke N-19).** `test-plan-high-f.spec.ts`: [Poništi] sa `ab` → „Unesite razlog (3–200 znakova).“; sa `Duplirana faktura` dijalog se zatvara, red ostaje uz „Poništeno: Duplirana faktura“, bez dugmeta [Poništi]; „Ukupno“ pada sa 20,00 na 0,00 € uz „Poništeni troškovi nisu uračunati.“, kartica „Troškovi“ na `/finance` 0,00 €, a očekivana gotovina smjene se vraća na 179,00 €. Prvi pokušaj: red je bio samo prigušen (`opacity-60`), a ne precrtan kako traži BR-095 — **N-19**; popravljeno i na troškovima i na ulazima robe (S-20). Raniji dokaz (22.09.): DB 0008 i 0012 pokrivaju prava troškova i obračun; kompletan vlasnikov UI tok poništavanja nije izvršen.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO (uz popravku N-20).** `test-plan-high-f.spec.ts`: sve kolone iz plana su tu. Tamara (Grupni 69 uz 70 % + G+T 99 uz 40 € teretani i 100 %): Klijenti 2, Prihod 168,00, Za trenera 107,30, Za teretanu 60,70, Razlika 107,30 €. Julija (personalna, naknada nije definisana): ispod imena „nije definisano: 1“, u detalju „nije definisano“. Detalj trenera („Uplate trenera — …“) navodi člana i plan. [Evidentiraj isplatu] otvara formu troška sa kategorijom plata, izabranim trenerom, opisom „Evidentiraj isplatu“ i iznosom razlike — iznos je bio upisan kao `107.30` (tačka), sada `107,30` (**N-20**). Mjesec bez prometa → „Nema uplata za izabrani mjesec.“ u detalju. Raniji dokaz (22.09.): E2E finance.spec.ts + DB 0012: E9–E12 obračun po treneru i nepoznata naknada. Sve isplate/filteri nisu provjereni kroz UI.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-f.spec.ts`: otvorena smjena je posebno prikazana na vrhu („Otvorena smjena“, ime, početak, „Očekivano“). [Zaključi smjenu] (polje „Prebrojana gotovina (€)“ uz „Ostavite prazno ako niste brojali.“) → „Smjena je zaključena.“, a vlasnik ostaje prijavljen. Kolone: Recepcioner, Početak, Kraj, Način zaključenja („Zaključio/la E2E Vlasnik F“), Gotovina, Kartica, Očekivano, Prebrojano („nije prebrojano“), Razlika, Email („neuspješno 1×“, jer test server ima neispravan Resend ključ). [PDF] vraća `application/pdf`; [Pošalji ponovo] → „Slanje nije uspjelo. Pokušajte ponovo.“ „Prošli mjesec“ → „Nema smjena u izabranom periodu.“ Raniji dokaz (22.09.): E2E screens.spec.ts: ekran, kontrole i bez overflowa; DB 0010/0009/0001/0012 pokrivaju obračun i audit. Svi filteri/akcije/detalji nisu izvršeni.

### [FIN-13] Ekran „Magacin“ za vlasnika (S-20)
- **Prioritet:** Srednje
- **Uloga / preduslovi:** Vlasnik; ima nabavki i prodaja
- **Koraci:** `/finance/storage` → provjerite „Vrijednost zalihe“, „Prodato kom“,
  „Nabavna vrijednost prodatog“, „Dnevna prodaja“, „Ulazi robe“.
- **Test podaci:** —
- **Očekivani rezultat:** zarada na magacinu se poklapa sa karticom „Zarada na magacinu“ na
  pregledu. Prazan period: „Nema prometa u izabranom periodu.“
- **Gdje provjeriti:** UI; ručna kontrola
- [x] Prošlo  [ ] Palo  Napomena: **24.09.2026 — PROŠLO.** `test-plan-medium-b.spec.ts`: `/finance/storage` za mjesec ima sekcije „Magacin“, „Dnevna prodaja“ i „Ulazi robe“ i kolone „Vrijednost zalihe“, „Prodato kom“ i „Nabavna vrijednost prodatog“. Izotonik: stanje 11, vrijednost 6,60 €, prodato 1, prihod 2,00 €, nabavna 0,60 €, profit 1,40 €. Zbir profita jednak je kartici „Zarada na magacinu“ na pregledu (1,40 €). Januar 2020: „Nema prometa u izabranom periodu.“ i za dnevnu prodaju i za ulaze robe. Raniji dokaz (22.09.): E2E screens.spec.ts: ekran, kontrole i bez overflowa; DB 0010/0009/0001/0012 pokrivaju obračun i audit. Svi filteri/akcije/detalji nisu izvršeni.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO (uz popravku N-18; nalaz N-21 otvoren).** `test-plan-high-f.spec.ts`: dnevnik za danas ima „Unos“, „Izmjena“ (datum rođenja člana `01.01.1990 → 15.03.1995`) i „Poništeno“ (trošak), sa vremenom, korisnikom i stavkom; filter „Korisnik“ ostavlja samo njegove zapise, filter „Stavka“ = Troškovi samo troškove, oba ostaju u adresi. 205 zapisa u jednom danu → prikazano 200 uz „Prikazano je prvih 200 izmjena. Suzite period da vidite ostale.“; „Prošli mjesec“ → „Nema izmjena u izabranom periodu.“ **N-18:** granice perioda su bile fiksno `+02:00`, pa je zimi (CET) dan 15.01. prikazivao zapis od 14.01. u 23:30, a gubio onaj od 15.01. u 23:30; sada se uzima pomak zone za svaki datum. **N-21 (otvoreno):** prikaz izmjene koristi nazive kolona iz baze i sirove vrijednosti (`date_of_birth`, `gym_id: <uuid>`, `method: cash`, `created_by: <uuid>`), a vrsta stavke „Uplate“ piše kao „Uplate danas“ — vidi §9.9. Raniji dokaz (22.09.): E2E screens.spec.ts: ekran, kontrole i bez overflowa; DB 0010/0009/0001/0012 pokrivaju obračun i audit. Svi filteri/akcije/detalji nisu izvršeni.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-f.spec.ts`: traka „Naknadni unos – ne ulazi u smjenu.“ je na vrhu. Juče 18:00–19:30, Teretana → „Naknadni unos je sačuvan.“; dolazak je `is_backdated`, bez smjene, i vidi se u profilu → „Dolasci“. Izlazak 17:00 → „Vrijeme izlaska mora biti poslije vremena ulaska.“ Sutrašnji datum → „Unesite datum koji nije u budućnosti.“ (SUSPECT-08: stiže konkretna poruka, ne opšta). Raniji dokaz (22.09.): DB 0012: naknadni unos ulazi u finansije, ne u smjenu; E2E screens otvara ekran. Cijeli tok četiri forme i negativni datumi nisu izvršeni kroz UI.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-f.spec.ts`: uz početak članarine stoji „Ostavite prazno da se izračuna po pravilima (BR-052).“; Mjesečna plaćena 15.08. bez početka → sačuvano, početak 15.08. (razlog „Počinje danas“, BR-052 korak 3 u odnosu na izabrani datum), kraj 15.09. Dnevne karte `0` i `21` → „Unesite broj između 1 i 20.“, `2` (juče) → 20,00 €. Zamjenska kartica gotovinom, juče → 5,00 €. Sve tri uplate su `is_backdated` i bez smjene, nema ih na `/payments/today`; članarina se vidi u finansijama na svoj datum (Prihod 79,00 € za 15.08.), a u profilu člana su uplate i članarina označene „Naknadno“. Raniji dokaz (22.09.): DB 0012: naknadni unos ulazi u finansije, ne u smjenu; E2E screens otvara ekran. Cijeli tok četiri forme i negativni datumi nisu izvršeni kroz UI.

### [FIN-17] Naknadni unos bez izabranog člana
- **Prioritet:** Srednje
- **Uloga / preduslovi:** Vlasnik
- **Koraci:** na kartici „Dolazak“ sačuvajte bez biranja člana.
- **Test podaci:** —
- **Očekivani rezultat:** „Izaberite člana.“
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-extra.spec.ts`: kartica „Dolazak“, vremena 10:00–11:00, bez člana → „Izaberite člana.“; ništa nije upisano u bazu.

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
- [x] Prošlo  [ ] Palo  Napomena: **24.09.2026 — PROŠLO (nakon popravki N-24 i N-25).** `test-plan-medium-b.spec.ts`: teretana sa 233 člana i 301 dolaskom u septembru, provjereno kao vlasnik i kao menadžer. „Ukupno dolazaka“ 301 i „Bez automatskih odjava (288 mjerenih dolazaka).“; 30 stupaca po danima (i prazni dani do 30.09) i 18 po satima (06–23); prelaz preko 01.09 prikazuje „01.09.2026 — 14 dolazaka“, isto kao baza; po vrsti 251, 30 i 20; „Najčešći članovi“ ima tačno 10 redova, a klik vodi na profil. Prvi pokušaj PALO: trake „Dolasci po vrsti“ bile su sve iste širine (CSP odbacuje `style`, N-25), a na 375 px stranica se pomjerala 201 px (N-24). Sada su trake 799, 96 i 64 px (srazmjerno), bez CSP grešaka i bez pomjeranja. Snimci pregledani. Raniji dokaz (22.09.): DB 0013 potvrđuje zbir, kompletne dane/sate i trajanje; E2E screens provjerava ekran. Grafikoni sa većim podacima nisu vizuelno provjereni.

### [STAT-02] Prazan period
- **Prioritet:** Srednje
- **Uloga / preduslovi:** period bez dolazaka (npr. prošla godina)
- **Koraci:** izaberite „Proizvoljno“ za period u kojem nema dolazaka.
- **Test podaci:** `01.01.2025` – `31.01.2025`
- **Očekivani rezultat:** „Nema dolazaka u izabranom periodu.“
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** E2E screens.spec.ts: prazan testni period prikazuje tačnu poruku na oba viewporta.

### [STAT-03] Vrlo dug period (granica 400 dana)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik (vidi SUSPECT-01)
- **Koraci:** ručno u adresi: `/stats/visits?period=custom&from=2024-01-01&to=2026-09-21`.
- **Test podaci:** period duži od 400 dana
- **Očekivani rezultat:** **jasna poruka o grešci.** Ako ekran umjesto toga prikaže
  „Nema dolazaka u izabranom periodu.“ iako dolazaka ima, to je pogrešno i treba zabilježiti kao bug.
- **Gdje provjeriti:** UI; serverska konzola (`npm run dev`)
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** Dodatni UI: custom period 2020-01-01–2026-09-22 daje Provjerite unesene podatke., a ne lažno Nema dolazaka.

### [STAT-04] Automatska odjava se broji kao dolazak, ali ne u prosjek (BR-082)
- **Prioritet:** Srednje
- **Uloga / preduslovi:** pokrenut noćni posao koji je nekog automatski odjavio (JOB-01)
- **Koraci:** uporedite „Ukupno dolazaka“ i broj u napomeni ispod prosječnog trajanja.
- **Test podaci:** —
- **Očekivani rezultat:** ukupno uključuje automatski odjavljen dolazak; broj „mjerenih dolazaka“
  je za toliko manji.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **24.09.2026 — PROŠLO.** `test-plan-medium-b.spec.ts`: od 301 dolaska 12 je automatski odjavljeno; „Ukupno dolazaka“ je 301, a „mjerenih“ 288 — razlika je tačno broj automatskih odjava (otvorenih dolazaka nema). Isto vidi menadžer. Raniji dokaz (22.09.): DB 0013: automatski odjavljeni dolazak ne ulazi u prosjek, anonimizovan član ne ulazi u top listu. Nije ponovljeno kroz UI sa tim podacima.

### [STAT-05] Anonimizovan član ne ulazi u listu najčešćih (BR-046)
- **Prioritet:** Visoko
- **Uloga / preduslovi:** anonimizovan član sa mnogo dolazaka (MEM-15)
- **Koraci:** otvorite `/stats/visits` za period u kojem je taj član dolazio.
- **Test podaci:** —
- **Očekivani rezultat:** njegovi dolasci se broje u ukupnom broju, ali ga **nema** u listi
  „Najčešći članovi“.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-g.spec.ts`: član sa 6 dolazaka anonimiziran kroz UI („Član je anonimiziran.“); `/stats/visits` za posljednjih 10 dana pokazuje „Ukupno dolazaka“ 10 — tačno koliko teretana ima dolazaka, uključujući njegovih 6 — a „Najčešći članovi“ su samo #6 (2), #4 (1) i #7 (1), bez njega iako ima najviše dolazaka. Raniji dokaz (22.09.): DB 0013: automatski odjavljeni dolazak ne ulazi u prosjek, anonimizovan član ne ulazi u top listu. Nije ponovljeno kroz UI sa tim podacima.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO uz napomenu.** `test-plan-security.spec.ts`: noćni posao pozvan **samo za testnu teretanu** (`job_nightly(p_gym)`, service role) — `npm run jobs:run` bi zatvorio i smjenu radne teretane. Vrijeme zaključivanja postavljeno 30 min unazad; prvi poziv vraća `ran: true`, 1 odjavljen dolazak i id smjene; dolazak je `auto_checkout`, smjena `auto`, bez prebrojane gotovine i bez zaključioca; S-19 pokazuje „Automatski“. Drugi poziv vraća `ran: false`, nema drugog zaključenja. Izvještaj i email automatski zaključene smjene pravi HTTP posao za sve teretane, pa ovdje nije pozvan; pokriva ga pgTAP 0011 i ručni prolaz od 22.09. (§9.3). Raniji dokaz (22.09.): DB 0011 u rollback transakciji: automatska odjava, zaključenje i idempotentnost. Globalni jobs:run nije pokrenut nad radnim projektom; slanje izvještaja odvojeno potvrđeno.

### [JOB-02] Recepcioner posle automatskog zaključenja
- **Prioritet:** Kritično
- **Uloga / preduslovi:** nastavak JOB-01, recepcioner je još prijavljen u browseru
- **Koraci:** u browseru recepcionera kliknite bilo koju stavku menija.
- **Test podaci:** —
- **Očekivani rezultat:** odjavljen je i na `/login` piše „Smjena je automatski zaključena.“
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** E2E jobs.spec.ts: nakon automatskog zatvaranja testne smjene recepcioner ide na /login i vidi očekivanu poruku.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO (izolovano).** `test-plan-jobs.spec.ts` + `tests/integration/test-plan-job.test.ts`: pravi jutarnji posao (`runJob("morning")`) nad **samo jednom** testnom teretanom — `jobs_due` vraća tu teretanu, sve ostalo (Postgres, Resend) je stvarno. Članarina koja ističe za 3 dana, email člana je Resendov testni sandučić `delivered@resend.dev`: poslat 1 email, naslov „Vaša članarina ističe 26.09.2026“, tekst sa imenom člana, nazivom plana i nazivom teretane; Resend javlja `delivered`, red u `expiry_notifications` je `sent`. Drugi poziv: `ran: false`, 0 poslatih. Pošiljalac `noreply@stamenkovicc.com` (N-04). Stvarno ljudsko sanduče nije gledano. Spec je opt-in (`TEST_PLAN_LIVE_EMAIL=1`) jer šalje pravi email. Raniji dokaz (22.09.): Stvarni runMorning sa testnim izborom samo jedne test teretane: 1 poslat, drugi poziv 0; Resend delivered. Raspored jobs_due nije pušten globalno; pokriva ga DB 0011. Lokalni default pošiljalac zahtijeva ispravku N-04.

### [JOB-04] Jutarnji posao bez podešenog emaila
- **Prioritet:** Srednje
- **Uloga / preduslovi:** `EMAIL_FROM` prazno
- **Koraci:** pokrenite `npm run jobs:run -- morning`.
- **Test podaci:** —
- **Očekivani rezultat:** izlaz pokazuje da je slanje preskočeno (`skipped`), bez greške; nijedan
  email ne odlazi.
- **Gdje provjeriti:** izlaz komande
- [x] Prošlo  [ ] Palo  Napomena: **24.09.2026 — PROŠLO.** `test-plan-medium-jobs.spec.ts` (uz `TEST_PLAN_LIVE_EMAIL=1`): pravi jutarnji posao za testnu teretanu, sa praznim `EMAIL_FROM`, vraća `{"ran":true,"sent":0,"failed":0,"skipped":1}` — to je izvještaj koji `npm run jobs:run` ispisuje — bez greške i bez ijednog emaila; podsjetnik je zapisan kao `not_sent`. Globalni `jobs:run morning` namjerno nije pokrenut (§9.9). **Napomena:** tako zapisan podsjetnik se kasnije ne šalje ponovo, pa posao bez pošiljaoca potroši podsjetnike tog dana. Raniji dokaz (22.09.): Unit jobs-morning.test.ts + shift-report.test.ts potvrđuju bez EMAIL_FROM nema slanja i not_sent/skipped. Nije pokrenut globalni jobs:run morning.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO (izolovano, van nedjelje).** Isti izolovani pokretač, posao `weekly-backup`: `status: success`, 28 tabela, 35 redova, ZIP 11 KB sačuvan u `backups/<gym>`; email „Sedmična rezervna kopija – <teretana> – 23.09.2026“ sa prilogom `kpfitness-backup-2026-09-23.zip` i tekstom „Lozinka nije u ovom emailu.“ — lozinka ZIP-a se u tekstu ne pojavljuje; Resend `delivered`. S-27 zatim prikazuje „Posljednja rezervna kopija: … – uspješno“. Uslov „nedjelja poslije 03:00“ je u `jobs_due` i dokazan je u DB 0011; ovdje je zaobiđen namjerno, jer je danas srijeda. Raniji dokaz (22.09.): Integracioni backup: 28 tabela, AES ZIP, loša lozinka odbijena, Storage i zadržavanje 8 kopija; dodatni stvarni test šalje ZIP, Resend delivered. Nedjeljni globalni scheduler nije pokrenut, pravila su DB-testirana.

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
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** Uz izričitu dozvolu obnovljen odvojeni RESTORE_TEST projekat: migracije do 0025, svih 28 tabela/34 reda odgovara manifestu. Posebno izvršena zaštita za isti DATABASE_URL: odbijeno prije izmjena.

### [JOB-07] Ponovno slanje neuspjelih izvještaja
- **Prioritet:** Srednje
- **Uloga / preduslovi:** postoji smjena čiji izvještaj nije poslat (CLOSE-06)
- **Koraci:** ispravite `RESEND_API_KEY`, pa pokrenite `npm run jobs:run -- email-retry`.
- **Test podaci:** —
- **Očekivani rezultat:** izvještaj je poslat, status na `/finance/shifts` postaje „poslato“.
  Posao ne pokušava više od pet puta po smjeni.
- **Gdje provjeriti:** izlaz komande; UI
- [x] Prošlo  [ ] Palo  Napomena: **24.09.2026 — PROŠLO.** `test-plan-medium-jobs.spec.ts`: smjena zaključena na S-14 sa odbijenim ključem → `failed`, 1 pokušaj. Ponovno slanje odmah poslije zaključenja ne dira smjenu (nije prošlo 15 minuta). Sa pomjerenim vremenom posljednjeg pokušaja i i dalje odbijenim ključem, pokušaji 2–5 daju `failed`, a šesti poziv je više ne bira (ostaje 5). Druga smjena sa neuspjelim izvještajem, pa ispravan ključ: poslata je samo ona (`sent`, 2 pokušaja), Resend `delivered` na `delivered@resend.dev`, sa PDF prilogom. Na `/finance/shifts` jedna smjena ima „poslato“, druga „neuspješno“. Red za ponovno slanje ograničen je na testnu teretanu. Raniji dokaz (22.09.): Na testnoj smjeni prvo izazvan failed nevažećim ključem, zatim stvarni runEmailRetry sa izborom samo te smjene: sent, Resend delivered. Interval i limit pet pokušaja pokriva DB 0011; globalni red drugih teretana nije obrađivan.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-security.spec.ts`: `<script>alert(1)</script>` i `<img src=x onerror=alert(1)>` u imenu i prezimenu člana, napomeni ispravke, razlogu poništavanja (pult i S-17), opisu troška (pult i vlasnik), dobavljaču, računu, nazivu plana, proizvoda, kategorije, programa, imenu trenera i zaposlenog. Otvoreno 19 ekrana (pult i vlasnik) i PDF izvještaja: nigdje dijalog, CSP greška ni živi `<img src=x>`/`<script>` element; tekst se prikazuje doslovno na ekranima gdje pripada i u PDF-u (koji duge ćelije prelama u više redova). Raniji dokaz (22.09.): HTML/script i SQL tekst testirani u prijavi bez izvršavanja. Sva ostala tekstualna polja i PDF prikaz ovih payload-a nisu izvršeni.

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
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO poslije popravke.** Nalaz N-02 je potvrđen u bazi: `member_search` je spajao unos u `LIKE` bez escape-a, pa su `%` i `_` radili kao džokeri. Migracija `0026_member_search_like_escape.sql` escape-uje `%`, `_` i samu obrnutu kosu crtu. Četiri nove pgTAP tvrdnje u `supabase/tests/0006_members.test.sql` padaju na staroj funkciji, prolaze na novoj. Apostrof, navodnik, `;` i `' OR 1=1 --` ni prije ni sada ne vraćaju člana.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-rest.spec.ts`: kao recepcioner, menadžer i vlasnik otvoreno 13 ekrana; pregledano ~16 MB HTML/JS/RSC/JSON odgovora. Nijedna **vrijednost** `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `CRON_SECRET`, `BACKUP_ZIP_PASSWORD` ni njihovi nazivi, ni `service_role`, nisu nađeni (dev bundle). Raniji dokaz (22.09.): Pretraženi svi produkcijski .next/static fajlovi i HTML prijavljene /members stranice: nema vrijednosti niti naziva pet serverskih tajni (service ključ, Resend, cron, backup). Nisu snimljeni svi mrežni odgovori svih uloga.

### [SEC-04] Sigurnosna zaglavlja
- **Prioritet:** Visoko
- **Uloga / preduslovi:** prijavljeni
- **Koraci:** Network tab → izaberite dokument stranice → pogledajte Response Headers.
- **Test podaci:** —
- **Očekivani rezultat:** postoje `Content-Security-Policy` (sa `frame-ancestors 'none'`,
  `object-src 'none'`, `script-src` sa nonce-om) i `Cache-Control: private, no-store`.
- **Gdje provjeriti:** Network tab
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** E2E foundation + dodatni HTTP prijavljene /reception: CSP/nonce, frame-ancestors, X-Frame-Options DENY, nosniff i no-store.

### [SEC-05] Stranica se ne smije učitati u okviru (iframe)
- **Prioritet:** Srednje
- **Uloga / preduslovi:** —
- **Koraci:** napravite lokalni HTML fajl sa `<iframe src="http://localhost:3000/login"></iframe>`
  i otvorite ga.
- **Test podaci:** —
- **Očekivani rezultat:** okvir ostaje prazan, u konzoli piše da je učitavanje odbijeno.
- **Gdje provjeriti:** browser, konzola
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** Dodatni Chrome test: iframe sa /login je blokiran, browser konzola potvrđuje frame-ancestors/X-Frame-Options.

### [SEC-06] Podaci se ne zadržavaju u kešu poslije odjave
- **Prioritet:** Visoko
- **Uloga / preduslovi:** prijavljeni pa odjavljeni
- **Koraci:** otvorite `/members`, odjavite se, pa pritisnite dugme **nazad** u browseru.
- **Test podaci:** —
- **Očekivani rezultat:** ne vidi se lista članova iz keša; završavate na `/login`.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** Dodatni UI: /members → Odjava → Nazad završava na /login.

### [SEC-07] Upload pogrešnog tipa i prevelikog fajla
- **Prioritet:** Visoko
- **Uloga / preduslovi:** Vlasnik, `/settings/gym`
- **Koraci:** vidi SET-19; dodatno probajte `.svg` fajl i fajl od 5 MB.
- **Test podaci:** `.svg`, PNG od 5 MB
- **Očekivani rezultat:** oba odbijena porukom „Dozvoljeni su PNG i JPG do 1 MB.“ SVG je posebno
  važno odbiti jer može da nosi skriptu.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO poslije popravke.** Nalaz N-01 je potvrđen: tijelo veće od podrazumijevanog limita Server Actions nije ni stizalo do `uploadLogo`. Browser sada mjeri veličinu prije slanja i prikazuje „Dozvoljeni su PNG i JPG do 1 MB.“ uz onemogućeno dugme, a `next.config.ts` diže limit na 2 MB da legitiman fajl od 1 MB (sa multipart zaglavljima) stigne do provjere. E2E regresija u `tests/e2e/settings.spec.ts` sa PNG-om od 5 MB: poruka je prikazana, opšteg ekrana greške nema, `logo_path` ostaje null.

### [SEC-08] Tuđa sesija i izmjena kolačića
- **Prioritet:** Visoko
- **Uloga / preduslovi:** prijavljeni
- **Koraci:** u Developer Tools → Application → Cookies izmijenite vrijednost Supabase kolačića
  (promijenite nekoliko znakova) i osvježite stranicu.
- **Test podaci:** —
- **Očekivani rezultat:** sesija je odbijena i vraćeni ste na `/login`; nema prikaza podataka sa
  pokvarenim tokenom.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **22.09.2026 — PROŠLO.** Dodatni UI: vrijednosti stvarnih sb-* auth kolačića zamijenjene neispravnim tokenom; /finance vraća /login bez podataka.

### [SEC-09] Pokušaj pristupa finansijskim podacima kroz odgovor stranice
- **Prioritet:** Kritično
- **Uloga / preduslovi:** Recepcioner
- **Koraci:** otvorite profil člana i u Network tabu pregledajte odgovor servera za tu stranicu.
- **Test podaci:** —
- **Očekivani rezultat:** u odgovoru nema podataka o udjelu trenera, naknadi teretani ni o
  uplatama iz ranijih dana. Finansijski podaci ne smiju da „procure“ kroz HTML koji je samo skriven
  u prikazu.
- **Gdje provjeriti:** Network tab (tijelo odgovora)
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-rest.spec.ts`: recepcionerov profil člana (sve tri kartice, HTML i RSC) ne sadrži ni stari iznos uplate 123,45, ni fiksni iznos 17,77, ni udio 63,3, ni naknadu 88,88, ni nazive polja `trainer_share_pct`/`gym_fixed_amount`/`personal_gym_fee`/`membership_finance`. Kontrola: vlasnikov profil prikazuje staru uplatu. Raniji dokaz (22.09.): DB RLS 0002/0003/0006/0009/0012 i E2E zabrane ruta prolaze. Kompletan HTML/RSC sadržaj svih finansijskih ekrana nije posebno pregledan po ulogama.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO uz napomenu.** `test-plan-rest.spec.ts` (+ offline.spec.ts): offline se pojavljuje crvena traka sa tačnim tekstom, [Dnevna karta] je onemogućena; skeniranje ne pravi dolazak — i ne daje nikakvu poruku osim trake (§9.8). Nakon povratka veze traka nestaje za manje od 5 s, dugme radi, a isto skeniranje prijavljuje člana (jedan dolazak u bazi). Raniji dokaz (22.09.): E2E offline.spec.ts: offline banner i onemogućene novčane radnje na oba viewporta. Sve radnje tokom prekida i povratka interneta nisu izvedene.

### [UX-02] Spor odgovor servera
- **Prioritet:** Srednje
- **Uloga / preduslovi:** —
- **Koraci:** Developer Tools → Network → Slow 3G → otvorite `/members` i prodajte članarinu.
- **Test podaci:** —
- **Očekivani rezultat:** vidi se skelet ekrana dok se učitava; dugme za čuvanje pokazuje
  indikator i ne može se kliknuti dvaput; ništa se ne duplira.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO (dev server, emulacija u Chrome-u).** `test-plan-extra.spec.ts` uz CDP „Slow 3G“ (2 s latencija, 500 kbit/s), uključen samo oko koraka koji se provjerava: prelaz na „Članovi“ prikazuje skelet (`aria-busy`); pri prodaji članarine [Naplati i sačuvaj] je odmah onemogućeno i ima indikator, drugi klik ne prolazi, u bazi je tačno jedna članarina. Stvarna spora mreža/uređaj nisu korišćeni.

### [UX-03] Greška na ekranu se prikazuje na našem jeziku
- **Prioritet:** Visoko
- **Uloga / preduslovi:** —
- **Koraci:** izazovite grešku (npr. zaustavite `npm run dev` nakratko usred radnje, ili
  pokvarite `NEXT_PUBLIC_SUPABASE_URL` i osvježite ekran).
- **Test podaci:** —
- **Očekivani rezultat:** „Došlo je do greške. Pokušajte ponovo.“ sa dugmetom [Pokušaj ponovo] i
  šifrom greške — **nikada** engleska Next.js poruka i nikada tekst baze.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO uz napomenu.** `test-plan-high-g.spec.ts`: (1) server ne odgovara na radnju (prekinuta veza usred čuvanja troška) → „Došlo je do greške. Pokušajte ponovo.“ i [Pokušaj ponovo], koji vraća ekran; (2) radnja koju server ne poznaje (nova verzija dok je tab otvoren) → ista poruka; (3) prekinuta prijava na `/login` → ista poruka na ekranu prijave. Nijednom se ne pojavljuje engleski tekst („Application error“, „Server Action“, „Failed to fetch“…) niti tekst baze, i ništa se ne sačuva. **Šifra greške** se prikazuje samo kada greška nastane na serveru (Next daje `digest`); kod ovih mrežnih grešaka šifre nema jer server nije ni zabilježio grešku. Serversku grešku pri iscrtavanju ekrana nije bilo moguće izazvati iz browsera bez kvarenja okruženja. Raniji dokaz (22.09.): Unit errors.test.ts skriva sirove DB greške, dodatni UI auth/statistika daju lokalizovane poruke. Nisu namjerno izazvane sve greške svih ekrana.

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
- [x] Prošlo  [ ] Palo  Napomena: **24.09.2026 — PROŠLO (nakon popravke N-26).** `test-plan-medium-b.spec.ts`: Tab na recepciji ide kroz stvarne kontrole (naziv teretane, meni, Nalog, pretraga, [Dnevna karta], [Trošak], [Novi član], [Odjavi …]), i svaka ima ime i vidljiv okvir fokusa. U dijalogu članarine, 20 × Tab i 5 × Shift+Tab: fokus nijednom ne izlazi iz dijaloga, a Esc ga zatvara. Prvi pokušaj PALO: poslije Esc fokus je padao na `<body>` (Radix vraća fokus samo na `DialogTrigger`). Sada se vraća na dugme koje je otvorilo dijalog ([Nova članarina], [Dnevna karta]), nikad u polje za unos, a skeniranje odmah poslije toga i dalje radi. Meni „Nalog“: Enter ga otvara, strelica pomjera fokus, Esc zatvara i vraća fokus na dugme; meni na 375 px radi isto. **Napomena:** dugme menija prikazuje ime korisnika, a čitač ekrana ga čita kao „Nalog“. Raniji dokaz (22.09.): E2E screens.spec.ts: imenovane kontrole na 19 ekrana i Tab na recepciji. Nije potvrđena potpuna tastaturna pristupačnost svih dijaloga/fokus zamki.

### [UX-05] Poruke o uspjehu se same povlače
- **Prioritet:** Nisko
- **Uloga / preduslovi:** —
- **Koraci:** sačuvajte bilo šta i pratite zelenu poruku.
- **Test podaci:** —
- **Očekivani rezultat:** poruka se pojavi i nestane sama, ne zaklanja dugmad i ne ostaje zauvijek.
- **Gdje provjeriti:** UI
- [x] Prošlo  [ ] Palo  Napomena: **24.09.2026 — PROŠLO.** `test-plan-medium-b.spec.ts`: „Sačuvano.“ je vidljivo ≈ 6 s i nestaje samo; klik na mjesto poruke stiže do elementa ispod nje, pa poruka ne zaklanja dugmad. Sve potvrde u aplikaciji idu kroz isti toast (6 s). Raniji dokaz (22.09.): Dodatni UI: scan status se povlači nakon 5 s. Sve druge success poruke/toastovi nisu posebno mjereni.

### [UX-06] Mnogo podataka (performanse)
- **Prioritet:** Srednje
- **Uloga / preduslovi:** više od 100 članova i više od 200 dolazaka (može se napraviti naknadnim
  unosom ili tokom stvarnog rada)
- **Koraci:** otvorite `/members`, `/stats/visits` za mjesec i `/finance/audit`.
- **Test podaci:** —
- **Očekivani rezultat:** stranice se učitavaju u razumnom vremenu (do par sekundi), straničenje
  radi, grafikoni ostaju čitljivi, dnevnik izmjena pokazuje poruku o ograničenju od 200 zapisa.
- **Gdje provjeriti:** UI; Network tab (vrijeme odgovora)
- [x] Prošlo  [ ] Palo  Napomena: **24.09.2026 — PROŠLO.** `test-plan-medium-b.spec.ts`: 233 člana, 301 dolazak u mjesecu i preko 200 izmjena danas, produkcijski build protiv hostovane baze. `/members` 0,72 s („Strana 1 od 10“, 25 redova), sljedeća strana 0,84 s, pretraga „Član217“ 0,81 s (nalazi #217 i #218, čiji telefon sadrži 217); `/stats/visits` 0,65 s; `/finance/audit` 0,72 s, sa 200 redova i porukom „Prikazano je prvih 200 izmjena. Suzite period da vidite ostale.“ Grafikoni su čitljivi (snimci). Raniji dokaz (22.09.): perf:scan sa 3.000 članova/150.000 dolazaka, 300 skenova: server p95 34,9 ms; round-trip p95 72,3 ms. Priprema 50,5 s, rollback. UI pretraga/straničenje sa velikim skupom nisu mjereni.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-flows.spec.ts`, jedna povezana istorija: prijava otvara smjenu; prazna kartica → „Ana Anić“ sa Mjesečnom gotovinom i „Prijavi odmah“ → zeleno; postojeći član → zeleno; 2 dnevne karte karticom; voda gotovinom; trošak „Krpe“ 6,00 € iz kase; odjava člana poslije 3 min („– 0h 3min“). S-14: gotovina 80,50 €, kartica 20,00 €, troškovi iz kase 6,00 €, očekivano 74,50 € = (79 + 1,50) − 6; prebrojano 74,50 → „Razlika: 0,00 €“; zaključenje odjavljuje recepcionera. Vlasnik na S-19 vidi red sa 74,50 €, PDF sadrži sve stavke (provjereno čitanjem teksta PDF-a). Email u testnom okruženju je namjerno „neuspješno“ (N-05); stvarno slanje potvrđeno 22.09. (§9.3). Raniji dokaz (22.09.): Postojeći E2E odvojeno izvršavaju registraciju, dolaske, prodaju, troškove, magacin i zaključenje; nisu izvršeni kao jedna ista cjelodnevna smjena iz ovog scenarija.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-flows.spec.ts`: A naplati članarinu i dnevnu kartu (89 € gotovinom) i odjavi se uz „Smjena ostaje otvorena. Odjaviti se?“; B na S-02 unese 89 i preuzme; B naplati dnevnu kartu i zaključi svoju smjenu (10 €). U bazi A: `takeover`, `closed_by` = B, prebrojano 89; B: `manual`. S-19: „Preuzeo/la“ + B sa 89,00 €, i B-ov red sa 10,00 €; PDF A-ove smjene ima „Preuzeo/la E2E Bojana tok“ i članarinu, PDF B-ove samo dnevnu kartu. B ne može da ispravi A-ove stavke. Raniji dokaz (22.09.): shifts.spec.ts potvrđuje predaju između dva recepcionera i izvještaj. Sve uplate/ukupnosti iz cjelovitog scenarija nisu zajedno upoređene.

### [E2E-03] Član koji je prestao da plaća pa produžio članarinu
- **Prioritet:** Kritično · **Uloge:** Recepcioner, Vlasnik
1. Vlasnik naknadnim unosom doda dva dolaska člana `Božo Božović` prije 3 i 2 dana (bez članarine).
2. Recepcioner skenira njegovu karticu danas → očekuje se **crveni** ekran („3. neplaćeni dolazak“).
3. Sa tog ekrana klikne [Produži članarinu] → prodaje `Mjesečna`, gotovina.
4. Provjeri profil člana.
5. Skenira karticu ponovo sljedeći put.
- **Očekivani rezultat:** početak članarine je datum prvog neplaćenog dolaska; sva tri dolaska
  postaju plaćena; značka „Neplaćeni dolasci“ nestaje; sljedeći dolazak je zelen.
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-flows.spec.ts`: vlasnik kroz S-22 unese dolaske prije 3 i 2 dana; današnje skeniranje daje crveni ekran „PAŽNJA: 3. neplaćeni dolazak!“; [Produži članarinu] → „Počinje od prvog neplaćenog dolaska <prije 3 dana>“ → Mjesečna gotovinom. Početak članarine = datum prvog dolaska, sva tri dolaska povezana, značke nema; odjava pa novo skeniranje → zeleno. Raniji dokaz (22.09.): reception.spec.ts potvrđuje dva neplaćena dolaska i produženje koje ih pokriva. Nisu svi koraci proširene priče iz ovog scenarija ponovljeni.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-g.spec.ts`, jedan isti nalog kroz sve korake: vlasnik kreira recepcionera sa privremenom lozinkom; prva prijava vodi na `/change-password` (ni `/reception` ne može da se preskoči), zatim na S-02 jer je smjena Ane otvorena, [Preuzmi smjenu] → `/reception` i otvorena smjena je **njegova**. Naplati dnevnu kartu. Administrator na `/settings/users` [Prikaži] vidi baš lozinku koju je on izabrao. Vlasnik mu postavi novu („Nova lozinka je postavljena.“) → sljedeća prijava opet traži promjenu. Vlasnik ga deaktivira dok je prijavljen u drugom browseru → na sljedeći klik je na `/login`, a njegova smjena ostaje otvorena. Raniji dokaz (22.09.): auth/admin E2E pokrivaju kreiranje, prvu lozinku i deaktivaciju, ali ne kao jedan isti nalog kroz sve korake scenarija.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-g.spec.ts`: „Ovaj mjesec“ prije: prihod 148,00, troškovi 0,00, profit 148,00 €. Unijete Kirija 300 i Struja 45,50, a sa S-18 isplata Tamari (iznos razlike 48,30 unaprijed popunjen; poslije isplate razlika 0,00). Troškovi su porasli, a profit pao za tačno 393,80 €, prihod nepromijenjen. Dnevnik izmjena (Troškovi, danas) ima tačno ta tri unosa sa imenom vlasnika. Naknadna Mjesečna od prije 3 dana podiže prihod perioda za tačno 79,00 €; uplata je `is_backdated`, bez smjene, na datum od prije 3 dana, a u profilu člana označena „Naknadno“. Raniji dokaz (22.09.): finance E2E i DB 0012 pokrivaju izvještaje, troškove/trenere i naknadne unose. Nije izvršen cijeli mjesečni tok sa svim promjenama u UI-ju.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO.** `test-plan-high-g.spec.ts`: recepcionerka nađe člana pretragom („Gubitnik“), otvori profil, [Izgubljena kartica] → „Naknada za novu karticu: 5,00 €“, Gotovina, skenira novu praznu karticu → „Nova kartica dodijeljena. Stara kartica je poništena.“ Na recepciji stara kartica → „Kartica je poništena. Pronađite člana pretragom.“, nova → zeleni ekran sa članom. `/payments/today` ima „Zamjenska kartica – #4 E2E Kartica Gubitnik“; zaključenje smjene: gotovina 84,00 € (79 + 5), „Uplate: 3“, a u [Pregledaj stavke] „Zamjenska kartica · #4 E2E Kartica Gubitnik · Gotovina 5,00 €“. Raniji dokaz (22.09.): members E2E + DB 0006/0007 provjeravaju zamjenu, naplatu i poništenu karticu; cjelovit UI tok sa oba naknadna skeniranja nije ponovljen.

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
- [x] Prošlo  [ ] Palo  Napomena: **23.09.2026 — PROŠLO (izolovano).** `test-plan-jobs.spec.ts`: recepcionerka prijavi dva člana karticom i ode bez zaključenja; vrijeme automatskog zaključenja testne teretane pomjereno na tekući minut, pa pravi noćni posao samo za nju: `visits_closed: 2`, oba dolaska `auto_checkout` sa odjavom tačno u to vrijeme (vidi se u profilima), smjena zaključena kao `auto`, bez prebrojane gotovine i bez zaključioca; na `/finance/shifts` „Automatski“, „nije prebrojano“, „poslato“; izvještaj (PDF) poslat na `delivered@resend.dev` i isporučen. Jutarnji posao: jedan podsjetnik, drugi poziv ne šalje ništa (JOB-03). Rezervna kopija uspješna i vidljiva na S-27 (JOB-05). Globalni `npm run jobs:run` nije pokretan. Raniji dokaz (22.09.): DB 0011, E2E jobs i stvarni ciljano izolovani email testovi prolaze. Globalni noćni/jutarnji posao nije pokretan nad drugim teretanama.

### [E2E-08] Promjena cjenovnika
- **Prioritet:** Srednje · **Uloge:** Vlasnik, Recepcioner
1. Vlasnik na `/settings/plans` podigne cijenu `Mjesečna` sa 79 na 89 €.
2. Doda novi proizvod `Izotonik` (nabavna 0,60, prodajna 2,00) i unese 12 komada u magacin.
3. Recepcioner proda mjesečnu članarinu i jedan izotonik.
4. Vlasnik pogleda staru uplatu od 79 € i novu od 89 €, i `/finance/storage`.
- **Očekivani rezultat:** stare uplate ostaju na staroj cijeni; nova je 89 €; zarada na magacinu
  za izotonik je 1,40 € po komadu.
- [x] Prošlo  [ ] Palo  Napomena: **24.09.2026 — PROŠLO.** `test-plan-medium-b.spec.ts`, jedan povezani tok: prodaja Mjesečne po 79 € (CARD-04); vlasnik podiže cijenu na 89 €, dodaje „E2E Izotonik“ (0,60 € / 2,00 €) i unosi 12 komada; recepcioner prodaje Mjesečnu (89 €) i jedan izotonik (2,00 €). Stara uplata na profilu ostaje 79,00 €, nova je 89,00 €; na `/finance/storage` stanje je 11, a profit 1,40 € po komadu. Raniji dokaz (22.09.): settings/storage/finance E2E + DB 0006 provjeravaju cijene, prodaju i snapshot, ali ne kao jedan povezani scenario sa Izotonikom.

---

## 5. Testiranje na uređajima

Aplikacija se razvija za dvije veličine: **desktop 1366×768** (pult) i **mobilni 375 px**.

### 5.1 Desktop (Chrome, Firefox, Edge)

**22.09.2026 — djelimično:** Chrome 1366×768 i 375×812: 152 postojeće E2E provjere dale su `ok`; `screens.spec.ts` proverava 19 aplikacijskih ekrana, uz zasebnu prijavu, bez horizontalnog overflowa, sa imenovanim kontrolama i bez pageerror događaja. Snimci su u `test-results/`. Ovo ne potvrđuje sve redove ispod: Firefox/Edge, štampa, zoom, zvuk i fizički uređaji nisu testirani.

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

**22.09.2026 — djelimično:** izvršen Chrome desktop engine na 375×812, uključujući forme i 19 ekrana. Nije pravi telefon: virtuelna tastatura, dodir, landscape i veličina svih touch meta ostaju neprovjereni; kvadratići tih tvrdnji nisu označeni.

**24.09.2026 — dopuna:** isti engine na 375×812, sada i sa punim mjesecom podataka (233 člana, 301 dolazak): 20 ekrana bez vodoravnog pomjeranja stranice tek nakon popravke **N-24** (`/finance`, `/finance/storage`, `/stats/visits` i `/settings/trainers` su se pomjerali); grafikoni statistike i finansija su čitljivi i pomjeraju se unutar svog okvira (snimci pregledani); dodir na grafikonu finansija prikazuje iznose kao i miš (emulacija dodira, ne pravi telefon). Meni „Otvori meni“ se otvara i zatvara i tastaturom. Kvadratići ostaju neoznačeni dok se ne provjeri na pravom telefonu.

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

1. **Riješeno 24.09.2026 (D-66): emoji se odbija, ćirilica se prihvata.** ~~**Emoji i ćirilica u imenima članova.**~~ Kod ih nigdje izričito ne zabranjuje (ograničenje je
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

## 9. Izvještaj izvršavanja — 22.09.2026

### 9.1 Obim, okruženje i dokazi

Oznaka **PROŠLO** odnosi se na izvršene korake opisane u napomeni. **DJELOMIČNO** znači
da postoji uspješan dokaz za dio slučaja (npr. bazna validacija), ali ne i za cijeli ručni
scenario. **PALO** označava reprodukovano odstupanje. **NIJE IZVRŠENO** nije prolaz.
Zbir ovih oznaka nije jednak broju automatizovanih testova: jedan test često pokriva dijelove
više slučajeva, a jedan ručni slučaj zahtijeva više testova.

- Windows, Node **24.20.0**, instalirani Chrome; aplikacija testirana iz produkcijskog builda.
- Početno radno stablo bilo je čisto. Poslovni kod i `.env.local` nisu mijenjani radi popravki.
- PowerShell blokira `npm.ps1`; komande izvršene preko `npm.cmd`, bez promjene ExecutionPolicy.
- HTTPS testovima je bio potreban `NODE_OPTIONS=--use-system-ca`: Node inače prijavljuje
  `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Nije isključena provjera HTTPS sertifikata.
- Bazni testovi i benchmark koriste rollback; browser/integracioni testovi posebne `E2E`
  teretane i uklanjaju ih. Globalni `jobs:run` nad svim teretanama nije pokretan.
- Dodatni ciljani browser testovi izvršeni su na portu 3101; postojeći E2E na portu 3100,
  sa `E2E_PRODUCTION=1`, desktop 1366×768 i uzak ekran 375×812.
- Sirovi rezultati dodatnih provjera nalaze se lokalno u `test-results/test-plan-extra*.json`,
  email u `test-results/test-plan-email*.json`, a snimci postojećih E2E u `test-results/`.
  To su lokalni, git-ignorisanI artefakti; trajni sažetak je ovaj dokument.
- Greške prvih pomoćnih testova zbog selektora, kodiranja teksta i `localhost` naspram
  `127.0.0.1` ponovljene su sa ispravljenim testovima; nisu klasifikovane kao greške aplikacije.

| Provjera | Rezultat |
|---|---|
| `npm.cmd run lint` | **PROŠLO**, bez upozorenja |
| `npm.cmd run typecheck` | **PROŠLO** |
| `npm.cmd run build` | **PROŠLO**, produkcijski bundle napravljen |
| `npm.cmd run test` uz sistemski CA | **PROŠLO: 122/122**, 15 fajlova; uključuje stvarni Storage backup |
| `npm.cmd run test:db` | **PROŠLO: 428 tvrdnji**, 14 SQL fajlova, sve vraćeno rollbackom |
| `npm.cmd run test:e2e`, production | **152/152 pojedinačnih testova ispisalo `ok`**. Proces nije završio gašenje servera nakon posljednjeg testa i prekinut je nakon čekanja; nema čistog završnog exit 0. Naknadni upit je potvrdio da nema preostalih `E2E` teretana. Ne predstavljati ovo kao uredno završen CI job. |
| `npm.cmd run perf:scan` | **PROŠLO**: 3.000 članova, 150.000 dolazaka, 300 skenova; server p50 **13,5 ms**, p95 **34,9 ms**, max **921,8 ms**; round-trip p95 **72,3 ms**. Prag je p95 ≤ 300 ms, ne maksimum. |
| `npm.cmd run restore:test -- --file test-results/backup/2026-09-20.zip` | **PROŠLO uz dozvolu korisnika**: odvojeni RESTORE_TEST projekat, migracije do 0025, **28 tabela / 34 reda**, bez razlike sa manifestom. Provjeren i guard koji odbija isti izvor/cilj. |
| `npm.cmd run format:check` | **PALO**: Prettier je na početnom stanju prijavio **83 fajla**, uključujući raniji TEST_PLAN.md. Nije primijenjeno masovno formatiranje. |
| Dodatni stvarni email testovi | **4/4 PROŠLO** sa procesnim `EMAIL_FROM=noreply@stamenkovicc.com`; vidi §9.3. |

### 9.2 Novi nalazi

**N-01 — SEC-07: preveliki upload završava opštom greškom.**

Na `/settings/gym` poslati PNG od 5 MB. Browser dobija **HTTP 500**, prikazuje se
„Došlo je do greške. Pokušajte ponovo.“, a nema očekivane poruke
„Dozvoljeni su PNG i JPG do 1 MB.“ ispod polja. Server prijavljuje
`Body exceeded 1 MB limit`, sa internim `statusCode: 413`. U `next.config.ts` nije podešen
veći limit za Server Actions, pa zahtjev ne stiže do validacije u `uploadLogo`.
SVG i tekst preimenovan u PNG uredno se odbijaju. Testni `logo_path` ostaje `null`.
Ovo je reprodukovana greška ponašanja/poruke; nije dokaz da je zlonamjerni fajl prihvaćen.

> **Riješeno 22.09.2026.** Provjera veličine je dodata u browser (`gym-screen.tsx`), a
> `experimental.serverActions.bodySizeLimit` je podignut na 2 MB. Serverska provjera
> `LOGO_MAX_BYTES` ostaje kao druga brana. Regresija: `tests/e2e/settings.spec.ts`.

**N-02 — SEC-02: `%` i `_` u pretrazi ponašaju se kao džokeri.**

U izolovanoj teretani sa članom `Ana Anic`, unos `%`, a zatim `_`, prikazuje tog člana i
na recepciji i na `/members`. Plan izričito traži doslovno tumačenje ovih znakova.
`member_search` u `supabase/migrations/0012_members_memberships.sql` spaja unos u obrazac
`LIKE '%' || i.folded || '%'`, bez escape-a za ova dva znaka. Testovi sa apostrofom,
navodnikom, `;` i `' OR 1=1 --` nisu vratili tog člana u recepcijskoj pretrazi.
Nalaz ne znači da je izvršen proizvoljan SQL ili zaobiđena izolacija teretana.

> **Riješeno 22.09.2026.** Migracija `0026_member_search_like_escape.sql` escape-uje `%`,
> `_` i obrnutu kosu crtu prije `LIKE`. Regresija: četiri tvrdnje u
> `supabase/tests/0006_members.test.sql`, koje su padale prije migracije.

**N-03 — AUTH-16: filter odredišta callbacka propušta obrnutu kosu crtu.**

U `app/auth/callback/route.ts` je prihvaćeno sve što počinje `/`, a ne počinje `//`.
Izvršena je izolovana provjera tog tačnog izraza sa `next = '/\\example.org'`
(jedna obična i jedna obrnuta kosa crta): filter ga prihvata, a `new URL(target, origin)`
daje spoljašnji origin `http://example.org`. To potvrđuje grešku filtera na grani nakon
uspješne razmjene koda. **Nije izvršen kompletan napad sa validnim recovery kodom.**
HTTP provjere sa nevažećim kodom uredno završavaju na lokalnom `/login`, zato AUTH-16
nije označen kao kompletno pao ili prošao. Potrebna je provjera finalnog origin-a,
uz regresioni test za `/\\...`, prije tvrdnje da je open-redirect zaštita potpuna.

> **Riješeno 22.09.2026.** `inAppRedirect` u `features/auth/schemas.ts` razrješava
> odredište i odbija sve čiji origin nije origin aplikacije. Regresija: pet tvrdnji u
> `tests/unit/auth-schemas.test.ts`.

**N-04 — lokalni pošiljalac ograničava stvarno slanje.**

Postojeći `EMAIL_FROM=onboarding@resend.dev` vraća **Resend HTTP 403** za odobrenog testnog
primaoca. Read-only provjera Resend API-ja pokazala je da je `stamenkovicc.com` već
`verified`. Ponovljena četiri testa sa `noreply@stamenkovicc.com` iz README-a prolaze.
Promjena je važila samo za proces testa; `.env.local` i podešavanja naloga nisu promijenjeni.
Prvobitni 403 nije kvar zatvaranja smjene ili ZIP-a: oni ostaju sačuvani, a slanje je `failed`.

**N-05 — zaostali dev server tjera E2E da šalje prave emailove.**

`playwright.config.ts` je imao `reuseExistingServer: !process.env.CI`. Ako na portu 3000
već radi Next dev server koji nije pokrenuo taj config, Playwright ga preuzme — a
`webServer.env` (koji podmeće `RESEND_API_KEY: "re_e2e_invalid_key"`) se na njega **ne**
primjenjuje. Takav server radi sa pravim ključem iz `.env.local` i pošiljaocem
`noreply@stamenkovicc.com`, pa zatvaranje smjene u testu zaista pošalje izvještaj na
adresu iz `gym_settings`, čiji je podrazumijevani sadržaj iz migracije 0001
`mihajlo@stamenkovicc.com`. Reprodukovano: `close-shift.spec.ts:238` je pao sa
`email_status: "sent"` umjesto `"failed"` na oba projekta. Pošto Next odbija da pokrene
drugi dev server za isti projekat, ni prelazak na drugi port ne pomaže dok zaostali
server radi.

> **Riješeno 22.09.2026.** Zaostali server je ugašen, a `reuseExistingServer` je sada
> `false`, pa se tiha zamjena okruženja pretvara u glasan prekid pokretanja. Poslije toga
> `close-shift` i `shifts` prolaze sa `email_status: "failed"`, dakle bez stvarnog slanja.

### 9.3 Stvarni emailovi i oporavak

Korisnik je izričito odobrio slanje na `petarsosic4@gmail.com`. Svi testni primaoci postavljeni
su samo na tu adresu. Podaci su sintetički, bez podataka radne teretane.

Sa verifikovanim pošiljaocem poslato je četiri poruke:

1. Izvještaj testne smjene sa PDF prilogom — `sent`.
2. Podsjetnik „Vaša članarina ističe 25.09.2026“ — `sent`; drugi poziv ne šalje duplikat.
3. Šifrovani ZIP testne teretane — `emailed: true`, svih 28 tabela.
4. Ponovno slanje izvještaja nakon namjerno nevažećeg ključa — `failed` prelazi u `sent`.

Resend API za sve četiri poruke potvrđuje **`delivered`** (22.09.2026, oko 13:37 lokalno).
Nije provjereno u kom Gmail folderu su završile niti su prilozi otvoreni u tom sandučetu.
Izbor dospjelih teretana/reda za retry u ovom dodatnom harnessu ograničen je na testnu teretanu;
stvarne RPC funkcije, slanje, PDF, Storage i ZIP nisu mockovani. Pravila rasporeda i limit
ponovnih pokušaja zasebno su provjereni pgTAP testovima.

Za restore je korisnik posebno odobrio zamjenu stare testne teretane u odvojenom projektu.
Prije pokretanja potvrđeno je da izvorni i ciljni DB/API nisu isti. Prvi pokušaj je blokirao
sandbox pri upisu Supabase CLI telemetry fajla; nakon eskalacije restore je završen.
RESTORE_TEST projekat sada namjerno sadrži obnovljene testne podatke. Radni projekat nije
resetovan. Skripta za restore trenutno koristi `rejectUnauthorized: false` za svoj PG klijent;
to je postojeće ponašanje skripte, ne promjena uvedena ovim testiranjem.

### 9.4 Šta ovaj prolaz ne potvrđuje

Preostali koraci navedeni su uz svaki djelimičan/neizvršen slučaj. Posebno nisu potvrđeni:
stvarni Supabase Auth reset link iz sandučeta, fizički skener/štampa/zvuk, Firefox/Edge/Safari,
pravi mobilni uređaj sa tastaturom i dodirom, sve kombinacije obrazaca i svi cjeloviti tokovi
iz §4 kao jedna povezana istorija podataka. Postojeći automatizovani testovi ne dokazuju te
tvrdnje samo time što su prošli. Otvorena poslovna pitanja iz §7 ostaju odluke vlasnika.

### 9.5 Dopuna — 23.09.2026

Izvršeni su slučajevi koji su 22.09. ostali NIJE IZVRŠENO, kao ciljani Playwright testovi u
`tests/e2e/test-plan-extra.spec.ts` (17 testova, samo desktop 1366×768, dev server na portu
3100, sintetička `E2E` teretana koja se na kraju briše; naknadni upit potvrdio je da nijedna
`E2E` teretana nije ostala). Rezultat: **17/17 prošlo**. AUTH-14 i dalje nije izvršen (treba
stvarni recovery link iz sandučeta).

**N-06 — dnevna karta se ne može izmijeniti u `/settings/plans` (PAY-04, BR-010).**
Plan „Dnevna karta“ nema trajanje (`duration_unit = null`), ali je padajući izbor jedinice u
dijalogu „Uredi plan“ imao podrazumijevanu vrijednost „mjeseci“ (`plan?.duration_unit ?? "month"`).
Svako čuvanje dnevne karte — promjena cijene ili deaktivacija — vraćalo je
„Dnevna karta nema trajanje; svi ostali planovi ga moraju imati.“, a forma se pritom resetovala.
Vlasnik je mogao da prođe samo ako sam primijeti i izabere „—“. Isto je važilo za novi plan
vrste „Dnevna karta“.

> **Riješeno 23.09.2026.** `features/settings/components/plans-screen.tsx`: pri izmjeni se
> prikazuje sačuvana jedinica (prazno za dnevnu kartu), a pri kreiranju je jedinica prazna kad je
> izabrana dnevna karta. Regresija: test „PAY-04 and SET-15“ deaktivira dnevnu kartu kroz UI i
> pada na starom kodu.

**N-07 — nepostojeći datum u proizvoljnom periodu (FIN-02, US-17.1).**
`isDate` u `features/finance/period.ts` provjeravao je samo oblik `gggg-mm-dd` i da `Date` nije
`NaN`; JavaScript pretvara `2026-02-31` u 03.03. umjesto da ga odbije. Zato je
`?period=custom&from=2026-02-31&to=2026-03-01` prihvaćen kao period sa datumom koji ne postoji
i proslijeđen bazi, umjesto povratka na „Ovaj mjesec“. Stranica se nije srušila.

> **Riješeno 23.09.2026.** Datum važi samo ako se nepromijenjen vrati iz `Date`. Regresija:
> `tests/unit/period.test.ts` (7 tvrdnji; tri padaju na starom kodu).

**N-08 — nestabilan regresioni test za N-01 (samo test).**
`settings.spec.ts` „a logo over 1 MB…“ padao je otprilike jednom u tri pokretanja na mobilnom
projektu: fajl je izabran prije hidratacije, pa `onChange` nije postojao. Test sada bira fajl
ponovo dok se poruka ne pojavi (`toPass`); 8/8 ponavljanja prošlo. Aplikacija nije mijenjana.

**Zapažanja bez izmjene koda (prijedlozi za vlasnika, SG):**
- MEM-12: `?tab=dolasci&strana=999` prikazuje praznu tabelu **bez** navigacije stranama; ne
  ruši se, ali bi bilo prirodnije prikazati posljednju stranu.
- FIN-09: S-17 nije imao zbir troškova. **Vlasnik ga je zatražio 23.09.2026 (D-63)**: iznad tabele
  stoji „Ukupno: <iznos>“ za prikazane troškove bez poništenih; bez filtera je jednak kartici
  „Troškovi“ na S-16. Zbir se računa u centima (`sumMoney`, `tests/unit/format.test.ts`).
- SET-15: [Produži] na članarini neaktivnog plana otvara prodaju bez preselekcije i nudi samo
  aktivne planove — ponašanje je u skladu sa F-21 AC2, samo zabilježeno.

| Provjera 23.09.2026 | Rezultat |
|---|---|
| `test-plan-extra.spec.ts`, desktop | **17/17 PROŠLO** |
| `settings`, `finance`, `payments` E2E, oba projekta | 29/30, jedini pad je N-08; nakon popravke testa 8/8 |
| `npm run test` | **PROŠLO: 134/134**, 16 fajlova |
| `npm run lint`, `npm run typecheck` | **PROŠLO** |

### 9.6 Dopuna — kritični djelimični slučajevi, 23.09.2026

Preostali koraci 15 kritičnih slučajeva izvršeni su u `tests/e2e/test-plan-critical.spec.ts`
(8 testova) i `tests/e2e/test-plan-forms.spec.ts` (7 testova), desktop, sintetičke `E2E`
teretane koje se brišu. Svih 15 je PROŠLO; četiri tek nakon popravki ispod.

**N-09 — zaključena smjena nije odjavljivala recepcionera pri kliku u meniju (SHIFT-08, BR-116, BR-119).**
Provjera „recepcioner bez otvorene smjene → odjava“ bila je samo u `app/(app)/layout.tsx`.
Next pri klijentskoj navigaciji ne izvršava ponovo zajednički layout, pa je recepcioner nakon
vlasnikovog (ili noćnog) zaključenja nastavljao da šeta ekranima; novčane radnje je i dalje
odbijala baza (BR-092), ali odjava se dešavala tek na punom osvježavanju.

> **Riješeno.** `proxy.ts` za GET zahtjeve recepcionera (i klijentske navigacije) provjerava
> `open_shift_info`; bez otvorene smjene odjavljuje i vodi na `/login?auto=1`. POST (server
> akcije) i `/change-password` su izuzeti, da akcija dobije svoju poruku BR-092 i da prva prijava
> prođe S-01b prije otvaranja smjene. Cijena: jedan upit više po navigaciji, samo za recepcionera.
> Regresija: SHIFT-08 u `test-plan-critical.spec.ts` (pada na starom kodu).

**N-10 — S-14 bez objašnjenja za onemogućeno dugme (CLOSE-03, BR-114).**
Za prazan ili neispravan iznos [Zaključi smjenu i odjavi me] je bilo samo onemogućeno; poruka
„Unesite prebrojanu gotovinu…“ postojala je u tekstovima, ali se nije mogla pojaviti.

> **Riješeno.** Čim korisnik nešto unese, neispravan iznos (i ponovo ispražnjeno polje) prikazuje
> tu poruku ispod polja i označava polje kao neispravno.

**N-11 — predugačak „Dobavljač“ ili „Račun“ odbijen bez poruke (FIN-06, BR-133).**
Šema je vraćala grešku za ta dva polja, ali forma za njih nije imala mjesto za poruku: trošak se
nije sačuvao i ništa se nije prikazalo.

> **Riješeno.** Nove poruke „Dobavljač može imati najviše 100 znakova.“ i „Račun može imati
> najviše 50 znakova.“ ispod polja.

**N-12 — ponovo otvoren dijalog prikazuje poruke prethodnog pokušaja (SET-02).**
Stanje akcije je živjelo u komponenti koja ostaje montirana i kad je dijalog zatvoren. Nakon
odbijenog unosa i [Otkaži], sljedeće otvaranje je već pokazivalo staru grešku. Pogođeni su bili
dijalozi u Podešavanjima (`ActionDialog`: planovi, proizvodi, treneri, programi, kategorije),
Korisnici (novi, uredi, nova lozinka), Troškovi (novi, poništi), zaključenje smjene na S-19 i
poništavanje nabavke na S-20.

> **Riješeno.** Forma i njeno stanje sada postoje samo dok je dijalog otvoren (isti obrazac koji
> već koriste dijalozi članova i pulta). Regresija: SET-02 provjerava da ponovo otvoren dijalog
> nema staru poruku.

**Zapažanja i pitanja za vlasnika (bez izmjene koda):**
- **Ko je zaključio smjenu — riješeno odlukom D-64 (23.09.2026).** Izvještaj je za vlasnikovo
  zaključenje sa S-19 pisao „Zaključio/la recepcioner“. Sada piše „Zaključio/la <ime>“ iz
  `closed_by`, koji baza već upisuje; šema nije mijenjana. S-19 prikazuje isto ime. Provjera:
  `tests/unit/shift-report.test.ts` i SHIFT-08 u `test-plan-critical.spec.ts`.
- **PERM-13:** krivotvoreni poziv vlasničke akcije od menadžera se odbija i ništa ne upisuje, ali
  kao HTTP 500 sa opštom greškom umjesto „Nemate dozvolu za ovu radnju.“ — bezbjedno, samo poruka.
- **Zabranjene finansijske stranice** prikazuju 404, ali sa HTTP statusom 200 (Next streaming).
- **Pristupačnost:** onemogućeno novčano dugme čitaču ekrana izgovara samo razlog („Nema otvorene
  smjene…“), bez naziva dugmeta.
- **SET-02 / §7 pitanje 2:** `Marija` se prihvata i čuva kao `marija`.

| Provjera 23.09.2026 (poslije N-09 do N-12) | Rezultat |
|---|---|
| Cijeli E2E, oba projekta (prije N-12) | 179 prošlo, 25 preskočeno |
| Cijeli E2E, oba projekta (poslije N-12) | 184 prošlo, 1 pad zbog vremenskog ograničenja u SET-02 pod opterećenjem; nakon produženja čekanja ponovljeni pogođeni fajlovi 41/41 |
| `npm run test` | 138/138 |
| `npm run lint`, `npm run typecheck` | PROŠLO |

### 9.7 Dopuna — kritični slučajevi, treći dio, 23.09.2026

Još 25 kritičnih djelimičnih slučajeva izvršeno je u `test-plan-reception.spec.ts`,
`test-plan-money.spec.ts` i `test-plan-access.spec.ts` (desktop, sintetičke teretane;
AUTH-01 se jedini prijavljuje na pravi seed nalog vlasnika, samo čitanje, i odmah se odjavljuje).
Pored toga, odlukom **D-64** izvještaj smjene sada piše ko je zaključio smjenu (§9.6).

**N-13 — naknada trenera: polje prikazuje „80,00 €“, a čuvanje propada bez poruke (SET-11, BR-020, D-62).**
Polje je popunjavano formatiranim iznosom sa znakom €, koji validacija ne prihvata. Svako
čuvanje u tom redu — i kad se mijenja samo udio za grupne — bilo je odbijeno, a inline forma
je prikazivala samo opšte greške, ne greške polja, pa korisnik nije vidio ništa.

> **Riješeno.** Polje sada sadrži `80,00`, a `InlineForm` (naknada, dodjela programa, časovi)
> prikazuje grešku polja kao obavještenje. Postojeći E2E koji je očekivao „80,00 €“ ažuriran.

**N-14 — plan bez trajanja se mogao sačuvati (SET-14, doc 07 §3).**
Provjera je poredila samo „oba polja trajanja prazna“ sa vrstom plana. Plan „Teretana“ sa
praznim brojem, a jedinicom „mjeseci“, prolazio je i u aplikaciji i u bazi, i sačuvao se bez
trajanja. Read-only upit nad bazom: **nijedan postojeći plan nije pogođen**.

> **Riješeno u aplikaciji.** Dnevna karta mora imati oba polja prazna, svaki drugi plan oba
> popunjena. Regresija: `tests/unit/schema-bounds.test.ts` (pada na starom kodu).
> **Riješeno i u bazi (vlasnik odobrio 23.09.2026).** Migracija
> `0027_plan_duration_pair.sql` dodaje ograničenje `(duration_value is null) = (duration_unit is null)`;
> suvi prolaz je pokazao da je to jedina migracija na čekanju, a postojeći planovi ga ne krše.
> Regresija: dvije nove tvrdnje u `supabase/tests/0003_catalog.test.sql` (svih 14 pgTAP fajlova prolazi).

**N-15 — forma plana odbijala tri polja bez poruke (SET-14).**
„Dolazaka u teretanu“, „Grupnih termina“ i „Redoslijed“ nisu imali mjesto za poruku, a
redoslijed je imao samo Zodovu englesku poruku.

> **Riješeno.** Poruke ispod sva tri polja; redoslijed: „Unesite cijeli broj od 0 do 999.“

**Nedosljednosti plana (bez izmjene koda):**
- REC-11 za `abcdefghij` očekuje „Neispravan kod kartice.“, a REC-16/SUSPECT-09 traže da se
  slova ignorišu — aplikacija radi po REC-16.
- MSHIP-03 očekuje da oznaka „Neplaćeno“ nestane nakon povezivanja; glosar (doc 02) kaže da
  ostaje zauvijek radi istorije. Značka „Neplaćeni dolasci“ (samo nepovezani) nestaje.
- PAY-10: recepcioner i menadžer vide stavke zaključene smjene sa onemogućenim dugmadima i
  razlogom; poruku RPC-a za zaobiđen UI pokriva DB test.

### 9.8 Dopuna — posljednji kritični slučajevi, 23.09.2026

Migracija **0027** (N-14) je odobrena i primijenjena (§9.7). Izvršeno je još 15 kritičnih
slučajeva u `test-plan-rest.spec.ts`, `test-plan-flows.spec.ts` i `test-plan-security.spec.ts`,
uključujući cjelovite tokove E2E-01 do E2E-03 i sadržaj PDF izvještaja (`tests/e2e/pdf-text.ts`
čita tekst iz PDF-a). Svi su PROŠLI, bez novih grešaka u aplikaciji. Od kritičnih je djelimičan
ostao samo **AUTH-13** (traži stvarni link iz sandučeta administratora).

**Zapažanja (bez izmjene koda):**
- AUTH-04: poruka je ista za postojeći i nepostojeći nalog, ali odgovor za postojeći nalog je
  ~0,1 s sporiji (Supabase Auth provjerava lozinku samo kad nalog postoji). Mjereno na dev
  serveru sa 3 pokušaja; nije mjereno na produkciji.
- UX-01: skeniranje bez interneta ne pravi dolazak i ne daje nikakvu poruku osim crvene trake.
- MSHIP-11: kad je trener predložen, prazan izbor se ne može vratiti; „bez trenera“ je moguće
  samo za člana bez ranijeg trenera.
- Poništavanje troška na S-17 potvrđuje se sa „Poništeno“, a na S-12 sa „Stavka je poništena.“
- PDF izvještaja prelama duge riječi sa crticom (npr. „sig-urnost“) — samo izgled.

| Provjera 23.09.2026 (završna) | Rezultat |
|---|---|
| Cijeli E2E, oba projekta | **221 prošlo, 0 palo**, 67 preskočeno (mobilne varijante testova plana koji rade samo na desktopu) |
| `npm run test` | **145/145** |
| `npm run test:db` | **14/14 fajlova** (0003 sa 24 tvrdnje, nakon migracije 0027) |
| `npm run lint`, `npm run typecheck` | PROŠLO |
| Zaostale `E2E` teretane u bazi | 0 |

### 9.9 Dopuna — slučajevi prioriteta Visoko, 23.09.2026

Izvršeni su svi djelimični slučajevi prioriteta **Visoko**, po grupama u
`test-plan-high-a.spec.ts` do `test-plan-high-g.spec.ts` (sesija i recepcija, članovi,
članarine i novac na pultu, magacin i kartice, podešavanja, finansije, završni tokovi) i u
`test-plan-jobs.spec.ts` (zakazani poslovi). Od 90 visokih slučajeva **88 je PROŠLO**, MEM-07 je
**PALO** (N-16), a AUTH-14 i dalje nije izvršen (traži stvarni link iz sandučeta, kao AUTH-13).

**Zakazani poslovi bez diranja prave teretane.** `npm run jobs:run` nije pokretan: jedan server
služi sve teretane, pa bi noćni posao zaključio smjenu teretane koja radi, a jutarnji potrošio
podsjetnike njenih članova. `tests/integration/test-plan-job.test.ts` zato poziva pravi
handler (`runJob`) tako da `jobs_due` vrati **samo** testnu teretanu; sve ostalo — Postgres,
izvještaj smjene, rezervna kopija, Resend — je stvarno. Svi emailovi testne teretane idu na
Resendov testni sandučić `delivered@resend.dev`, a isporuka se čita nazad iz Resend API-ja.
Pokreće ga `test-plan-jobs.spec.ts`, samo uz `TEST_PLAN_LIVE_EMAIL=1`; bez toga se preskače, pa
ostatak testova i dalje ne šalje nijedan pravi email (N-05).

**Nalazi i popravke:**

**N-16 — emoji nestaje u PDF-u (MEM-07) — riješeno 24.09.2026 (§9.11).** Ime `Ana😀` se prihvata i prikazuje na
ekranima i u pretrazi, ali u PDF izvještaju smjene emoji nestaje (ostaje prazno mjesto, bez
kvadratića), jer ugrađeni font nema emoji. Odluka je vlasnikova: odbiti emoji pri unosu imena,
ili ga u PDF-u zamijeniti znakom, ili prihvatiti prazno mjesto (§7, pitanje 1).

**N-17 — engleske poruke validacije (SET-18) — popravljeno.** „Podsjetnik prije isteka (dana)“ i
„Zaštita od duplog skeniranja (s)“ van granica vraćali su Zodovu englesku poruku („Too small:
expected number to be >=1“). Sada: „Unesite broj dana od 1 do 14.“ i „Unesite broj sekundi od 0
do 600.“ Isto je ispravljeno za broj termina u naknadnoj članarini i količinu dnevnih karata.
Regresija: `tests/unit/schema-bounds.test.ts`.

**N-18 — dnevnik izmjena zimi pomjeren za sat (FIN-14, BR-001) — popravljeno.** Granice perioda
na S-21 bile su fiksno `+02:00` (ljetno vrijeme). Za dan u zimskom računanju (CET, `+01:00`)
lista je prikazivala izmjene od 23:00 do 24:00 prethodnog dana, a gubila izmjene od 23:00 do
24:00 posljednjeg dana. Sada `periodInstants()` uzima pomak zone Europe/Podgorica za svaki datum
posebno i poredi do ponoći narednog dana. Regresija: unit testovi za oba prelaska sata i E2E
sa izmjenama 14.01. u 23:30, 15.01. u 00:30 i 15.01. u 23:30.

**N-19 — poništen trošak i ulaz robe nisu bili precrtani (FIN-10, BR-095) — popravljeno.** BR-095
traži da poništene stavke ostanu u listi precrtane; na S-17 i S-20 red je bio samo prigušen.
Sada je precrtan, kao na svim ostalim listama, a razlog poništavanja ostaje čitljiv.

**N-20 — isplata treneru upisivala iznos sa tačkom (FIN-11) — popravljeno.** [Evidentiraj
isplatu] je otvarala formu troška sa iznosom `107.30`; sada `107,30`, kao ostatak aplikacije.

**N-21 — dnevnik izmjena prikazuje nazive kolona iz baze (FIN-14, S-21) — riješeno 24.09.2026 (§9.11).** Prikaz
izmjene je „polje: staro → novo“, ali „polje“ je naziv kolone i vrijednost je sirova, npr.
`date_of_birth: 01.01.1990 → 15.03.1995`, `gym_id: <uuid>`, `method: cash`,
`created_by: <uuid>`, `voided_by: <uuid>`; u filteru „Stavka“ uplate se zovu „Uplate danas“
(naslov ekrana S-12). To je protiv pravila da je sav tekst na ekranu crnogorski. Predlog:
nazivi polja iz `me.ts` (Datum rođenja, Način, Unio/la…), imena umjesto identifikatora za
zaposlene, članove, planove i trenere, prevedene vrijednosti (Gotovina, Platna kartica…),
skrivena tehnička polja (`id`, `gym_id`, `user_id`) i „Uplate“ u filteru. Nije popravljeno
bez odobrenja, jer traži izbor naziva za oko stotinu polja.

**Zapažanja (bez izmjene koda):**
- SHIFT (S-02): nakon poruke „Unesite iznos ili ostavite prazno.“ forma briše upisanu vrijednost.
- MEM pretraga: `069` ne nalazi nikoga po telefonu — potrebne su 3 cifre nakon vodeće nule
  (BR-044); rezultati stižu ~0,85 s nakon posljednjeg znaka na dev serveru (250 ms + upit).
- MEM lista: ako se filter promijeni u roku od 250 ms nakon brisanja pretrage, odložena
  pretraga ga poništi; isto tako klik na člana prije nego što pretraga uđe u adresu.
- REC panel: brojač trajanja otkucava od učitavanja stranice, pa trajanje kasni do minut.
- Polja za količinu i vrijeme su `type=number` i `type=time`, pa se slova i `25:00` ne mogu ni
  upisati; forma logoa bez fajla zaustavlja se browserovim oblačićem „obavezno polje“, bez
  poruke aplikacije.
- MSHIP-13: primjer iz plana (31.01.2027 → 27.02.2027) je pogrešan; BR-051 i E14 daju
  28.02.2027, i to aplikacija prikazuje.
- FIN-16: naknadna članarina bez početka počinje na izabrani datum uplate sa razlogom
  „Počinje danas“ — tekst BR-052, koraka 3, iako taj dan nije danas.
- FIN-11: kod trenera sa nedefinisanom naknadom red prikazuje „Za trenera 0,00 €“ uz
  „nije definisano: 1“ ispod imena; detalj trenera piše „nije definisano“.
- E2E-07: profil člana ne označava automatsku odjavu; vidi se samo vrijeme zaključenja.
- UX-03: šifra greške se prikazuje samo za greške nastale na serveru; kod prekida veze šifre
  nema jer server grešku nije ni zabilježio.

| Provjera 23.09.2026 (visoki slučajevi) | Rezultat |
|---|---|
| Cijeli E2E, oba projekta | **262 prošlo**, 2 pala, 8 nije pokrenuto, 124 preskočeno (mobilne varijante i opt-in poslovi). Oba pada su bila u testu, ne u aplikaciji: STO-11 je pod punim opterećenjem čitao zaglavlja tabele prije nego što su stigla, a FIN-10 je tražio poruku u tuđem formatu (aplikacija ima svoj toast, nije sonner). Poslije ispravke `test-plan-high-d` i `test-plan-high-f` ponovo: **17/17** (uključujući 8 nepokrenutih). |
| `test-plan-jobs.spec.ts` uz `TEST_PLAN_LIVE_EMAIL=1` | **3/3**, tri emaila isporučena na `delivered@resend.dev` |
| `npm run test` | **161/161** (+1 preskočen: izolovani pokretač poslova bez svojih varijabli) |
| `npm run test:db` | **14/14 fajlova** |
| `npm run lint`, `npm run typecheck` | PROŠLO |
| Zaostale `E2E` teretane u bazi | 0 |

### 9.10 Dopuna — slučajevi prioriteta Srednje i Nisko, 24.09.2026

Izvršena su sva 22 preostala djelimična slučaja prioriteta **Srednje** i **Nisko**, u
`test-plan-medium-a.spec.ts` (smjena, recepcija, članarine, novac na pultu, magacin,
zaključenje), `test-plan-medium-b.spec.ts` (kategorije, kartice, finansije, statistika,
tastatura, mnogo podataka, promjena cjenovnika) i `test-plan-medium-jobs.spec.ts` (JOB-04 i
JOB-07, samo uz `TEST_PLAN_LIVE_EMAIL=1`). Grupa B radi na teretani sa 233 člana, 301 dolaskom u
mjesecu i preko 200 izmjena u dnevniku, pa su statistika, lista članova i dnevnik provjereni sa
više podataka nego ranije. Svih 22 je PROŠLO, sedam tek nakon popravki ispod. Ostaju MEM-07
(PALO, N-16, odluka vlasnika), AUTH-13 i AUTH-14 (pravi link iz sandučeta).

**Poslovi bez diranja prave teretane.** Pokretač iz §9.9 sada ograničava i red za ponovno
slanje izvještaja (`shifts_pending_email`) na testnu teretanu; bez toga bi JOB-07 ponovo slao
neuspjele izvještaje radne teretane.

**Nalazi i popravke:**

**N-22 — „Nema na stanju.“ se nikad nije prikazivalo (STO-07) — popravljeno.** `MoneyButton`
je svoj opis (razlog iz BR-092, koji je prazan dok je smjena otvorena) upisivao preko opisa koji
mu je dao ekran magacina, pa je [Prodaja] za proizvod sa stanjem 0 bilo sivo, bez ikakvog
objašnjenja. Sada razlog smjene ili veze ima prednost, a inače ostaje razlog ekrana; čitač ekrana
čuje „Prodaja <proizvod> Nema na stanju.“ Regresija: STO-07 u `test-plan-medium-a.spec.ts`.

**N-23 — drugi recepcioner je radio u tuđoj smjeni mimo S-02 (CLOSE-08, BR-111) — popravljeno
u aplikaciji, otvoreno u bazi.** Dok je Anina smjena otvorena, Bojan poslije prijave dobija S-02,
ali kucanjem `/reception` (ili klikom u meniju) dolazio je do pulta i prodao dnevnu kartu — uplata
je upisana u **Aninu** smjenu, pa bi Ana na zaključenju odgovarala za tuđi novac. Sada proxy
(`proxy.ts`) svakog recepcionera kome otvorena smjena ne pripada vraća na `/shift/gate` sa bilo
kog ekrana, dok je ne preuzme ili se ne odjavi; API rute (`/api/…`) zadržavaju svoje odgovore
(PERM-10: PDF kartica recepcioneru i dalje daje 404). Na S-02 se više ne prikazuje meni (ni na
375 px), jer bi svaki link ionako vodio nazad; ostaju značka smjene, „Nalog“ i dugmad [Preuzmi
smjenu] i [Odjavi se]. Baza i dalje prihvata direktan poziv novčanih funkcija iz Bojanove sesije
(provjereno sa `sell_day_passes`), jer `require_open_shift` gleda samo da li je smjena
otvorena, ne i čija je; to može samo neko ko namjerno šalje zahtjeve svojim nalogom mimo
aplikacije. **Odluka vlasnika 24.09.2026:** migracija koja bi to zabranila i u bazi se ne radi.

**N-24 — stranice su se na 375 px pomjerale u stranu (FIN-04, STAT-01, §5.2) — popravljeno.**
`/finance` je bio širok 660 px, `/finance/storage` 526 px, a sa podacima i `/stats/visits`
(+201 px) i `/settings/trainers` (+217 px). Uzrok: grid kolone veličine `auto` rastu do najšire
tabele ili grafikona unutra, iako se oni sami pomjeraju u svom okviru. Kolona je sada
`minmax(0, 1fr)` (`grid-cols-1`) na ekranima finansija, statistike, trenera i podešavanja.
`screens.spec.ts` to ranije nije vidio, jer je mjerio odmah poslije učitavanja, a stranica se
proširi tek poslije hidratacije; sada mjeri kada se stranica smiri. Regresija: taj test na 19
praznih ekrana i novi prolaz kroz 20 ekrana sa podacima u `test-plan-medium-b.spec.ts`.

**N-25 — sve trake „veličine“ bile su pune širine u produkciji (STAT-01) — popravljeno.**
Trake uz „Dolasci po vrsti“, tabele raspodjele na `/finance` i rangirane trake magacina
crtane su sa `style="width: …"`. Produkcijska CSP politika (doc 08 §9) ne dozvoljava inline
stilove, pa ih je browser odbacivao (greška u konzoli), a svaka traka je bila široka koliko i red:
grafikon nije ništa pokazivao. U dev serveru je radilo, zato nije primijećeno. Nova komponenta
`MagnitudeBar` crta traku SVG-om čija širina je atribut, ne stil. Sada su trake srazmjerne
(npr. 799 / 96 / 64 px za 251 / 30 / 20 dolazaka), bez CSP grešaka.

**N-26 — poslije zatvaranja dijaloga fokus je padao na `<body>` (UX-04) — popravljeno.**
Radix vraća fokus samo na `DialogTrigger`, a skoro svi dijalozi ovdje se otvaraju iz stanja.
Korisnik tastature je poslije Esc bio na početku stranice. `DialogContent` sada pamti kontrolu
koja je dijalog otvorila i vraća fokus na nju — nikad u polje za unos, gdje bi uhvatio sljedeće
skeniranje kartice (REC-15). Regresija: UX-04, uključujući skeniranje odmah poslije zatvaranja.

**N-27 — CSP u produkciji blokirao je stil koji Radix ubacuje za dijaloge — popravljeno
(odobrio vlasnik 24.09.2026).** Svako otvaranje dijaloga ili menija u produkcijskom buildu
upisivalo je u konzolu „Applying inline style violates the following Content Security Policy
directive 'style-src …'“: `react-remove-scroll` (dio Radixa) ubacuje `<style>` bez nonce-a, a
politika iz doc 08 §9 ga odbija. Posljedica: greške u konzoli, a stranica iza dijaloga se i dalje
pomjerala (`overflow: visible`). Na dev serveru se ne vidi, jer tamo politika dozvoljava inline
stilove; zato su MEM-18 i SEC-01 u produkcijskom buildu padali i na čistom HEAD-u. Popravka:
`get-nonce` 1.0.1 (paket koji Radix već koristi) sada je direktna zavisnost, a
`components/common/style-nonce.tsx` mu jednom predaje nonce stranice, pročitan iz njenih
skripti. Nonce se namjerno ne prosljeđuje iz layouta: dokument zadržava nonce sa kojim je
učitan, a poslije prijave (klijentska navigacija) layout se renderuje za novi zahtjev sa drugim
nonce-om — takav pokušaj je i dalje davao grešku. Sada: nula CSP grešaka, stranica iza dijaloga
zaključana (`overflow: hidden`); MEM-18 i SEC-01 prolaze u produkcijskom buildu. Regresija:
UX-04 u `test-plan-medium-b.spec.ts`.

**N-28 — `upgrade-insecure-requests` na lokalnom produkcijskom serveru (samo test okruženje).**
Produkcijska politika traži nadogradnju na HTTPS. Kad proxy odgovori preusmjerenjem na RSC
zahtjev, browser ga preko `http://127.0.0.1` pokuša kao `https://` i ne uspije, pa Next radi punu
navigaciju. SHIFT-08 zato u produkcijskom buildu završava na `/login` bez `?auto=1` (kolačići su
već obrisani) — takođe i na čistom HEAD-u. Na pravom HTTPS domenu toga nema, a na dev serveru
SHIFT-08 prolazi. Nije mijenjano; zabilježeno da se rezultati produkcijskih E2E prolaza na
`http://127.0.0.1` čitaju s tim na umu.

**Zapažanja (bez izmjene koda):**
- REC-18: nova kartica istog browsera ponovo prikazuje [Počni rad] (`sessionStorage` važi po
  kartici); zvuk se ionako mora otključati u svakoj kartici.
- PAY-13: poruka „Ova stavka se ne može mijenjati (smjena je zaključena).“ (doc 08) pojavljuje se
  i kada je razlog to što je stavka već poništena. Predlog: „Ova stavka je poništena ili je
  smjena zaključena.“ — traži izmjenu teksta u specifikaciji.
- STO-10: na `/finance/expenses` red troška nabavke nema [Poništi], ali ni objašnjenje zašto.
- CLOSE-02: [Pregledaj stavke] je hronološka lista, a ne po grupama; poništene stavke se samo
  broje, dok ih PDF izvještaj navodi.
- JOB-04: podsjetnik zapisan kao `not_sent` (posao bez `EMAIL_FROM`) kasnije se ne šalje ponovo.
- UX-04: dugme menija pokazuje ime korisnika, a čitač ekrana ga čita kao „Nalog“.
- UX-06: pretraga „Član217“ nalazi i člana #218, jer njegov telefon sadrži „217“ — pretraga po
  telefonu, očekivano.
- `app/global-error.tsx` koristi inline stilove, koje CSP u produkciji odbacuje, pa bi ta
  stranica (samo kad padne cijeli layout) bila bez stila; tekst i dugme i dalje rade.
- Na 1366 px stavke menija „Uplate danas“ i „Statistika dolazaka“ prelaze u dva reda.

| Provjera 24.09.2026 | Rezultat |
|---|---|
| `test-plan-medium-a.spec.ts` | **11/11** |
| `test-plan-medium-b.spec.ts` | **9/9** |
| `test-plan-medium-jobs.spec.ts` uz `TEST_PLAN_LIVE_EMAIL=1` | **2/2**, jedan email isporučen na `delivered@resend.dev` |
| `screens.spec.ts`, 375 px, sa novom provjerom | **20/20** |
| Cijeli E2E, oba projekta, produkcijski build | **270 prošlo**, 5 palo, 17 nije pokrenuto (serijski nastavci palih), 148 preskočeno (mobilne varijante i opt-in poslovi). PERM-10 i SET-10/12/13 pala su zbog N-23 (proxy je i API rutu slao na S-02; test je radio na pultu bez preuzimanja smjene) — ispravljeno, `test-plan-high-a` i `test-plan-high-e` ponovo **13/13**. SHIFT-08, MEM-18 i SEC-01 padaju i na čistom HEAD-u (N-27, N-28). |
| `test-plan-critical`, `test-plan-extra`, `test-plan-security` na dev serveru | **27/27**, uključujući tri gornja i 17 ranije nepokrenutih |
| Cijeli E2E ponovo, produkcijski build, poslije N-27 | **287 prošlo**, 1 palo (SHIFT-08, N-28), 4 nije pokrenuto (serijski nastavci SHIFT-08, na dev serveru prolaze), 148 preskočeno. MEM-18 i SEC-01 sada prolaze i u produkcijskom buildu. |
| `npm run lint`, `npm run typecheck` | PROŠLO |
| `npm run test` | **161/161** (+1 preskočen) |
| `npm run test:db` | **14/14 fajlova** |
| Zaostale `E2E` teretane u bazi | 0 |

### 9.11 Dopuna — odluke vlasnika, 24.09.2026

**N-16 → D-66: emoji u imenu člana se odbija.** Forma za novog člana i izmjenu podataka
odbija emoji u imenu i prezimenu sa porukom ispod polja („Ime ne smije sadržati emoji.“,
„Prezime ne smije sadržati emoji.“). Isto provjerava i baza (`clean_member()`, migracija
`0028_member_name_no_emoji.sql`), pa ni direktan poziv ne može da sačuva takvo ime. Odbijaju se
emoji i piktogrami (blokovi U+1F000–U+1FAFF, U+2300–U+23FF, U+2600–U+27BF, U+2B00–U+2BFF,
zastave, spojnici i selektori); naša slova, ćirilica, apostrof, crtica, cifre i © ostaju
dozvoljeni. Prije migracije read-only upit je potvrdio da u bazi nema člana sa emojijem.
Regresija: unit (`members.test.ts`), pgTAP (`0006_members`, 84 tvrdnje) i MEM-07.

**N-21: dnevnik izmjena govori jezikom ekrana.** Umjesto `date_of_birth: 01.01.1990 →
15.03.1995`, `method: cash` i `gym_id: <uuid>`, S-21 sada prikazuje npr. „Datum rođenja:
01.01.1990 → 15.03.1995“, „Način plaćanja: Gotovina → Platna kartica“, „Plan: Mjesečna“,
„Član: #12 Marko Marković“. Ispod naziva stavke stoji i o kojem zapisu je riječ („Troškovi —
Kirija: septembar“, „Uplate — Dnevna karta × 1“). Tehnička polja (`id`, `gym_id`, `shift_id`,
ko je i kada unio — to već kažu kolone „Korisnik“ i „Vrijeme“) se ne prikazuju; kod poništavanja
ostaje „Razlog poništavanja“. Filter „Stavka“ nudi samo tabele koje se zaista bilježe (i
„Uplate“ umjesto „Uplate danas“). Kod: `features/finance/audit-format.ts`; regresija: unit
`audit-format.test.ts` i FIN-14, koji sada provjerava i da se nazivi kolona i identifikatori
više ne vide.

**OQ-6 → D-65: izvještaj smjene ide i vlasniku.** Svaki izvještaj smjene (zaključenje,
preuzimanje, noćno zatvaranje, ponovno slanje) ide na adrese iz podešavanja i uvijek na email
svakog aktivnog vlasnika, svaka adresa jednom, pa se vlasnik ne može slučajno izbaciti iz
podešavanja. To je jedini finansijski izvještaj koji aplikacija šalje emailom; sedmična rezervna
kopija zadržava svoje primaoce. Regresija: unit `shift-report.test.ts`.

**N-23 → D-67:** vlasnik je odlučio da se provjera vlasništva smjene ne dodaje u bazu; ostaje
zaštita u aplikaciji (S-02 bez menija, preusmjerenje sa svih ekrana).

**Specifikacija:** doc 10 (D-65, D-66, D-67; OQ-6 zatvoren), doc 03 BR-117 i doc 08 §7.

| Provjera 24.09.2026 (2) | Rezultat |
|---|---|
| `npm run test:db` (poslije migracije 0028) | **14/14 fajlova**, `0006_members` 84 tvrdnje |
| Unit: `members`, `audit-format`, `shift-report` | PROŠLO |
| E2E: `test-plan-high-b`, `-high-f`, `-high-g`, `-medium-a`, `-money`, `finance`, `members` | PROŠLO (REC-21 pojačan: pod velikim opterećenjem odvojen Enter je mogao da zakasni za skener-bafer od 1 s) |

*Kraj plana. Novi rezultati upisani su uz slučajeve; neoznačeni kvadratići nisu automatski prolaz.*


