# M-01 database foundation — 18.09.2026

Status: complete. Migrations are applied to the hosted project, the gym and owner are seeded, and all five checks pass. M-02 has not started.

## Built

### Migrations (applied, never reset)

- `0001_foundation.sql` — extensions `pgcrypto`, `unaccent`, `pg_trgm`; all eleven enums of doc 07 §2; tables `gyms`, `gym_settings`, `staff`, `shifts`, `member_counters`, `audit_log`, `job_runs` with every constraint from doc 07 §3, including the BR-110 partial unique index `shifts_one_open_per_gym` and the `staff` check that a receptionist has a username and no email (D-05).
- `0002_helpers_audit_rls.sql` — the six helper functions of doc 07 §4 (`current_staff`, `my_role`, `my_gym`, `gym_today`, `gym_local_date`, `open_shift`), the BR-096 audit trigger (`audit_row` plus `audit_actor`) on `staff` and `gym_settings`, the doc 07 §6 SELECT policies, and the doc 04 §2 write lockout.

Row level security is enabled on all seven tables. `member_counters` deliberately has no policy: it is internal to `register_member` (BR-042), so no staff role can read or write it. The write lockout is belt and braces — there are no INSERT, UPDATE or DELETE policies, and `anon` and `authenticated` additionally have those privileges revoked, so a future policy mistake still cannot open a direct write path.

### Seed and scripts

- `supabase/seed.sql` — seed step 1: the gym `KP Fitness` and its BR-012 settings defaults. Idempotent.
- `scripts/seed-owner.ts` — seed step 8: the owner Auth user `matija.vojinovic@eurotehnikamn.me` and the matching `staff` row with `must_change_password = true`. Idempotent: an existing Auth user or staff row is left untouched and no password is overwritten.
- `scripts/db-push.mjs`, `scripts/seed.mjs`, `scripts/pg-client.mjs` — the runners described under "Deviations" below.

### Tests

`supabase/tests/0001_foundation.test.sql`, 22 pgTAP assertions inside a rolled-back transaction:

- BR-001: `gym_today` matches the Podgorica date; `gym_local_date` puts 23:30 UTC in winter on the next local day, 00:30 UTC on the same day, and 22:30 UTC in summer on the next day (the DST boundary moves).
- BR-110: `open_shift` returns the gym's single open shift.
- BR-096: every `staff` insert is audited, and a `gym_settings` change is audited with both the old and the new value.
- Doc 07 §6 per role: a receptionist sees only their own staff row, sees the open shift plus their own shifts but not another receptionist's closed shift, and reads no audit log; a manager sees the gym's staff and only the open shift; an owner sees every shift and reads the audit log.
- Doc 04 §2: `authenticated` cannot insert `staff` or update `gyms` (both raise `42501`), and `member_counters` is unreadable.
- Doc 08 §5: a deactivated account raises `E_NOT_STAFF`.

## Verification

| Check | Result |
|---|---|
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run test` | Pass: 42 tests, four files |
| `npm run test:db` | Pass: 25 assertions across two files on hosted Postgres 17.6 |
| `npm run test:e2e` | Pass: four checks on Google Chrome, 1366×768 and 375×812 |
| `npm run build` | Pass |

Post-apply inspection of the hosted project confirmed: seven tables, eight functions, eleven enums, RLS enabled on every table, six SELECT policies, the gym seeded with `Europe/Podgorica` and EUR, the BR-012 settings defaults exact (5.00 / 80.00 / 3 / 23:00 / 120 / `mihajlo@stamenkovicc.com`), one active owner with `must_change_password = true`, two audit rows with `changed_by = null` (the seeds run as the service role, which has no staff session, as designed), and migration history rows `0001` and `0002`.

Both seeds were run twice; the second run changed nothing.

## Deviations, all reported before they were made

1. **Helper functions are `security definer`.** Doc 07 §4 specifies only `stable` and `set search_path = public`. Two things require definer rights: the `staff` SELECT policy calls `my_role()`, and an invoker-rights helper reading `staff` would re-enter that same policy; and `gym_today()` must resolve a gym's date for scheduled jobs that have no staff session. The helpers only read identity and dates — they open no write path, which the pgTAP write-lockout assertions confirm.
2. **`pg_cron` and `pg_net` are not created yet.** Doc 07 §3 lists them in the schema block, but nothing in M-01 uses them and neither is installed on the project. They belong with the scheduled jobs in M-11.
3. **`npm run db:push` uses `--db-url`, not `--linked`.** The linked path needs an interactive `npx supabase login`, which is not available here. The wrapper reads `DATABASE_URL` from `.env.local` and passes it to the same CLI command, so the CLI still owns `supabase_migrations.schema_migrations`. A later `supabase db push --linked` will see both migrations as applied.
4. **`npm run seed` is a new script.** The Supabase CLI applies `seed.sql` only during a local `db reset`, which D-56 forbids, so the file is applied over the same verified TLS connection the pgTAP runner uses.

## Notes and new questions

- The first wrapper version spawned the CLI through `npx`, which Windows refuses to run without a shell; the failure was silent and pushed nothing. It now invokes the CLI's own JS entry point with the current Node binary, and a spawn error is reported instead of swallowed.
- A signed-in user with no active staff row makes any policy that calls `my_role()` raise `E_NOT_STAFF` rather than return zero rows. That is the correct coded error for this state, and M-02 should route it to the login page rather than surface it as an unexpected error.
- The pre-existing `ensure_rls` event trigger on the project also enables RLS on new public tables. The migrations still enable it explicitly, so the intent is visible in the migration rather than dependent on project configuration.
- No open questions from the specification arose in this milestone.
