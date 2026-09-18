# CLAUDE.md

You are building the **KP Fitness Gym App** from the specification in this repository. The specification is the only source of truth. This conversation history is not available to you, and nothing outside these files exists.

## Before writing any code
1. Read `README.md`, then every file in `docs/` in the order the README lists.
2. Read `docs/10-decisions-open-questions-assumptions.md` carefully. It lists what is decided, what is assumed, and what is still open.

## How to work
- **Follow `docs/09-build-plan.md` strictly, one milestone at a time.**
  1. Before starting a milestone, re-read the documents it lists.
  2. Implement only that milestone's scope.
  3. At the end, run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:db` and `npm run test:e2e`, and check every "Done when" item.
  4. **Stop** and report: what was built, test results, any deviations, and new questions. Wait for approval before the next milestone.
- **Reference rule IDs** (`BR-xxx`, `F-xx`, `S-xx`) in code comments, tests and commit messages.
- **Business rules live in Postgres functions (RPCs).** The browser never writes to tables. Financial data is owner-only (doc 04 §2).
- **"Today"** is always `gym_today(gym_id)` (Europe/Podgorica), never the server date.
- **UI text** is Montenegrin, ijekavica, taken from `lib/i18n/me.ts`. Use the glossary (doc 02) exactly.
- **Database changes** are new numbered migrations only. Never edit an applied migration.
- **D-56:** Develop directly against the hosted Supabase project. Do not install or use Docker or run `supabase start` / `supabase db reset`. Use the hosted pgTAP runner (`npm run test:db`); inspect the existing project before applying migrations.

## Ask before deviating
- **Stop and ask** if a requirement is unclear, contradicts another document, or seems impossible, or if you want to change the schema, stack, routes or any rule.
- Items marked `> OPEN QUESTION` are **not** decided. Implement only the stated temporary behaviour.
- Items marked `> ASSUMPTION` are decided. Implement them as written.
- **Do not add features** that are not in the spec. Suggestions go in your milestone report (see SG-list in doc 10).

## Never
- Commit secrets, `.env` files, or the legacy Excel files.
- Expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.
- Hard-delete financial records.
- Hard-code prices; they come from the database (BR-004).
