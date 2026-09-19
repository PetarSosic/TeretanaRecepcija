# M-11 Scheduled jobs and backup (F-25, F-26, F-28) — 19.09.2026

Status: complete. All five checks pass, and the production build is clean. M-12 has not started.

## Built

### Migration `0018_jobs.sql`

- **`expiry_notifications` and `backup_runs`** exactly as doc 07 §3 defines them, plus one
  index for the newest run of a gym. RLS follows doc 07 §6: the owner and the admin read
  their own gym's rows, a manager and a receptionist read nothing, and nobody writes.
- **The private `backups` bucket** (doc 07 §6) has **no policy at all**: it holds members'
  personal data and the readable staff passwords of D-59, so only the service role — the
  job and the developer — ever reaches it.
- **`jobs_due(job)`** (doc 08 §8): the gyms whose local time has passed the job's schedule
  today and which have not run it yet. Nightly uses `auto_close_time`, morning 09:00,
  backup Sunday from 03:00 (AS-21) and only while fewer than three attempts have been made
  that day (BR-163).
- **`job_nightly(gym)`** (BR-082, BR-116): claims the `job_runs` row first, so two handlers
  on the same minute leave exactly one with work; the loser gets `ran: false`. Then every
  open visit is checked out **at the gym's close time**, not at the moment the handler
  happens to run, and the open shift is closed as `auto` with no counted cash and nobody as
  the closer. The answer names the shift, which the handler then reports on (BR-117).
- **`job_expiring_memberships(gym)`** (BR-160): the memberships ending in
  `expiry_reminder_days` days, minus anonymized members, minus members without an email,
  minus memberships already renewed — a later non-voided membership sharing a visit type,
  which is what BR-052 calls comparable — and minus anything that already has a
  notification row. The rows are written as `pending` in the same statement that selects
  them, so a crash before the send can never produce a second reminder.
  **`record_expiry_notification`** settles each one.
- **`start_backup_run` / `finish_backup_run`** (BR-163): the attempt row is the lock as
  well as the record. A success also writes the `job_runs` row, which is what ends the job
  for the day; a failure leaves it unwritten so the next five-minute run tries again, to a
  maximum of three.
- **`backup_tables`, `backup_table_rows`** (and, in `0019`, `backup_table_columns` and
  `backup_schema_version`): the export, one table at a time, filtered to one gym.
- **`shifts_pending_email()`** (BR-118): failed reports with fewer than five attempts whose
  last attempt is at least fifteen minutes old.
- **`record_shift_report` now stamps `emailed_at` on a failure too.** M-10 stamped it only
  on a send; the retry rule needs to know when the last attempt was. For a sent report the
  meaning is unchanged.
- Every job function is revoked from `authenticated` and granted to `service_role` alone.

### Migration `0019_cron.sql`

- `pg_cron` and `pg_net` are enabled on the hosted project.
- **`run_scheduled_jobs()`** posts to `APP_URL/api/jobs/<name>` for all four jobs with the
  `x-cron-secret` header. Both values are read from **Supabase Vault at each run**, exactly
  as doc 08 §11 requires, so no secret is in the repository. While they are unset the
  function returns immediately, which is what makes the schedule harmless in development.
- **`cron.schedule('kp-fitness-jobs', '*/5 * * * *', …)`** is live on the project now. It
  has been running every five minutes since the migration and succeeds as a no-op;
  `cron.job_run_details` shows no errors.

### Handlers and pipeline

- **`app/api/jobs/[job]/route.ts`**: one route for all four names. The secret is compared in
  constant time; missing, wrong, or a GET gets 401 with no hint about what exists, and an
  unknown job gets 404. `maxDuration` is 300 s for the backup.
- **`lib/jobs.ts`**: `runNightly`, `runMorning`, `runWeeklyBackup`, `runEmailRetry`. The
  nightly one hands the closed shift to M-10's `deliverShiftReport`; the retry job hands it
  the same pipeline, so a resent report follows exactly the path the first one did.
- **`lib/backup.ts`** (BR-163): every table of the gym to CSV (UTF-8, quoted fields, CRLF,
  ISO dates and timestamps straight from `to_json`), a `manifest.json` with the tables,
  their row counts, the schema version and the export time, all of it in one **AES-256**
  ZIP, uploaded to `backups/<gym>/kpfitness-backup-<date>.zip`, pruned to the newest eight,
  and emailed to `backup_emails` — attached up to 35 MB, and otherwise replaced by the
  "too large" note (AS-23).
- **`scripts/zip-aes.mjs`**: a reader for the WinZip AES container, used by the tests and by
  the restore script. Node cannot open such a ZIP on its own, and without a reader nothing
  could prove that the backup is really encrypted and really openable.

### Screens

- **S-27** now ends with the read-only line BR-163 asks for:
  `Posljednja rezervna kopija: <dd.mm.yyyy HH:mm> – uspješno`, or `– neuspješno: <greška>`,
  or `Posljednja rezervna kopija: Još nije napravljena`. It shows the newest attempt,
  whichever way it went.

## A bug this milestone found and fixed

**The proxy would have swallowed every cron call.** `proxy.ts` redirects any request
without a session to `/login`, and pg_cron posts with no cookies at all. On production the
jobs would have been redirected to the login page and never run — silently, with pg_cron
recording success every time. `/api/jobs` is now a public route in the proxy, and the
handler's `CRON_SECRET` check is what authorises those calls. The E2E test for the 401
is what exposed it: the call came back 200 with the login page.

## Also completed here: BR-116's last sentence

BR-116 ends with "the receptionist's next request redirects to the login page", which had
no implementation. `app/(app)/layout.tsx` now ends the session of a receptionist whose gym
has no open shift and sends them to `/login?auto=1`, where M-02's notice
`Smjena je automatski zaključena.` was already waiting. A receptionist at the S-02 gate
always has an open shift to take over, so the gate is not caught by it.

## Verification

| Check | Result |
|---|---|
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run test` | Pass: 110 tests (16 new, including the live backup against the hosted project) |
| `npm run test:db` | Pass: 373 assertions in twelve files (43 new in `0011_jobs.test.sql`) |
| `npm run test:e2e` | Pass: 100 checks (8 new) |
| `npm run build` | Pass |
| `npm run restore:test` | Pass: every table matches the manifest |

**The "done when" list.**

- **pgTAP E20:** two open visits and one open shift. Both visits end at the gym's 23:00
  with `auto_checkout`, nobody recorded as checking them out; the shift is `auto`, closed
  at 23:00, with no counted cash and no closer. The second run of the day answers
  `ran: false`, leaves exactly one `job_runs` row and reopens nothing.
- **A handler call without the secret returns 401:** all four names, with no header and
  with a wrong one, and a GET as well.
- **One email per qualifying membership:** the pgTAP fixture offers five candidates —
  one that qualifies, one anonymized, one already renewed, one voided, one ending in five
  days — and exactly one reminder comes back, for the right membership, with exactly one
  notification row. The handler's own loop is covered by unit tests: one `sendEmail` per
  reminder, each recorded, and a rejected send neither stops nor skips the rest.
- **With `EMAIL_FROM` unset, reminders are skipped and logged:** `sendEmail` returns
  `skipped` and the row is recorded as `not_sent` (BR-161).
- **US-28.1, against the hosted project** (`tests/integration/backup.test.ts`), on a test
  gym filled with a shift, cards, a member, a membership, a payment, a visit, an expense, a
  stock movement and a catalogue:
  - **AC1:** the once-a-day guard and the three attempts are proved in pgTAP.
  - **AC2:** the ZIP holds one CSV per table plus `manifest.json`; every table's row count
    in the manifest equals the lines in its CSV; the ZIP opens with `BACKUP_ZIP_PASSWORD`
    and the wrong password is rejected (by the format's own verification value, so no
    corrupt output is possible). No other gym's rows appear in it.
  - **AC3:** eight backups were placed in the bucket first, the run made the ninth, and
    afterwards exactly eight are there with the oldest gone.
  - **AC4:** the recipients come from `backup_emails` and the subject and body match
    doc 08 §7, including the "too large" wording. **Not verified live:** no test may mail a
    gym's data, so the run had `EMAIL_FROM` unset and nothing was sent. The first real
    backup email will go out on the first Sunday after go-live.
  - **AC5:** a failed run is retried up to three times (pgTAP), and S-27 shows the status
    line (E2E, for a success, a failure with its reason, and nothing yet).
- **Restore test:** `npm run restore:test -- --file <zip>` applied all nineteen migrations
  to the **separate, empty** hosted project from `RESTORE_TEST_DATABASE_URL`, decrypted the
  backup, loaded every CSV and compared the counts. All 28 tables matched
  (34 rows; `audit_log` 11, `members` 1, `memberships` 1, `payments` 1, `visits` 1,
  `staff` 1, `staff_credentials` 1, `cards` 2, and so on). The script **refuses to run** if
  its target host is the same as `DATABASE_URL`'s, so it can never be pointed at the gym.
  Its header lists the procedure step by step, ready for the M-13 production guide.

## Interpretations — please confirm

- **`emailed_at` means "last attempt".** BR-118's fifteen-minute rule needs a time and
  doc 07 gives no other column, so a failed attempt now stamps it too. A sent report is
  unaffected: for it the last attempt *is* the send.
- **`staff_credentials` is in the backup.** BR-163 says every table of doc 07 §3, and
  that table is one of them (doc 07 line 78). It means the ZIP contains staff passwords in
  readable form, which is why `BACKUP_ZIP_PASSWORD` must be long and random and why the
  bucket has no policy. Say the word and I will leave the table out of the export instead.
- **A reminder is not retried.** Doc 08 §8 gives a retry job for shift reports only, and
  BR-160 picks a membership on exactly one day, so a failed reminder is recorded as failed
  and that is the end of it. The owner can see those rows.
- **The backup covers `public` in full**, which is every table of doc 07 §3 plus the ones
  added since. Supabase's own `auth`, `storage` and migration schemas are not the gym's
  data and are not exported; a restore therefore creates placeholder `auth.users` rows and
  the staff passwords have to be set again, which the restore script does and documents.
- **The live backup test calls `createBackup` rather than the handler.** The handler acts
  only on a gym whose local day is Sunday after 03:00, and no timezone on earth satisfies
  that for most of the week, so a handler-driven test would fail on five days out of seven.
  What the handler adds — who is due, the attempts, the once-a-day guard — is in pgTAP.
- **New npm scripts:** `jobs:secrets` (write `APP_URL` and `CRON_SECRET` into Vault),
  `jobs:run -- <job>` (call one handler by hand), `restore:test`.
- **New dependencies:** `archiver` 7.0.1 and `archiver-zip-encrypted` 2.0.0, both pinned.
  They are pure JavaScript, so the backup needs no binary in the serverless function.

## Before go-live

- **The jobs do not run yet.** `run_scheduled_jobs()` finds no Vault secrets and returns.
  After the first deployment, set `APP_URL` to the deployed address and run
  `npm run jobs:secrets`; the schedule is already in place and will start working within
  five minutes. `npm run jobs:secrets` refuses a localhost `APP_URL`, because Supabase
  cannot reach this machine.
- **`BACKUP_ZIP_PASSWORD` must be at least 20 random characters** (doc 08 §11) and must be
  kept somewhere other than the backup email — the email deliberately does not carry it.
- **Take care with `npm run jobs:run -- morning` in development.** `.env.local` has a real
  `RESEND_API_KEY` and `EMAIL_FROM`, so that command sends real reminders to real members.
  The automated tests never can: the Playwright server runs with a key Resend rejects, and
  the backup test runs with `EMAIL_FROM` unset.
- **Syncing the other database:** migrations `0018` and `0019` must be applied with
  `npm run db:push`, and `npm install` is needed for the two new packages.
