# M-02 authentication and staff accounts (F-01) — 18.09.2026

Status: complete. All five checks pass, in development and against the production build. M-03 has not started.

## Built

### Login and sessions (S-01, doc 08 §4)

- One field accepts a username or an email (US-01.1 AC2): input with `@` is an email, input without it is a receptionist username mapped to `<username>@STAFF_EMAIL_DOMAIN` (AS-4). No lookup happens before the sign-in, so the form cannot be used to discover accounts.
- Every failure — wrong password, unknown account, deactivated account — answers with the single message `Pogrešno korisničko ime/email ili lozinka.` (AC3, AC4).
- `proxy.ts` now refreshes the Supabase cookie session on every request, signs out staff whose row is missing or inactive, and holds anyone with `must_change_password` on S-01b. `(app)/layout.tsx` repeats the check on the server, so no page renders for a user who may not open it (doc 04 §2 point 3).
- `?closed=1` and `?auto=1` render the S-01 notices; the shift logic that sets them is M-05 and M-10.

### Passwords

- S-01b (`/change-password`) asks only for the new password and its repeat at first login, because the temporary password was just used (AS-18). The same route asks for the current password when it is reached from the user menu (US-01.4), so there is one screen rather than two.
- "Zaboravljena lozinka?" opens a dialog on S-01. An email belonging to an active owner or manager gets a Supabase reset link; a username answers `Recepcioneru lozinku mijenja vlasnik ili menadžer.` (US-01.2 AC2); anything else gets the same neutral confirmation as a real address. `/auth/callback` exchanges the reset code for a session and only ever redirects in-app.

### Staff administration (S-23)

- `/settings/users` lists Ime, Korisničko ime/Email, Uloga, Aktivan and Kreiran, with [Novi korisnik], [Uredi], [Nova lozinka] and [Deaktiviraj/Aktiviraj].
- `createStaffUser`, `updateStaffUser`, `setStaffPassword` and `setStaffActive` run server-side with the service-role key after checking the caller (doc 08 §6). P-04 blocks receptionists; AS-5 and P-03 mean a manager never sees the Vlasnik option, never gets actions on an owner's row, and is refused with `E_FORBIDDEN` if the request is made anyway.
- Deactivating sets `is_active = false` and bans the Auth user, so the session is rejected on the next request (AC5).
- A failed creation never leaves an Auth user without its staff row: the Auth user is deleted again.

### Shell and shared components

- Header with gym name, role-based navigation (doc 06 §2) and a user menu with Promijeni lozinku and Odjava. The shift badge belongs to M-05 and is not built.
- `components/ui`: button, input, label, select, table and a Radix dialog that traps focus and closes on Esc (D-47, doc 06 §1). `components/common`: the toast region and the field- and form-level error components. Warnings carry an icon, never colour alone.

## Verification

| Check | Result |
|---|---|
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run test` | Pass: 52 tests, five files (10 new, on the auth and staff schemas) |
| `npm run test:db` | Pass: 25 assertions, unchanged from M-01 |
| `npm run test:e2e` | Pass: 16 checks, Chrome at 1366×768 and 375×812, in development and against `next start` |
| `npm run build` | Pass |

The E2E suite covers every M-02 "done when" item: the owner logs in and is forced to change the password before any other route opens; the owner creates a manager and a receptionist; the receptionist logs in with the username; a manager is offered no Vlasnik role, no actions on the owner's row, and gets 404 on `/finance`; a deactivated user is redirected to login on the next request. Wrong credentials and the receptionist reset message are covered too.

Browser fixtures create their own gym and staff through the service role and delete them again, including their audit rows and Auth users (doc 08 §10, D-56). After the full run the database holds only `KP Fitness`, Matija's owner row and the two original seed audit rows — verified directly.

## Two problems found and fixed

1. **`STAFF_EMAIL_DOMAIN` in `.env.local` held `mihajlo@stamenkovicc.com`**, an address rather than a domain, so every receptionist login address came out as `ime@mihajlo@stamenkovicc.com` and Supabase rejected it. It is now `staff.kpfitness.internal`, the value `.env.example` documents. `usernameEmail` now refuses a value that is not a bare domain instead of building a broken address. **Please confirm this is the intended domain** — it is the one AS-4 names, but it is your configuration.
2. **A creation error could be invisible.** The failure above was mapped to the email field, which is not on screen while creating a receptionist, so the form silently did nothing. Errors are now mapped to a field only when they are duplicate-identity errors on a field the role's form actually shows; everything else becomes a form-level red alert and is logged server-side.

## Deviations, each with its reason

1. **`/reception` and `/finance` are placeholders.** Doc 06 §2 sends receptionists and managers to Recepcija and owners to Finansije after login, but those screens are M-05/M-07 and M-12. Both routes exist with a short "u pripremi" line; `/finance` already enforces P-51 and answers other roles with 404.
2. **Navigation lists only routes that exist.** `lib/nav.ts` holds the full doc 06 §2 table, and a single `IMPLEMENTED` set filters it, so no link leads to a missing page. Each later milestone adds its route to that set.
3. **One password screen, not two.** Doc 06 defines S-01b for first login and doc 06 §1 puts Promijeni lozinku in the user menu without defining a screen for it. `/change-password` serves both and shows the current-password field only when it is not a first login.
4. **The root page is now a redirect.** The M-00 placeholder at `/` was replaced, and its E2E test now checks S-01 instead.
5. **Two dependencies added:** `@radix-ui/react-dialog` and `@radix-ui/react-dropdown-menu`, both pinned. shadcn/ui is the stack doc 08 §1 names, and D-47 requires dialogs that trap focus.
6. **The toast component is written in-house** rather than pulling in another library, since doc 06 §1 needs only a red error and a confirmation.

## New questions

1. **Nothing prevents the last owner from deactivating themselves.** The permission matrix allows an owner to deactivate any account, and doc 04 does not carve out the caller's own row. If the only owner does this, no one can administer accounts or open the finance screens again. Should an owner be blocked from deactivating their own account, or from deactivating the last active owner? I implemented the matrix exactly as written and added no guard.
2. **`must_change_password` is cleared with the service role**, so its audit row carries `changed_by = null`. The same applies to the owner seed. If BR-096 should attribute self-service password changes to the user, that needs an RPC instead; doc 07 §5 does not list one.
3. **The password-reset email is untested end to end.** Supabase Auth still sends through its default provider; Resend SMTP is a deployment step in M-13, so only the in-app half of US-01.2 is exercised.
