# M-00 project setup — 18.09.2026

Status: complete. All five checks pass against the hosted project. M-01 has not started; it awaits approval.

## Built

- Next.js App Router, strict TypeScript, Tailwind and shadcn-compatible component configuration with a Montenegrin placeholder page.
- Browser, server and server-only administrative Supabase client factories. The project URL is configured locally as `https://paakuxiufzmdobpooqdi.supabase.co`; no authenticated connection or database mutation has occurred.
- ESLint, Prettier, Vitest, Playwright and a pgTAP runner that connects directly to hosted Postgres over TLS, runs SQL test files in transactions and rolls them back.
- Per-request CSP nonces, frame protection, referrer policy, MIME sniffing protection and no-store page responses.
- BR-002/003 date, time, duration and exact decimal money helpers; BR-041 phone normalization; the UI dictionary and coded-error mapping.
- Environment template, ignored local credentials and Excel files, lockfile and hosted Supabase CLI configuration.
- Hosted development instructions in README and the specification (D-56). No Docker was installed or used.

## Verification

| Check | Result |
|---|---|
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run test` | Pass: 42 tests, four files |
| `npm run test:db` | Blocked: `DATABASE_URL` is unset; command exits unsuccessfully rather than skipping |
| `npm run test:e2e` | Pass: four checks on Google Chrome, 1366×768 and 375×812; tested production and development servers |
| `npm run build` | Pass |
| Placeholder visual review | Desktop and phone screenshots inspected; no horizontal overflow or clipped text |
| `npm run dev` | Placeholder responds with HTTP 200 |

Browser tests cover the placeholder, language, layout, response security headers, distinct CSP nonces and nonce-bearing HTML. They do not claim coverage of gym workflows that are scheduled for later milestones.

## Decisions and limits

- D-56 supersedes the original local Docker workflow. `npm run test:db` uses the same pgTAP SQL assertions through a Node/Postgres runner instead of the container-based CLI test command.
- Next.js 16 uses `proxy.ts` for request interception. This milestone only adds CSP there; authentication and shift enforcement remain in their scheduled milestones.
- The Supabase CLI is initialized but not authenticated or linked. The public project reference alone is insufficient to inspect its existing schema or run database tests.
- Add the public API key to `NEXT_PUBLIC_SUPABASE_ANON_KEY` and a TLS Postgres connection URI to `DATABASE_URL` in `.env.local`. Server credentials and owner seed credentials will be needed in later milestones. Secrets must stay out of chat and source control.
- After credentials are available, inspect the hosted project and run the pending database checks before marking M-00 complete. Existing application data must not be reset.
- Previously identified later-milestone issues (table dependency ordering and bar-sale correction fields) remain for reconciliation before those implementations.

---

## Addendum — 18.09.2026: verification completed

Credentials for the hosted project are now present in `.env.local`, so the blocked checks were run and M-00 is complete.

### Fixes required to connect
- **TLS trust.** Supabase serves Postgres from its own private root CA ("Supabase Root 2021 CA"), which Node does not trust, so every connection failed with `SELF_SIGNED_CERT_IN_CHAIN`. The official public certificate was downloaded over a publicly verified HTTPS connection and committed at `scripts/certs/supabase-prod-ca-2021.crt`; `scripts/test-db.mjs` now passes it as the CA and keeps `rejectUnauthorized: true`. TLS verification was not weakened.
- **Pooler port.** `DATABASE_URL` pointed at the transaction pooler (port 6543). It was changed in `.env.local` to the session pooler (port 5432) as README step 3 and doc 08 §11 prefer, because pgTAP fixtures in later milestones rely on session-level behaviour. Both ports were verified to connect; only the port changed.
- **Diagnostics.** The runner suppressed all error text, which made the TLS failure undiagnosable. It still suppresses by default; `DB_TEST_VERBOSE=1` now prints the Postgres message for local debugging only.

### Verification

| Check | Result |
|---|---|
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run test` | Pass: 42 tests, four files |
| `npm run test:db` | Pass: `0000_foundation.test.sql`, 3 assertions, on hosted Postgres 17.6 |
| `npm run test:e2e` | Pass: four checks on Google Chrome at 1366×768 and 375×812 |

### Hosted project inspection (read-only, D-56)

The project `paakuxiufzmdobpooqdi` is empty and safe for M-01 migrations. Nothing was written.

- `public`: no tables, views or enums; one pre-existing function, `rls_auto_enable`.
- No migration history: `supabase_migrations.schema_migrations` does not exist.
- `auth.users`: 0 rows. No storage buckets.
- Extensions: `pg_stat_statements`, `pgcrypto`, `uuid-ossp`, `supabase_vault`, `plpgsql`. **`pg_cron` and `pg_net` are not installed** and will be needed in M-11.
- An event trigger `ensure_rls` auto-enables row level security on every new `public` table. M-01 migrations will still enable RLS explicitly so the intent is visible in the migration.
- Server `TimeZone` is `UTC`, which is why BR-001 requires `gym_today(gym_id)` rather than the server date.
