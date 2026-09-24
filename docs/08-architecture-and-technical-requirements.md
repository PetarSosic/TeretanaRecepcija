# 08 — Architecture and Technical Requirements

## 1. Tech stack
| Area | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router), TypeScript `strict: true`** | One codebase for UI and server logic. Server Components keep financial queries on the server. Deploys directly to Vercel. |
| Database, auth, storage | **Supabase** (Postgres 15+, Auth, Storage, pg_cron, pg_net) | RLS enforces role and finance privacy in the database. Rules live in SQL functions, so writes are atomic. The free tier is enough for one gym. |
| UI | **Tailwind CSS + shadcn/ui** | Accessible components (dialogs, selects, toasts) with keyboard support that are easy to restyle. |
| Validation | **Zod** | One schema per form, used on client and server. |
| Charts | **Recharts** | Works well with React and shadcn (D-53). |
| PDF | **@react-pdf/renderer** (Node runtime) | Shift reports and card sheets are built from React components with exact mm layout. |
| Backup ZIP | **@zip.js/zip.js** | Creates AES-256 encrypted ZIP files in Node (BR-163). |
| QR | **qrcode** (npm) | Generates QR codes as SVG or PNG for the card PDF. |
| Email | **Resend** (with its React email templates) | A simple API, attachments, and a free tier (3,000/month). |
| Scheduled jobs | **Supabase pg_cron + pg_net** calling secured Next.js route handlers | Exact timing on the free tier (D-41). The handlers run in Node, so they can render PDFs. |
| Tests | **pgTAP** (Node runner over hosted Postgres), **Vitest**, **Playwright** | Tests business rules and RLS where they live (SQL), plus TypeScript utilities and end-to-end flows. No Docker (D-56). |
| Hosting | **Vercel** (frontend and route handlers), **Supabase Cloud** (database) | Free tiers (D-49). |

> ASSUMPTION (AS-11): Business rules are implemented as Postgres functions (so every write is a single atomic transaction) and tested with pgTAP. Vitest covers TypeScript code (formatters, Zod schemas, scan parsing). Decision D-50 asked for Vitest tests of the rules; the tests stay, and the rule tests run in pgTAP.

> ASSUMPTION (AS-20): pg_cron triggers the jobs by calling Next.js route handlers through pg_net with a secret header, instead of calling Supabase Edge Functions. This is because PDF rendering needs Node. The schedule still lives in Supabase, as D-41 requires.

> OPEN QUESTION (OQ-5): Vercel's free Hobby plan is limited to non-commercial use under Vercel's terms, and a gym is a business. **Temporary behaviour:** develop and deploy on Hobby. Decide before go-live whether to move to Vercel Pro or another host.

## 2. Architecture overview
```
Browser (reception PC / owner phone)
  └── Next.js App Router (Vercel)
        ├── Server Components ── read via Supabase (user JWT, RLS applies)
        ├── Server Actions ───── call RPCs (user JWT) · staff admin via service role
        └── Route Handlers ───── /api/jobs/*, /api/pdf/* (secret or owner-checked)
Supabase
  ├── Postgres: tables · RLS · security-definer RPCs · audit triggers · pg_cron → pg_net
  ├── Auth: email/password users (receptionists via internal email, AS-4)
  └── Storage: shift-reports · card-batches · gym-assets
Resend: shift report emails · expiry reminders
```

**Data-access rules:**
1. Browser code never writes to tables. Every mutation is a server action that calls one RPC.
2. The service-role key is used only in `lib/supabase/admin.ts`, and only in server actions for staff accounts, job route handlers and the seed script.
3. Owner financial data is fetched only through `fin_*` functions from server components under `/finance`.

## 3. Folder structure
```
/
├── CLAUDE.md
├── README.md
├── docs/                          # this specification
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (auth)/change-password/page.tsx
│   ├── (app)/layout.tsx           # session + role guard, header, offline banner, shift badge
│   ├── (app)/reception/page.tsx
│   ├── (app)/members/page.tsx
│   ├── (app)/members/[id]/page.tsx
│   ├── (app)/payments/today/page.tsx
│   ├── (app)/storage/page.tsx
│   ├── (app)/shift/gate/page.tsx
│   ├── (app)/shift/close/page.tsx
│   ├── (app)/stats/visits/page.tsx
│   ├── (app)/finance/{page,expenses,trainers,shifts,storage,backdated,audit}/…
│   ├── (app)/settings/{users,trainers,plans,products,gym,cards}/…
│   └── api/
│       ├── jobs/nightly/route.ts
│       ├── jobs/morning/route.ts
│       ├── jobs/email-retry/route.ts
│       ├── jobs/weekly-backup/route.ts
│       ├── pdf/shift/[id]/route.ts          # owner download
│       └── pdf/cards/[batchId]/route.ts     # owner/manager download
├── features/<feature>/            # actions.ts (server actions), components/, schemas.ts
│   (auth, shifts, reception, members, memberships, payments, expenses,
│    storage, finance, stats, settings, cards)
├── components/ui/                 # shadcn
├── components/common/             # money, date, status badges, empty/loading/error, offline banner
├── lib/
│   ├── supabase/{server,client,admin}.ts
│   ├── format.ts                  # BR-002/003 (Intl 'sr-Latn-ME')
│   ├── phone.ts                   # BR-041
│   ├── errors.ts                  # error code → Montenegrin message (§5)
│   ├── i18n/me.ts                 # all UI strings (AS-19)
│   ├── scan.ts                    # scanner input parsing
│   ├── backup.ts                  # CSV export + encrypted ZIP (BR-163)
│   ├── pdf/{shift-report,card-sheet}.tsx
│   └── email/{shift-report,expiry-reminder}.tsx
├── public/sounds/{ok,warning,alarm}.mp3
├── supabase/
│   ├── migrations/NNNN_description.sql
│   ├── seed.sql
│   └── tests/*.test.sql           # pgTAP
├── scripts/seed-owner.ts
└── tests/
    ├── unit/                      # Vitest
    └── e2e/                       # Playwright
```

> ASSUMPTION (AS-19): All UI strings live in one TypeScript dictionary (`lib/i18n/me.ts`). No i18n library, because only one language exists.

## 4. Authentication
- **All staff (D-57):** a username and password. The Auth user email is `<username>@staff.kpfitness.internal` (domain from `STAFF_EMAIL_DOMAIN`). The account is created through the admin API with `email_confirm: true`. Login maps a username to that email. Staff passwords are reset by an owner, a manager or the admin on S-23, following P-03 and P-04.
- **Admin (D-58):** a real email + password, so a forgotten admin password can be reset. Password reset uses Supabase's reset email, sent through Resend SMTP (configured in Supabase Auth settings) from `noreply@stamenkovicc.com` (BR-161). Its template links to `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery`; the route verifies the token with `verifyOtp`, raises `must_change_password` and continues on S-01b (D-69). The seeded owner account of Matija Vojinović keeps its email login as the one exception among non-admin staff.
- **Stored passwords (D-59):** every password the application sets for a staff account is also written in readable form to `staff_credentials`, which only the admin may read. Changing a password anywhere — admin reset, owner or manager reset, or the user changing their own — updates that copy, so it is never stale.

> ASSUMPTION (AS-4): Receptionists use internal, non-deliverable emails. Usernames are unique across the whole system.

- **Sessions:**
  - Supabase cookie sessions via `@supabase/ssr`.
  - Middleware refreshes sessions and, for inactive staff or a closed-shift receptionist, signs out and redirects to `/login`.
  - `must_change_password = true` redirects every route to S-01b.

> ASSUMPTION (AS-18): Accounts created with a temporary password must change it at first login.

- **Password rules:** at least 8 characters. Supabase's built-in login rate limiting stays enabled.

## 5. Errors
RPCs raise `P0001` with the message `E_<CODE>`. `lib/errors.ts` maps each code to the UI text:

| Code | UI message |
|---|---|
| E_NOT_STAFF | `Nemate pristup.` |
| E_FORBIDDEN | `Nemate dozvolu za ovu radnju.` |
| E_NO_OPEN_SHIFT | `Nema otvorene smjene. Recepcioner mora biti prijavljen.` |
| E_SHIFT_TAKEN | `Otvorena je smjena drugog recepcionera.` |
| E_CARD_INVALID | `Neispravan kod kartice.` |
| E_CARD_UNKNOWN | `Nepoznata kartica.` |
| E_CARD_DEACTIVATED | `Kartica je poništena. Pronađite člana pretragom.` |
| E_CARD_NOT_UNASSIGNED | `Ova kartica nije prazna.` |
| E_MEMBER_HAS_OPEN_VISIT | `Član je već u teretani.` |
| E_TRAINER_REQUIRED | `Izaberite trenera.` |
| E_TRAINER_NOT_ASSIGNED | `Trener nije dodijeljen ovom programu.` |
| E_AMOUNT_BELOW_MIN | `Iznos ne može biti manji od {min} €.` |
| E_AMOUNT_LOCKED | `Samo vlasnik može mijenjati iznos.` |
| E_RECORD_NOT_EDITABLE | `Ova stavka se ne može mijenjati (smjena je zaključena).` |
| E_REASON_REQUIRED | `Unesite razlog (3–200 znakova).` |
| E_STOCK_INSUFFICIENT | `Nema dovoljno na stanju (stanje: {qty}).` |
| E_STOCK_NEGATIVE | `Poništavanje nije moguće – stanje bi bilo negativno.` |
| E_STOCK_COST_INVALID | `Nabavna cijena mora biti najmanje 0,01 €.` |
| E_CATEGORY_NOT_ALLOWED | `Ova kategorija nije dozvoljena.` |
| E_SELF_DEACTIVATE | `Ne možete deaktivirati sopstveni nalog.` (D-60) |
| E_LAST_ACCOUNT | `Mora ostati bar jedan aktivan nalog ove uloge. Prvo dodajte zamjenu.` (D-60) |
| E_VALIDATION | Field-specific text from Zod |

## 6. Server actions (thin wrappers)
- **One action per RPC** in doc 07 §5, named in camelCase (e.g. `sellMembership`). Each action:
  1. validates the input with Zod;
  2. calls the RPC with the user session;
  3. calls `revalidatePath` for the affected pages;
  4. returns `{ ok: true, data } | { ok: false, code, message }`.
- **Additional server-only actions:**
  - `createStaffUser`, `updateStaffUser`, `setStaffPassword`, `setStaffActive` (admin API + `staff` row; checks P-03/P-04);
  - `changeOwnPassword`;
  - `loginWithUsernameOrEmail`;
  - `uploadLogo` (owner; PNG or JPG ≤ 1 MB);
  - `closeShiftAndReport`:
    1. RPC `close_shift`;
    2. render the PDF;
    3. upload to Storage;
    4. send the email (on failure, set `email_status = failed`);
    5. sign out;
    6. redirect.
  - `generateCardBatchPdf`.

## 7. Integrations
**Resend:**
- Sender address: `EMAIL_FROM` = `noreply@stamenkovicc.com` (BR-161). Before go-live, add the Resend DNS records (SPF, DKIM) for `stamenkovicc.com` and confirm the domain shows as verified in Resend.
- **Shift report** (BR-117):
  - to: `gym_settings.shift_report_emails` and every active owner with an email (D-65);
  - PDF attachment named `smjena-<yyyy-mm-dd>-<ime>.pdf`;
  - body: `U prilogu je izvještaj smjene <ime> (<period>). Očekivana gotovina: <iznos>. Prebrojano: <iznos|nije prebrojano>.`
- **Expiry reminder** (BR-160):
  - subject `Vaša članarina ističe <dd.mm.yyyy>`;
  - body:
    ```
    Poštovani/a <Ime>,

    Vaša članarina "<plan>" u teretani <naziv teretane> važi do <dd.mm.yyyy>.
    Produžite je na recepciji kako biste nastavili bez prekida.

    Vidimo se!
    <naziv teretane>
    ```
  - Plain layout; no tracking.
- **Weekly backup** (BR-163): to `gym_settings.backup_emails`, with the body `U prilogu je sedmična rezervna kopija (<broj tabela> tabela, <ukupno redova> redova). Lozinka nije u ovom emailu.`

**PDF (@react-pdf/renderer):**
- The shift report is A4 portrait, with the BR-117 content and page numbers `Strana X od Y`.
- The card sheet follows S-28.
- A font with full Latin Extended support (e.g. Inter or Noto Sans) is embedded, so č ć š ž đ render correctly.

**QR:** `qrcode.toString(code, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 })`.

## 8. Scheduled jobs
- **pg_cron** runs `every 5 minutes` and calls `net.http_post` to `APP_URL/api/jobs/<name>` with the header `x-cron-secret: CRON_SECRET`.
- **Each handler:**
  1. verifies the secret (otherwise 401);
  2. for each gym, checks the gym's local time against the schedule;
  3. runs if due and not yet run today (the `job_runs` table, doc 07, guarantees idempotency).

| Job | Due when | Handler steps |
|---|---|---|
| nightly | Local time ≥ `auto_close_time` | 1. RPC `job_nightly` (BR-082 and BR-116). 2. Render the PDF and email the closed shift. |
| morning | Local time ≥ 09:00 | RPC `job_expiring_memberships`, then send emails and record them in `expiry_notifications` (skip if `EMAIL_FROM` is unset) |
| weekly-backup | Sunday, local time ≥ 03:00 | Export tables (service role) → CSVs + `manifest.json` → encrypted ZIP → upload to `backups` → delete all but the newest 8 → email → record in `backup_runs`. On failure, retry on later runs, up to 3 attempts that day. |
| email-retry | Every run | Shifts with `email_status = 'failed'` and `email_attempts < 5`, last attempt ≥ 15 min ago |

## 9. Non-functional requirements
**Performance:**
- Scan result shown ≤ 1 s after Enter (p95) with ≥ 10 Mbit/s; the `scan_card` RPC takes ≤ 300 ms.
- Member search results ≤ 500 ms after typing stops (250 ms debounce).
- Any page is interactive ≤ 3 s on the reception PC.
- Finance pages for a 12-month range load in ≤ 3 s.
- Sizing assumption: 3,000 members, 150,000 visits per year, 20,000 payments per year.

**Browsers and devices:**
- Reception: current Chrome (last 2 versions) on desktop, 1366×768 and larger, with no horizontal scrolling on S-03, S-12, S-13 and S-14.
- Owner and manager: current Chrome and Safari on iOS and Android at 375 px width and up. All pages must be usable at 375–1920 px; tables scroll horizontally inside their own container.

**Localization:**
- UI in Montenegrin (Latin, ijekavica) only.
- `Intl` locale `sr-Latn-ME` for numbers and dates, with the BR-002/BR-003 output enforced by tests.
- Search ignores diacritics (BR-044).

**Accessibility (D-47):**
- Every action works with the keyboard; focus is visible.
- Text contrast is at least WCAG AA (4.5:1).
- Warnings use text and an icon, never color alone.
- Dialogs trap focus; form fields have labels.
- Sounds always come with a visible message.

**Sounds:** three short files in `public/sounds`, played only after the S-03 audio unlock:
- ok ≤ 0.5 s;
- warning ≈ 1 s;
- alarm ≈ 2 s.

**Offline:** F-27 only. No caching of write operations.

**Security:**
- RLS on every table.
- The service-role key is server-only.
- `CRON_SECRET` is at least 32 random characters.
- No personal data in logs (log IDs only).
- Security headers: `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and a CSP that allows only self, Supabase and Resend.
- Dependencies are pinned with a lockfile.

**Logging:** server errors go to the Vercel logs with the error code, route and staff ID.

**Backups:** the free Supabase plan has no automatic backups, so the app makes its own weekly encrypted backup and emails it to the developer (BR-163, F-28). The ZIP password is never sent by email; it is kept only in the environment variable `BACKUP_ZIP_PASSWORD` and in the developer's password manager.

**Export streaming:** the backup handler exports tables one at a time, in pages of 5,000 rows, so memory stays low within the Vercel function time limit (60 s on Hobby). If a run would exceed the limit, it fails and is reported, instead of producing a partial backup.

## 10. Testing
- **pgTAP** (`npm run test:db`, using `DATABASE_URL` over TLS, each SQL test rolled back):
  - every worked example E1–E20 (doc 03 §16);
  - BR-051, BR-052, BR-053, BR-055, BR-074, BR-079 (N), BR-095, BR-115, BR-155, BR-156;
  - for each ✗ cell in doc 04 §1, a test that the role is rejected, both by RPC and by direct table access.
- **Vitest:** `format.ts`, `phone.ts`, `scan.ts`, Zod schemas, `errors.ts` mapping.
- **Playwright** (local Next.js app, hosted Supabase with synthetic test fixtures; no database reset):
  1. receptionist login → shift opened;
  2. scan an unassigned card → register → auto check-in → scan again → check-out;
  3. expired member → yellow, then red, dialog → renew → start date per E3;
  4. G+T group visit with trainer and slot;
  5. day pass, bar sale, stock-in from till, desk expense;
  6. correct and void a payment;
  7. close shift → PDF stored → logged out;
  8. second receptionist takeover;
  9. owner finance pages show E9–E12 values;
  10. manager cannot open `/finance` (404) and the API returns no payments from yesterday;
  11. offline banner disables save.
- **Commands:** `npm run lint`, `npm run typecheck`, `npm run test` (Vitest), `npm run test:db` (pgTAP), `npm run test:e2e` (Playwright). All must pass at the end of every milestone.

## 11. Environments and configuration
- **Development (D-56):** `npm run dev` serves the app locally and connects directly to hosted Supabase project `paakuxiufzmdobpooqdi`. No Docker or local Supabase stack. Initialize the CLI metadata with `supabase init`, link the hosted project, inspect existing data, and apply only new numbered migrations with `supabase db push --linked`. No remote resets. Database tests use `scripts/test-db.mjs` with pgTAP over a TLS Postgres connection, isolated in transactions and rolled back. Synthetic E2E fixtures must avoid modifying existing gym data. Owner seeding arrives in M-01.
- **Production:** one Supabase free project and one Vercel project (Hobby for now, OQ-5). Migrations are applied with `supabase db push`. The pg_cron schedules are created by a migration that reads `APP_URL` and `CRON_SECRET` from Supabase Vault.
- **Environment variables:**

| Variable | Used by |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server |
| `SUPABASE_SERVICE_ROLE_KEY` | server only |
| `RESEND_API_KEY` | server |
| `EMAIL_FROM` | server (`noreply@stamenkovicc.com`) |
| `BACKUP_ZIP_PASSWORD` | server only (≥ 20 random characters) |
| `CRON_SECRET` | server + Supabase Vault |
| `APP_URL` | server + Supabase Vault |
| `STAFF_EMAIL_DOMAIN` | server (default `staff.kpfitness.internal`) |
| `SEED_OWNER_PASSWORD` | seed script only |
| `DATABASE_URL` | hosted pgTAP runner only; private TLS Postgres URI, preferably the session pooler on port 5432 |
