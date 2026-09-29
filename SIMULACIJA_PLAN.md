# Simulacija rada teretane — plan ručnog testiranja

Cilj: proći cijelu aplikaciju onako kako će je teretana koristiti, u svim ulogama, na
**Petrovom Vercelu i Supabase-u**. Kad sve prođe, Petar zamijeni bazu svježom (Dio 3) i
teretana dobija aplikaciju (Dio 4).

## Kako se radi

- Idi redom, blok po blok. Uradi radnju, pa štikliraj `- [ ]` kad se desi ono što piše.
- Ne prolazi → upiši nalaz (vidi „Nalazi“ na kraju) i nastavi. Ako je **blokirajući**, stani i
  popravi (Dio 1, korak 9).
- **Svaku naplatu** upiši u kontrolnu tabelu. Ispravku i poništavanje upiši i tamo.
- **Kucanje kartice:** klik na prazno mjesto na ekranu, 10 cifara, Enter. Ako je kursor u
  polju, kôd ode u polje.
- Petar klikće; Claude Code na Petrovom računaru vodi kroz korake i bilježi nalaze.

## Raspored

| Kad | Šta | Trajanje |
|---|---|---|
| Dan prije | Dio 1 — priprema (Petar) | 1–2 h |
| **Dan 1** | Blokovi A–I | 6–7 h |
| **Dan 2**, od 09:15 | Blokovi J–K | ~1,5 h |
| Prva nedjelja | Blok L — sedmična kopija | 10 min |
| Poslije | Dio 3 — svježa baza, Dio 4 — predaja | |

Zašto dva dana: noćni posao (automatsko zaključenje) i podsjetnik (09:00) rade jednom dnevno
po stvarnom satu u Podgorici i ne mogu se ubrzati. **Najbolje: Dan 1 subota, Dan 2 nedjelja**,
pa i kopija (nedjelja 03:00) stiže u Danu 2.

## Pribor

- **Chrome profili:** Admin, Vlasnik, Menadžer, Recepcioner A, Recepcioner B. Recepcioner C
  koristi gost prozor.
- **Firefox, Edge, Petrov telefon.**
- **Kontrolna tabela** (papir ili Excel), kolone: Vrijeme · Smjena · Stavka · Iznos · Način ·
  Napomena („ispravljeno“, „poništeno“, „naknadno“).
- **Lista podešavanja za produkciju:** sve što vlasnik podesi u bloku A (cijene, treneri,
  raspored, proizvodi, kategorije, podešavanja teretane). Koristi se u Dijelu 4.
- Papir za blok G4 (nestanak interneta).

---

## Dio 1 — Priprema (Petar, dan prije)

**Redoslijed je bitan.** Pravi vlasnik (Matija) se isključuje u koraku 2, prije svega što šalje
mejl. Izvještaj smjene uvijek ide svakom aktivnom vlasniku sa mejlom (D-65).

**1. Kod i baza**
- [ ] Povuci Mihajlov `main` (github.com/mihajloStamenkovic/TeretaneRecepcija, `e14b9df` ili
      noviji), gurni na svoj GitHub → Vercel deployuje.
- [ ] Ovaj fajl stavi u korijen projekta.
- [ ] `npm install` → `npm run db:push -- --dry-run` (host je **Petrova** baza) → `npm run db:push`.

**2. Isključi pravog vlasnika**
- [ ] **Admin** · `/login` (email + lozinka) → `/finance`. Nema admina → `npm run seed:admin`.
- [ ] Admin · `/settings/users` → [Novi korisnik]: Uloga Vlasnik, „Vlasnik Test“, **korisničko
      ime** (bez mejla), privremena lozinka.
- [ ] Matija → [Deaktiviraj]. (Posljednji aktivni vlasnik se ne može deaktivirati, zato prvo novi.)
- [ ] `/settings/gym`: Primaoci izvještaja smjene i Primaoci rezervne kopije =
      `petarsosic4@gmail.com`.
- [ ] Stari članovi u bazi sa tuđim pravim mejlovima → izmijeni ili anonimiziraj (dobijali bi
      podsjetnike).

**3. Popravka N-29** (postupak iz koraka 9)
U „Novi član“ vlasnikov izmijenjeni „Početak“ se ne čuva: `registerMember`
(`features/members/actions.ts`) ga ne šalje, a `register_member` (migracija 0014) ga ne prima.
- [ ] Nova migracija: `register_member` prima vlasnikov početak kao `sell_membership`
      (`p_start_override`, BR-052 korak 4), i akcija ga šalje. Provjera: blok C2.

**4. Testovi** (tek poslije koraka 2, jer E2E upisuje u bazu)
- [ ] `npm run test:db` — prolazi.
- [ ] `npm run test:e2e` — prolazi.

**5. Stanje baze** (samo čitanje)
- [ ] Otvorena smjena? → vlasnik je zaključi na `/finance/shifts`.
- [ ] Zapiši: posljednji broj člana prije simulacije ____, datum Dana 1 ____.

**6. Vercel env (Production)**, pa **redeploy**
- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
      `RESEND_API_KEY`, `EMAIL_FROM=noreply@stamenkovicc.com`, `BACKUP_ZIP_PASSWORD`,
      `CRON_SECRET`, `STAFF_EMAIL_DOMAIN`, `APP_URL=<Petrova Vercel adresa>`.
- [ ] Domen `stamenkovicc.com` je **Verified** u Petrovom Resend nalogu (inače nijedan mejl ne
      ide).
- [ ] `STAFF_EMAIL_DOMAIN` isti kao u `.env.local` (inače postojeći nalozi ne mogu da se prijave).

**7. Supabase Auth**
- [ ] SMTP = Resend; Site URL = Vercel adresa; redirect `<adresa>/auth/callback`.

**8. Cron**
- [ ] U `.env.local` `APP_URL` = Vercel adresa → `npm run jobs:secrets`.
- [ ] Za 5 min `cron.job_run_details` pokazuje `succeeded`.
- [ ] `POST /api/jobs/nightly` bez zaglavlja vraća **401**.

**9. Kako se popravlja tokom simulacije** (sve na Petrovom računaru)
1. Claude Code popravi lokalno; prođu `lint`, `typecheck`, `test`, `test:db`, `test:e2e`.
2. Nova migracija: `db:push -- --dry-run`, pa `db:push`. **Migracija uvijek ide prije koda.**
3. Push na Petrov GitHub → Vercel deployuje.
4. Ponovi korak koji je pao.

Blokirajuće se popravlja isti dan. Dok traje simulacija, Mihajlo ne mijenja kod, da se brojevi
migracija ne sudare.

---

## Dan 1

Smjene tokom dana, redom: **A1** (zaključena, razlika 0) → **A2** (preuzeta) → **B1** (manjak)
→ **A3** (zaključuje vlasnik) → **B2** (ostaje otvorena preko noći).

### A. Vlasnik postavlja teretanu (~1 h) · Chrome „Vlasnik“

**A1 · `/login` → `/change-password`**: prva prijava „Vlasnik Test“.
- [ ] Prije promjene lozinke svaka druga adresa (npr. `/members`) vraća na `/change-password`.
- [ ] Lozinka od 7 znakova i dvije različite lozinke se odbijaju.
- [ ] Ispravna lozinka → [Sačuvaj] → `/finance`.

**A2 · `/settings/gym`**: popuni stvarne vrijednosti: Zamjenska kartica, Minimalna cijena
personalnog, Podsjetnik prije isteka, Automatsko zaključivanje, Zaštita od duplog skeniranja,
Logo.
- [ ] Automatsko zaključivanje = kad teretana zatvara + rezerva (npr. 23:00). **Ne mijenjaj ga
      do kraja Dana 2.**
- [ ] Primaoci su i dalje `petarsosic4@gmail.com`.
- [ ] Sve vrijednosti upisane u listu za produkciju.

**A3 · `/settings/plans`**: uporedi sa stvarnim cjenovnikom i ispravi.
- [ ] Vidi se „Promjena cijene važi samo za nove prodaje.“
- [ ] Dnevna karta nema trajanje.
- [ ] Deaktiviraj „Godišnja“ (vraća se u C2).

**A4 · `/storage`** → [Dodaj proizvod]: Izotonik (nabavna i prodajna cijena). (D-76: ekran Proizvodi je ukinut.)
- [ ] Voda i Izotonik su u tabeli.

**A5 · `/settings/trainers`**
- Treneri: naknada po personalnom klijentu, udio za grupne.
- Programi i matrica „Dodjela“ po stvarnom stanju.
- „Raspored“ → [Dodaj čas]: Grupni trening, Milena, **današnji dan**, vrijeme oko sat vremena
  od sada (za blok D3).
- [ ] Novi čas je u rasporedu.

**A6 · `/finance/expenses`** → [Kategorije troškova]
- [ ] [Dodaj] „Test kategorija“, preimenuj je, pa je deaktiviraj.
- [ ] „Roba za prodaju“ se ne može deaktivirati.

**A7 · `/settings/cards`** → Broj kartica 40 → [Generiši] → PDF.
- [ ] 10 kartica po A4 strani; logo i ime teretane; QR; kôd kao `123 456 7890`, ne počinje nulom.
- [ ] Kodovi zapisani. (Važe samo u ovoj bazi.)

**A8 · `/settings/users`** → [Novi korisnik]: Menadžer, korisničko ime, privremena lozinka.
- [ ] Vlasnik ne može izabrati ulogu Vlasnik ni Administrator.
- [ ] Vlasnik ne vidi kolonu „Lozinka“.

### B. Nalozi i uloge (~20 min)

**B1 · Chrome „Menadžer“**: prva prijava → nova lozinka → `/reception`.
- [ ] Meni: Recepcija, Članovi, Uplate danas, Magacin, Statistika dolazaka, Podešavanja. Nema
      Finansije ni Zaključi smjenu.
- [ ] Zaglavlje: „Nema otvorene smjene“.
- [ ] [Dnevna karta], [Trošak], [Novi član] su onemogućeni sa porukom „Nema otvorene smjene.
      Recepcioner mora biti prijavljen.“

**B2 · Menadžer · `/settings/users`** → [Novi korisnik]: **Recepcioner A** i **Recepcioner B**.
- [ ] Uloga nudi samo Menadžer i Recepcioner.
- [ ] Red vlasnika i admina nema akcija.

**B3 · Menadžer ukuca adrese** `/finance`, `/settings/plans`, `/settings/gym`.
- [ ] Sve odbijeno (stranica ne postoji).

**B4 · Chrome „Admin“ · `/settings/users`** → kolona „Lozinka“ → [Prikaži] kod Recepcionera A.
- [ ] Vidi se privremena lozinka.

### C. Smjena A1 i testni članovi (~1 h)

**C1 · Chrome „Recepcioner A“**: `/login` korisničkim imenom → nova lozinka → `/reception` →
[Počni rad].
- [ ] Zaglavlje: „Smjena: <A> od HH:mm“ (smjena A1 je otvorena).
- [ ] Meni: Recepcija, Članovi, Uplate danas, Magacin, Zaključi smjenu.
- [ ] Ukucane adrese `/finance`, `/settings/gym`, `/stats/visits` su odbijene.

**C2 · Vlasnik · `/members`** → [Novi član], dva člana. Samo vlasnik ima olovku uz „Početak“ i
„Iznos“. „Prijavi odmah“ isključeno.
- **„Podsjetnik“**: Mjesečna, email `petarsosic4+podsjetnik@gmail.com`, Iznos olovkom 70,00,
  Početak tako da je **Važi do = Dan 1 + 1 + Podsjetnik prije isteka**.
  Primjer: Dan 1 = 26.09, podsjetnik 3 → Važi do 30.09 → Početak 30.08.
- **„Istekao“**: Mjesečna, Početak tako da je **Važi do = juče**.
  Primjer: Dan 1 = 26.09 → Početak 25.08 → Važi do 25.09.
- [ ] Na profilu su Početak i Važi do onakvi kakve je vlasnik izabrao (provjera N-29).
- [ ] Važi do = Početak + 1 mjesec.
- [ ] „Godišnja“ se ne nudi. Vlasnik je zatim ponovo aktivira na `/settings/plans`.
- [ ] Obje uplate su na `/payments/today`, u smjeni A1.

**C3 · Recepcioner A · [Novi član]** (polje „Skenirajte praznu karticu“ → ukucaj kôd).
„Prijavi odmah“ isključeno. Pravi 8 članova:
1. Tromjesečna, gotovina.
2. Studentska mjesečna, platna kartica.
3. Mjesečna 12 termina, gotovina.
4. G+T sa Milenom. — [ ] Tatjana se ne nudi kao trener.
5. Personalni sa Tamarom, 10 termina: prvo iznos ispod minimuma — [ ] „Iznos ne može biti manji
   od <min> €.“ — pa stvarni iznos. — [ ] Milena se ne nudi.
6. Mjesečna, prezime **Ćosić**, telefon `067 123 456`. — [ ] Profil pokazuje `+38267123456`.
7. Mjesečna, isti telefon kao 6. — [ ] Upozorenje sa [Otvori postojećeg] / [Ipak sačuvaj] →
   [Ipak sačuvaj].
8. Mjesečna, ime „Marko😀“. — [ ] „Ime ne smije sadržati emoji.“ → ispravi i sačuvaj.

- [ ] Poslije svakog: „Član #N je kreiran. Upišite ime olovkom na karticu: …“
- [ ] Recepcioner nema olovku uz „Iznos“ i „Početak“.
- [ ] Svaka uplata je na `/payments/today` i u kontrolnoj tabeli.

**C4 · `/members`**
- [ ] Filter „Sa aktivnom članarinom“ / „Bez aktivne članarine“ radi; klik na red otvara profil.
- [ ] Profil: tabovi Članarine (status, preostali termini), Uplate, Dolasci.

### D. Recepcija: skeniranje (~45 min) · Recepcioner A

**D1 · Skeniraj člana 1 (Tromjesečna).**
- [ ] Zeleno: ime, #broj, plan, Važi do, „Neograničeno“; zvuk; zatvara se samo za 5 s.
- [ ] Desno: „U teretani: 1 · Danas dolazaka: 1“.

**D2 · Član 3 (12 termina).**
- [ ] Skeniraj → zeleno, preostalo 11.
- [ ] Odmah skeniraj ponovo → „… je prijavljen/a prije N s. Odjaviti?“ → [Ne] → i dalje u
      teretani.
- [ ] Skeniraj ponovo → [Odjavi] → „Odjavljen/a: <ime> – <trajanje>“.
- [ ] Skeniraj još jednom (nov dolazak) → preostalo 10.

**D3 · Član 4 (G+T)** → prozor Teretana / Grupni → Grupni → Milena.
- [ ] Ponuđen je „Čas: HH:mm“ iz A5 (ili „Bez časa iz rasporeda“ ako je van ±90 min).
- [ ] [Prijavi] → zeleno, Grupni preostalo 11.

**D4 · Član 5 (Personalni)** → Personalni → Tamara → [Prijavi].
- [ ] Preostalo 9.
- [ ] Odjavi ga (skeniraj → [Odjavi]), skeniraj ponovo i izaberi **Teretana** → žuto
      „Članarina nije važeća – neplaćeni dolazak.“ → [Zatvori]. (Ostaje neplaćen, za H3.)

**D5 · „Istekao“** → skeniraj.
- [ ] Žuto „Članarina nije važeća – neplaćeni dolazak.“; ne zatvara se samo → [Zatvori].
- [ ] Ipak je u „U teretani“; na profilu značka „Neplaćeni dolasci: 1“.

**D6 · „Istekao“ drugi put**: [Odjavi] u panelu „U teretani“, pa ga skeniraj ponovo.
- [ ] Crveno preko cijelog ekrana: „PAŽNJA: 2. neplaćeni dolazak!“
- [ ] [Produži članarinu] → Mjesečna → „Počinje od prvog neplaćenog dolaska <danas>“ → Gotovina
      → [Naplati i sačuvaj] → „Članarina sačuvana.“
- [ ] Na profilu nema značke „Neplaćeni dolasci“; oba dolaska su plaćena.

**D7 · Novi član sa ulice**: skeniraj praznu karticu → otvara se „Novi član“ sa karticom.
Datum rođenja **kucaj** (`dd.mm.yyyy`), Mjesečna, Gotovina, „Prijavi odmah“ **uključeno** →
[Sačuvaj].
- [ ] „Član #N je kreiran…“, pa zeleno.

**D8 · Pogrešni kodovi**
- [ ] 9 cifara → „Neispravan kod kartice.“
- [ ] `1111111111` → „Nepoznata kartica.“
- [ ] Obje poruke su crvene u statusu, bez prozora.

**D9 · Pretraga** „cosic“.
- [ ] Nalazi „Ćosić“; dok kucaš, ništa ne ide u skeniranje.
- [ ] Izaberi ga → ručna prijava → zeleno.
- [ ] Na profilu nekog člana u teretani [Ručna odjava] radi.

**D10 ·** Odjavi skeniranjem još 2 člana. Ostali ostaju u teretani.

### E. Novac na recepciji (~30 min)

**E1 · A · [Dnevna karta]** → 2 → Platna kartica.
- [ ] „Ukupno“ = 2 × cijena → [Naplati].

**E2 · A · `/storage`**
- [ ] Voda → [Nova roba]: 24 kom, 0,30, Plaćanje „Iz kase“ → stanje +24, Ukupno 7,20.
- [ ] Voda → [Prodaja] 2 kom gotovinom → stanje −2.
- [ ] Prodaja više od stanja nije moguća.
- [ ] Izotonik (stanje 0) → „Nema na stanju.“

**E3 · A · [Trošak]** → Potrošni materijal, „Krpe“, 6,00 → [Sačuvaj].
- [ ] Piše „Plaćeno iz kase · danas“; kategorija „Plate“ se ne nudi.

**E4 · A · `/payments/today`**
- [ ] Sekcije: Uplate, Prodaja iz magacina, Moji troškovi danas.
- [ ] Dno: Gotovina, Platna kartica, Troškovi iz kase, Očekivana gotovina.
- [ ] Očekivana gotovina = gotovina − Krpe − nabavka Vode = kontrolna tabela.

**E5 · Menadžer** proda 1 dnevnu kartu gotovinom, pa otvori `/payments/today`.
- [ ] Prodaja ulazi u smjenu A1 (upiši u tabelu).
- [ ] Menadžer vidi zbirove smjene, ali ne i A-ove troškove.

### F. Zaključenje, preuzimanje, ispravke (~45 min)

**F1 · A · `/shift/close`**
- [ ] Kartice sa zbirovima i „U teretani je još N osoba.“
- [ ] [Pregledaj stavke] prikazuje sve stavke.
- [ ] Prebrojana gotovina = tabela → „Razlika: 0,00 €“.
- [ ] [Zaključi smjenu i odjavi me] → potvrda → `/login` sa „Smjena je zaključena.“
- [ ] Mejl „Izvještaj smjene – <A> – <datum> <od>–<do>“ sa PDF-om stigao.

**F2 · A** se ponovo prijavi (nova smjena **A2**), proda 1 dnevnu kartu gotovinom, pa meni
naloga → Odjava.
- [ ] Pita „Smjena ostaje otvorena. Odjaviti se?“ → da.

**F3 · Chrome „Recepcioner B“**: prva prijava → nova lozinka → S-02.
- [ ] „Otvorena je smjena: <A> (od …)“; nema menija.
- [ ] Prebrojana gotovina za prethodnu smjenu = gotovina A2 → [Preuzmi smjenu] → `/reception`,
      zaglavlje „Smjena: <B> od …“ (smjena **B1**).
- [ ] Mejl izvještaja A2 stigao, u njemu „Preuzeo/la <B>“.

**F4 · B · ispravke na `/payments/today`**: B proda 2 dnevne karte gotovinom, **odvojeno**.
- [ ] [Ispravi] na prvoj → Platna kartica; zbirovi se promijene; B nema polje za iznos.
- [ ] [Poništi] na drugoj: razlog „ab“ se odbija, „greška“ prolazi → red precrtan.
- [ ] Stavke iz A1 i A2 B ne može ni ispraviti ni poništiti.
- [ ] B unese trošak 3,00 pa ga poništi.
- [ ] B proda 1 Vodu → [Ispravi] način plaćanja → radi.

**F5 · Vlasnik** ispravi **iznos** jedne uplate iz A1 (npr. Studentska → 45,00).
- [ ] Samo vlasnik ima polje za iznos; zbir se promijeni. Upiši u tabelu.

**F6 · Menadžer**
- [ ] `/settings/trainers` → izmijeni jedan čas u rasporedu.
- [ ] `/stats/visits` → vide se današnji dolasci.
- [ ] Meni naloga → Promijeni lozinku (traži trenutnu) → odjava → prijava novom lozinkom.

**F7 · B** se prijavi u **Edge-u** (smjena B1 se nastavlja) → `/shift/close` → prebrojano =
očekivano − 5.
- [ ] „Razlika: −5,00 € (Manjak)“ → zaključi.
- [ ] B-ov Chrome prozor, na sljedeći klik → `/login`.
- [ ] Edge: [Uredi podatke] na jednom članu, datum rođenja kucanjem → sačuvan.

### G. Dan problema (~1 h) · Recepcioner A u Firefoxu

**G1 · A** se prijavi u **Firefoxu** (smjena **A3**) → [Počni rad].
- [ ] Skeniranje, pretraga i dnevna karta rade.
- [ ] [Uredi podatke] → datum rođenja kucanjem → sačuvan.

**G2 · Izgubljena kartica**: pretraga → [Otvori profil] → [Izgubljena kartica].
- [ ] „Naknada za novu karticu: <iznos iz A2>“ → Gotovina → [Nastavi].
- [ ] Ukucaj praznu karticu → „Nova kartica dodijeljena. Stara kartica je poništena.“
- [ ] Stara kartica → „Kartica je poništena. Pronađite člana pretragom.“; nova radi.

**G3 · [Uredi podatke]**: promijeni telefon jednom članu. (Provjera u H7.)

**G4 · Nestanak interneta**: isključi Wi-Fi.
- [ ] Pojavi se baner.
- [ ] Pokušaj [Dnevna karta]: jasno piše da nije prošlo; ništa ne nestaje bez poruke.
- Na papir: 2 dnevne karte gotovinom i 1 dolazak (član, 14:00–15:00, Teretana). Vrati Wi-Fi.

**G5 · Promjena cijene**: vlasnik na `/settings/plans` podigne Mjesečnu (npr. 85).
A → profil člana 1 (Tromjesečna) → [Nova članarina] → Mjesečna.
- [ ] Iznos je nova cijena; stare uplate su iste.
- [ ] „Nastavlja se na članarinu koja važi do …“; nova članarina je „Buduća“.
- Vlasnik vrati staru cijenu. (Ne ide u listu za produkciju.)

**G6 · Recepcioner C** (gost prozor)
- [ ] Vlasnik ga napravi; C se prijavi dok A radi → nova lozinka → S-02 → [Odjavi se]. A-ova
      smjena je netaknuta.
- [ ] Vlasnik [Nova lozinka] za C → C se prijavi njome (ostaje na S-02).
- [ ] Vlasnik [Deaktiviraj] C → C na sljedeći klik ide na `/login`; kod C se sada nudi
      [Aktiviraj].

**G7 · Telefon** (Vercel adresa): A se prijavi, smjena A3 se nastavlja.
- [ ] Skeniranje kucanjem, dnevna karta, pretraga, „Otvori meni“ rade.
- [ ] Tastatura ne prekriva polja; dugmad se lako pogađaju; nema vodoravnog pomjeranja.

**G8 · Vlasnik · `/finance/shifts`** → otvorena smjena A3 → [Zaključi smjenu].
- [ ] A u Firefoxu i na telefonu na sljedeći klik ide na `/login`.
- [ ] Mejl izvještaja: „Zaključio/la Vlasnik Test“.

### H. Vlasnikov obračun (~1 h) · Chrome „Vlasnik“

**H1 · `/finance/backdated`** (unosi papir iz G4)
- [ ] Baner „Naknadni unos – ne ulazi u smjenu.“
- [ ] Tab Dnevne karte: 2, gotovina, danas.
- [ ] Tab Dolazak: član, danas, 14:00–15:00, Teretana.
- [ ] Tab Članarina: jedna Nedeljna nekom članu, izabran početak i datum uplate.
- [ ] Tab Zamjenska kartica: jedna naknada.
- [ ] U tabeli sve označi „naknadno“: ne ulazi u gotovinu smjene, ali ulazi u `/finance`.
- Zapiši SG: u pravoj teretani taj novac je u kasi, pa bi smjena pokazala višak.

**H2 · `/finance/shifts`**
- [ ] A1 „Zaključio/la <A>“, razlika 0; A2 „Preuzeo/la <B>“; B1 manjak −5,00; A3 „Zaključio/la
      Vlasnik Test“.
- [ ] Email status svuda „poslato“.
- [ ] [PDF] svake smjene ima naša slova (č ć š ž đ).
- [ ] [Pošalji ponovo] na jednoj → mejl stiže ponovo.

**H3 · `/finance`**, period danas
- [ ] Prihod = kontrolna tabela (sa naknadnim) **na cent**.
- [ ] Troškovi, Profit, Zarada na magacinu; tabele po planu i po načinu plaćanja.
- [ ] „Ističe u narednih 7 dana“ sadrži „Podsjetnik“.
- [ ] „Članovi sa neplaćenim dolascima“ sadrži člana 5 (D4).

**H4 · `/finance/expenses`** → [Novi trošak]: Kirija (Van kase), Struja (Platna kartica).
- [ ] „Ukupno“ se slaže; Krpe i nabavka Vode su u listi.
- [ ] [Poništi] jedan → „Poništeni troškovi nisu uračunati.“

**H5 · `/finance/trainers`** (tekući mjesec)
- [ ] Milena: G+T iz C3; Tamara: Personalni iz C3, „Za trenera“ = iznos − Tamarina naknada.
- [ ] [Evidentiraj isplatu] Tamari → „Isplaćeno“ i „Razlika“ se promijene; isplata je u
      troškovima.

**H6 · `/finance/storage`**
- [ ] Stanje, prodato, zarada po proizvodu.
- [ ] [Poništi] nabavku Vode → „Poništavanje nije moguće – stanje bi bilo negativno.“

**H7 · `/finance/audit`**: filter po korisniku i po stavci.
- [ ] Tu su ispravke, poništavanja, promjena cijene (G5), izmjena telefona (G3), podešavanja.
- [ ] Tekst je jezikom ekrana („Način plaćanja: Gotovina → Platna kartica“), bez tehničkih polja.

**H8 · `/stats/visits`**
- [ ] Dolasci po vrsti i po danu.

**H9 · Reset lozinke** (Chrome „Admin“): odjava → `/login` → „Zaboravljena lozinka?“ → admin
email.
- [ ] Mejl stiže; link vodi na **Vercel adresu**, ne na `localhost`.
- [ ] Nova lozinka → prijava radi.

**H10 · Anonimizacija**: profil člana 7 → [Anonimiziraj] → ukucaj broj člana → [Anonimiziraj
trajno].
- [ ] „Član je anonimiziran.“; pretraga ga više ne nalazi; uplate su i dalje u `/finance`.

### I. Kraj Dana 1 (~15 min) · Chrome „Recepcioner B“

**I1 · B** se prijavi (smjena **B2**), proda 1 dnevnu kartu, skenira jednog člana.
- [ ] Zapiši ko je u „U teretani“.

**I2 · B ne zaključuje smjenu i ne odjavljuje se.** Prozor ostaje otvoren do jutra (za J3).

**I3 · Uveče**
- [ ] Dno `/payments/today` = tabela za B2.
- [ ] Automatsko zaključivanje je i dalje stvarno vrijeme (A2).

---

## Dan 2 (sutradan, od 09:15)

### J. Provjera noći (~20 min) · Vlasnik

**J1 · `/finance/shifts`**
- [ ] B2: „Automatski“, „nije prebrojano“, mejl „poslato“.
- [ ] PDF: „Automatski zaključeno u <vrijeme> – gotovina nije prebrojana.“

**J2 · Recepcija i profili**
- [ ] „U teretani“ je prazno.
- [ ] Profil člana iz I1 → Dolasci: odjava u vrijeme automatskog zaključenja.

**J3 · Chrome „Recepcioner B“**, jučerašnji prozor → klikni bilo šta u meniju.
- [ ] Ide na `/login` sa „Smjena je automatski zaključena.“

**J4 · Mejl podsjetnik** na `petarsosic4+podsjetnik@gmail.com`.
- [ ] Stigao je oko 09:00, i to **samo jedan**.

### K. Normalan dan (~1 h) · Recepcioner A

**K1 ·** A se prijavi (smjena **A4**) → [Počni rad].

**K2 ·** „Podsjetnik“ → profil → [Produži] na članarini koja ističe → Gotovina.
- [ ] „Nastavlja se na članarinu koja važi do <datum>“; nova je „Buduća“, stara važi do kraja.

**K3 ·** Radi kao pravi dan, bez uputstva: 5 skeniranja, 1 grupni dolazak, 1 dnevna karta,
1 prodaja Vode, 1 trošak.
- [ ] Nijedna poruka „Došlo je do greške. Pokušajte ponovo.“

**K4 ·** `/shift/close` → prebrojano = tabela.
- [ ] „Razlika: 0,00 €“; mejl stigao.

**K5 · Vlasnik · `/finance`**, period Dan 1 – Dan 2.
- [ ] Prihod = zbir kontrolne tabele **na cent**.

### L. Sedmična kopija (prva nedjelja; ako je Dan 2 nedjelja, uradi odmah)

- [ ] Mejl „Sedmična rezervna kopija – KP Fitness – <datum>“ sa ZIP-om.
- [ ] ZIP se otvara lozinkom `BACKUP_ZIP_PASSWORD`; unutra CSV fajlovi i `manifest.json`.
- [ ] `/settings/gym`: „Posljednja rezervna kopija: … – uspješno“.

---

## Svaki dan

- **Uveče:** dno `/payments/today` = tabela; mejl izvještaja stigao; na `/finance/shifts` nema
  „neuspješno“.
- **Ujutru:** niko ne visi „U teretani“ od juče; jučerašnja smjena je zatvorena.
- **Uvijek:** skeniranje odgovara odmah; nijedno dugme se ne vrti bez kraja; sve poruke su na
  našem jeziku; recepcioner nikad ne vidi Finansije ni Podešavanja.

## Nalazi

Upisuju se u **`TEST_PLAN.md` §10 „Simulacija rada teretane“**, sa kratkim rezimeom svakog dana.
N-29 je već zauzet (Početak u „Novi član“), pa novi nalazi idu **od N-30**.

Format: `N-30 · korak G4 · šta se desilo · šta se očekivalo · vrsta`

| Vrsta | Značenje | Kad se popravlja |
|---|---|---|
| **Blokira** | novac, smjena ili dozvole | isti dan, pa se blok ponavlja |
| **Bag** | nešto ne radi kako piše | na kraju dana |
| **SG** | nejasno ili nezgodno | odlučuju Petar i Mihajlo |

## Kad je gotovo

- [ ] Dan 1 i Dan 2 bez otvorenog blokirajućeg nalaza. (Blokirajući u Danu 2 → popravka, pa se
      Dan 2 ponavlja sljedećeg dana.)
- [ ] Gotovina svake smjene = tabela; `/finance` za oba dana = tabela na cent.
- [ ] Stigli su svi mejlovi: izvještaji (zaključenje, preuzimanje, vlasnik, automatski, ponovo
      poslat), podsjetnik, reset lozinke, kopija.
- [ ] Svaki nalaz je popravljen ili su ga Petar i Mihajlo izričito prihvatili.

---

## Dio 3 — Zamjena baze svježom (Petar, ~1 h)

1. - [ ] Sve popravke su na Petrovom `main`; lista podešavanja za produkciju je spremna.
2. - [ ] Nov Supabase projekat (EU, Frankfurt). Free plan dozvoljava 2 aktivna projekta: stari
         (ostaje test baza) i novi. Projekat za test obnove (BR-163), ako postoji, pauziraj.
3. **`.env.local` → vrijednosti novog projekta**
   - [ ] `npm run db:push -- --dry-run`: host je **NOVI** projekat i idu sve migracije od 0001.
   - [ ] `db:push`, pa `seed`.
   - [ ] `seed:owner` (treba `SEED_OWNER_PASSWORD`): `matija.vojinovic@eurotehnikamn.me`. Vidi
         „Otvoreno“.
   - [ ] `seed:admin` sa `ADMIN_EMAIL=petarsosic4@gmail.com`, `ADMIN_PASSWORD`, `ADMIN_NAME`.
   - [ ] Vrati `.env.local` na test bazu. Produkcijske vrijednosti u menadžer lozinki.
4. - [ ] Auth u novom projektu: SMTP (Resend), Site URL, redirect `/auth/callback`.
5. **Vercel env**
   - [ ] Zamijeni `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
         `SUPABASE_SERVICE_ROLE_KEY`.
   - [ ] Nov `CRON_SECRET` i nov `BACKUP_ZIP_PASSWORD` (u menadžer lozinki; zna je i Mihajlo).
   - [ ] **Redeploy** (`NEXT_PUBLIC_*` se ugrađuju pri buildu).
6. **Cron**: privremeno `APP_URL` = produkcijska adresa i `DATABASE_URL` = nova baza u
   `.env.local` → `npm run jobs:secrets` → vrati `.env.local` na test bazu.
   - [ ] `succeeded`; poziv bez zaglavlja → 401.
7. **Stari projekat ostaje test baza.** Pet provjera (`test:e2e` upisuje podatke) od sada samo na
   njemu, **nikad na produkciji**.
   - [ ] U starom projektu: `select cron.unschedule('kp-fitness-jobs');`
8. **Provjera**
   - [ ] `/login` radi; admin se prijavi; vlasnik se prvi put prijavi i promijeni lozinku.
   - [ ] Reset mejl stiže.
   - [ ] Upit: **0 članova, 0 uplata, 0 smjena**.
9. - [ ] Svi uređaji prijavljeni na staru bazu se odjave i prijave ponovo.
10. - [ ] Kartice i PDF-ovi iz simulacije se bacaju (ne postoje u novoj bazi).

## Dio 4 — Priprema teretane i predaja

1. **Vlasnik, uz Petra**
   - [ ] `/settings/gym`: primaoci izvještaja i kopije = `petarsosic4@gmail.com` (kasnije
         vlasnikov mejl); logo.
   - [ ] Cijene, treneri, raspored, proizvodi i kategorije po listi za produkciju.
2. - [ ] Kartice: dvije serije (najviše 100 po seriji), ~130 kartica, PDF i štampa.
3. - [ ] Nalozi: menadžer i recepcioneri, sa privremenim lozinkama.
4. - [ ] Pravi članovi: unosi ih vlasnik ili administrator kroz [Novi član], uz otvorenu smjenu
         (BR-092). Testni članovi ne prelaze. Iznos i Početak: vidi „Otvoreno“.
5. - [ ] Prvi radni dan: Petar i Mihajlo dostupni; uveče sa vlasnikom pregled izvještaja smjene.
6. - [ ] Prva sedmica: Petar čita svaki izvještaj; u nedjelju stiže kopija. Finansije u aplikaciji
         počinju od dana starta; ono prije ostaje u Excelu.

## Popravke poslije starta

1. Petar popravi i pusti pet provjera **na test bazi** (stari projekat).
2. Produkcijski `DATABASE_URL` privremeno u `.env.local`: `db:push -- --dry-run` → `db:push` →
   vrati test bazu. **Migracija uvijek ide prije koda.**
3. Push na Petrov GitHub → Vercel deployuje.

Hitan problem: Vercel Instant Rollback. Ako Mihajlo kasnije radi na kodu, prvo povuče sa
Petrovog GitHuba; nikad ne rade obojica u isto vrijeme.

## Odluke (Mihajlo, 24.09.2026)

- Administrator u produkciji: `petarsosic4@gmail.com`.
- Mejl vlasnika: `matija.vojinovic@eurotehnikamn.me`.
- Izvještaj smjene i sedmična kopija za sada idu na `petarsosic4@gmail.com`, kasnije na
  vlasnikov mejl.
- Prave članove unosi vlasnik ili administrator, tek poslije simulacije.
- Hosting: Vercel Hobby.

## Otvoreno

- Da li Matija smije dobijati izvještaje smjene od prvog dana u produkciji? Po D-65 izvještaj
  ide svakom aktivnom vlasniku sa mejlom, pa ga Matija dobija čim ga `seed:owner` napravi, a
  `/settings/gym` to ne može isključiti.
- Sa kojim iznosom i Početkom se unose pravi članovi koji su već platili u Excelu? Iznos po
  cjenovniku daje manjak u smjeni i duplo broji novac u `/finance`. Druga mogućnost: 0 € i
  Početak iz Excela (uz popravku N-29). Personalni ne prima iznos ispod minimuma (BR-059).
