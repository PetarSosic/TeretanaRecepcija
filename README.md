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
