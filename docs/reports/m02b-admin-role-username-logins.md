# M-02b admin role and username logins (D-57 to D-60) — 18.09.2026

Status: built and verified, except the admin account itself, which needs your email and password before it can be seeded. All five checks pass, in development and against the production build.

## What you decided, and where it is written down

Your instruction changed the login model, so the specification was amended first and the code follows it. New decisions in `docs/10`:

- **D-57** — every staff account signs in with a username, whatever its role. The exceptions are the admin, who signs in with an email so a forgotten admin password can be reset, and Matija's seeded owner account, which keeps its email login. D-05 is struck through and marked superseded.
- **D-58** — a fourth role, `admin`, above owner. It has every owner permission and is the only role that may create, edit, deactivate or set passwords for owners and other admins.
- **D-59** — staff passwords are stored in readable form beside the bcrypt hash, in an admin-only table.
- **D-60** — nobody may deactivate their own account, and the last active owner or admin cannot be deactivated.

Also amended: doc 04 (the matrix, new rows P-06 and P-07), doc 05 (US-01.1 to US-01.3), doc 06 (S-23 and the navigation), doc 07 (the enum, the staff identity constraint, `staff_credentials`, the RLS table), doc 08 (§4 and two new error codes), doc 09 (this milestone).

## Built

**Migrations.** `0003` adds the `admin` enum value alone, because Postgres cannot use a new enum value in the transaction that creates it. `0004` replaces the staff identity constraint with "exactly one login identity, and an admin must have an email", creates `staff_credentials`, and widens the shift, audit-log and job-run policies so an admin reaches what an owner reaches.

**Stored passwords (D-59).** `staff_credentials` is readable by the admin of the same gym and by nobody else — not the owner, not even for their own row. No role can write it; only the server-side actions do. It is deliberately **not** audited, because `audit_log` is readable by owners and an audit row would copy the passwords into it. Every path that sets a password writes this copy: creating a user, an admin or owner resetting someone's password, and a user changing their own password. Without that last one the admin would read a password that no longer works.

**S-23.** For an admin only, a `Lozinka` column, masked as `••••••••` until [Prikaži] is pressed per row. The create form asks for a username for every role and an email for an Administrator. Owner and admin rows show no actions to anyone but an admin, and no row offers [Deaktiviraj] to its own owner.

**Guard (D-60).** `setStaffActive` refuses to deactivate the caller's own account (`E_SELF_DEACTIVATE`) or the last active owner or admin (`E_LAST_ACCOUNT`). The button is hidden for your own row as well, so the rule is visible before it is enforced.

## Verification

| Check | Result |
|---|---|
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run test` | Pass: 53 tests |
| `npm run test:db` | Pass: 37 assertions, three files (12 new) |
| `npm run test:e2e` | Pass: 26 checks, in development and against `next start` |
| `npm run build` | Pass |

New pgTAP assertions: an account cannot have both a username and an email, nor neither; an admin without an email is rejected; an owner may sign in with a username; the admin reads every stored password of the gym and the value itself; an owner, a manager and a receptionist each read none; no role can write them.

New browser checks: an owner signs in with a username and lands on Finansije; the admin sees a masked password and reveals it, while the owner's own screen has no such column at all; only the admin is offered the Vlasnik and Administrator roles, and a new owner is asked for a username; the admin's own row offers no [Deaktiviraj]; deactivating the last active owner is refused and the account stays active.

After the full run the database holds only `KP Fitness` and Matija's row — the fixtures clean up after themselves.

One run failed once with `JWT issued at future` while creating a test gym, and passed on every run since. That is clock skew between this machine and Supabase's auth service, not a defect; measured skew is now under a second.

## What is left for you

1. **Seed your admin account.** Fill `ADMIN_EMAIL`, `ADMIN_PASSWORD` (at least 8 characters) and optionally `ADMIN_NAME` in `.env.local`, then run `npm run seed:admin`. I did not invent an address for you. The script is idempotent and stores the password so you can see it on S-23.
2. **Matija's stored password is empty** (`Nije sačuvana` on S-23). His account was created before D-59 existed and the seed never overwrites an existing account. Set a new password for him from S-23 once and it will be stored from then on.

## Two things worth your attention

1. **The backup will contain the readable passwords.** BR-163 exports every table into the weekly ZIP that is emailed to you. AS-22 encrypts that ZIP with AES-256 and keeps the password out of email, so it is not open in the clear — but when M-11 builds the backup, this is the moment to confirm you still want `staff_credentials` in the export.
2. **`STAFF_EMAIL_DOMAIN` now matters for every role**, not just receptionists, since managers and owners also get internal `<username>@staff.kpfitness.internal` addresses. It is set correctly.
