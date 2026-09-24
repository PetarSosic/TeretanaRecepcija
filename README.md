# KP Fitness Gym App — Specification

**Version:** 1.1 · **Date:** 17.09.2026 · **Author:** Mihajlo Stamenković

This folder is the complete specification for a staff-only gym management web app for **KP Fitness** (Montenegro), built with **Next.js + Supabase**.

The app is built **only** from these documents. Anything not written here does not exist.

## Reading order
Read every file in this order before writing code.

| # | File | Single responsibility |
|---|---|---|
| 1 | `docs/01-product-overview.md` | Why the app exists, who uses it, scope, non-goals, success criteria |
| 2 | `docs/02-glossary.md` | Every domain term: English name, code identifier, UI label (Montenegrin) |
| 3 | `docs/03-business-rules.md` | All business rules (BR-xxx), seed prices, calculations, worked examples |
| 4 | `docs/04-roles-and-permissions.md` | Who can see and do what, and how it is enforced |
| 5 | `docs/05-features-and-user-stories.md` | Feature list (F-xx), user stories, acceptance criteria |
| 6 | `docs/06-screens-and-flows.md` | Every screen (S-xx): route, content, actions, states, UI copy |
| 7 | `docs/07-data-model.md` | Database schema, constraints, functions, views, RLS, seed data |
| 8 | `docs/08-architecture-and-technical-requirements.md` | Stack and reasons, folder structure, RPC and server-action catalogue, auth, security, integrations, jobs, non-functional requirements, testing, environments |
| 9 | `docs/09-build-plan.md` | Milestones (M-xx) with tasks and "done when" checks |
| 10 | `docs/10-decisions-open-questions-assumptions.md` | Decision log, open questions, assumptions, suggestions not in scope |
| A | `docs/appendix-legacy-excel.md` | Background only: the old Excel files and the mistakes the app must prevent |

## When two documents seem to disagree
Order of authority, highest first:
1. `03-business-rules`
2. `04-roles-and-permissions`
3. `07-data-model`
4. `06-screens-and-flows`
5. `05-features-and-user-stories`
6. `08` and `09`

Even when this order resolves it, **report the conflict** instead of silently picking one.

## Markers
- **`> OPEN QUESTION (OQ-n):`** Not decided yet. Implement exactly the stated temporary behaviour, keep it configurable, and invent nothing beyond it.
- **`> ASSUMPTION (AS-n):`** Decided by the author without the gym owner's confirmation. Implement it as written. Every assumption is listed in doc 10.

## ID conventions
| ID | Meaning |
|---|---|
| BR-xxx | Business rule |
| F-xx | Feature |
| US-xx.y | User story |
| S-xx | Screen |
| M-xx | Milestone |
| D-xx | Decision |
| OQ-n | Open question |
| AS-n | Assumption |
| SG-n | Suggestion |

## Language conventions
- Documents are in English.
- The UI is in **Montenegrin, Latin script, ijekavica** (e.g. "mjesečna", "uplata").
- Code, database identifiers and comments are in English.

## Development (M-00)

Node.js 22+ and Google Chrome are required. The app runs locally against **hosted Supabase** (D-56). Docker is not used.

1. Run `npm ci`.
2. Copy `.env.example` to `.env.local` if the local file does not already exist. Set `NEXT_PUBLIC_SUPABASE_URL` to `https://paakuxiufzmdobpooqdi.supabase.co` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the project's public anon/publishable API key. Keep secret keys in `.env.local` only.
3. For database tests, set `DATABASE_URL` to the project's TLS Postgres connection URI from **Connect**, preferably the session pooler on port 5432. URL-encode any special characters in the password. Do not share the URI in chat or commit it. Supabase issues its Postgres certificate from a private root CA that Node does not trust by default, so the public certificate is committed at `scripts/certs/supabase-prod-ca-2021.crt` and the runner verifies the connection against it. Set `DB_TEST_VERBOSE=1` to print Postgres error messages while debugging a failing database test; leave it unset otherwise.
4. Run `npm run dev`, then open `http://localhost:3000`. The root sends you to the login screen (S-01) and, after login, to your role home (doc 06 §2). `STAFF_EMAIL_DOMAIN` must be a bare domain such as `staff.kpfitness.internal`, because a receptionist username is mapped to `<username>@<domain>` to sign in (AS-4).

Checks: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:db`, `npm run test:e2e`. Also run `npm run build` to verify the production bundle. Browser tests use installed Google Chrome at desktop and mobile viewport sizes. Database tests fail explicitly if credentials are missing, use pgTAP inside transactions, and roll back each test file. Browser tests create their own synthetic gym and staff through the service role and delete them again afterwards, so the real gym data is never touched (doc 08 §10).

## Database (M-01)

Migrations live in `supabase/migrations/NNNN_description.sql` and are applied to the hosted project. An applied migration is never edited; every change is a new numbered file.

1. `npm run db:push` applies pending migrations. It reads `DATABASE_URL` from `.env.local` and runs `supabase db push --db-url`, so no `supabase login` or project link is needed; add `-- --dry-run` to list what would run. Inspect the schema before pushing, and never run `supabase db reset` on the hosted project.
2. `npm run seed` applies `supabase/seed.sql` (the gym and its BR-012 settings). The Supabase CLI runs seed files only during a local reset, which is forbidden here, so this applies the file over the same verified TLS connection. Every statement is idempotent.
3. `npm run seed:owner` creates the owner Auth user and staff row from `SEED_OWNER_PASSWORD` (doc 07 §7 step 8). It is idempotent: an existing Auth user or staff row is left untouched and no password is overwritten.

`npm run db:link` still exists for the authenticated CLI workflow (`npx supabase login` first), but it is not required.

Technical references: [Next.js CSP](https://nextjs.org/docs/app/guides/content-security-policy), [Supabase server-side clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Supabase pgTAP testing](https://supabase.com/docs/guides/database/testing).

## Jobs and backups (M-11)

The four scheduled jobs of doc 08 §8 run behind `POST /api/jobs/<name>` with the header
`x-cron-secret`, and `pg_cron` posts to them every five minutes. The schedule is created
by migration `0019` and reads `APP_URL` and `CRON_SECRET` from Supabase Vault at each run,
so neither value is ever committed. Until both secrets exist the schedule does nothing,
which is what makes it harmless in development.

- `npm run jobs:secrets` writes `APP_URL` and `CRON_SECRET` from `.env.local` into the
  Vault of the hosted project. It refuses a localhost address, because Supabase cannot
  reach this machine.
- `npm run jobs:run -- nightly | morning | weekly-backup | email-retry` calls one handler
  by hand. **In development this sends real email**, because `.env.local` holds a working
  Resend key: the morning job mails real members. The automated tests never can — the
  browser tests run with a key Resend rejects, and the backup test runs with `EMAIL_FROM`
  unset.
- `npm run restore:test -- --file <backup.zip>` restores a weekly backup into the
  **separate, empty** project named by `RESTORE_TEST_DATABASE_URL`. It refuses to run when
  that host matches `DATABASE_URL`, so it can never be pointed at the gym (D-56). Without
  `--file` it downloads the newest backup from Storage.

## Production deployment

Everything below is done once, in this order. Nothing here is automated: each step needs
an account only the owner has.

### 1. Supabase

1. `npm run db:push` applies every pending migration to the production project.
2. `npm run seed` creates the gym row and the BR-012 settings; `npm run seed:owner` and
   `npm run seed:admin` create the two accounts of D-58. All three are idempotent.
3. In **Authentication → SMTP Settings**, enter the Resend SMTP credentials, so the
   password-reset mail of US-01.2 leaves from the verified domain rather than from
   Supabase's shared sender, which is rate-limited and often filtered.
4. In **Authentication → URL Configuration**, set **Site URL** to the deployed address
   (`https://teretana-recepcija.vercel.app`). The reset link below is built from it.
5. In **Authentication → Emails → Templates → Reset Password** (D-69), set the subject
   `KP Fitness — nova lozinka` and the body below. The link carries a token hash, so it
   works in any browser; Supabase's default `{{ .ConfirmationURL }}` works only in the
   browser that asked for the reset. Deploy the application first, since only
   `/auth/callback` from D-69 on understands this link.

   ```html
   <h2>Nova lozinka</h2>
   <p>Zatražena je nova lozinka za vaš nalog u aplikaciji KP Fitness.</p>
   <p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery">Postavite novu lozinku</a></p>
   <p>Link se može iskoristiti samo jednom. Ako niste tražili novu lozinku, zanemarite ovaj email.</p>
   ```
6. In **Authentication → Sign In / Providers**, turn off **Allow new users to sign up**.
   Accounts are created only on S-23 through the admin API, which this setting does not
   block (D-01, doc 08 §4).
7. Confirm that the extensions `pg_cron` and `pg_net` are enabled (migration `0019` does
   this) and that `cron.job` holds one row named `kp-fitness-jobs` on `*/5 * * * *`.

### 2. Resend

1. Add the domain `stamenkovicc.com` and create the DNS records Resend asks for (SPF and
   DKIM, and the return-path record).
2. Wait until the domain shows **Verified**. Until it does, every send fails and the shift
   reports are recorded as `failed` (BR-118).
3. Create an API key with send permission for that domain; it becomes `RESEND_API_KEY`.

### 3. Vercel

1. Import the repository and set the environment variables of doc 08 §11 for the
   Production environment:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`
   (`noreply@stamenkovicc.com`), `BACKUP_ZIP_PASSWORD` (at least 20 random characters),
   `CRON_SECRET` (at least 32 random characters), `APP_URL` (the deployed address),
   `STAFF_EMAIL_DOMAIN`. `DATABASE_URL` and the seed passwords belong to the developer's
   machine and must **not** be set on Vercel.
2. Deploy, and check that `https://<app>/login` answers. `vercel.json` pins the functions
   to `fra1`, next to the Supabase project in `eu-central-1`; the response header
   `X-Vercel-Id` must read `…::fra1::…`. Pick the region closest to the database if the
   project ever moves.
3. Store `BACKUP_ZIP_PASSWORD` in a password manager. It is never sent by email and there
   is no way to recover a backup without it (doc 08 §9).

### 4. Turn the jobs on

1. Set `APP_URL` in `.env.local` to the deployed address and run `npm run jobs:secrets`.
2. Within five minutes, `select * from cron.job_run_details order by start_time desc` on
   the production project shows `succeeded`, and the Vercel logs show four `POST
   /api/jobs/...` requests answering 200.
3. `POST https://<app>/api/jobs/nightly` without the header must answer **401**.

### 5. Smoke test

Sign in as the owner, scan or search one member, and close a shift. The shift report must
arrive by email, and S-19 must show its status as `poslato`.

### 6. Restoring a backup

The weekly backup is an AES-256 ZIP in the private `backups` bucket, also emailed to
`backup_emails`. To restore it into an empty project — **never into the working project**
(D-56):

1. Create a new Supabase project and put its connection URI and keys in `.env.local` as
   `RESTORE_TEST_DATABASE_URL`, `RESTORE_TEST_SUPABASE_URL` and
   `RESTORE_TEST_SERVICE_ROLE_KEY`.
2. Run `npm run restore:test -- --file <backup.zip>`. The script applies every migration,
   decrypts the ZIP with `BACKUP_ZIP_PASSWORD`, empties the target, loads each CSV with
   the triggers disabled and the parents before the children, resets the identity
   counters, and prints a row-count comparison against `manifest.json`. It exits non-zero
   on any mismatch.
3. Supabase Auth is not part of the backup, so the script creates a placeholder
   `auth.users` row for every staff member. Their passwords must be set again from S-23
   before anyone can sign in to the restored project.
