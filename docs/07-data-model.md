# 07 — Data Model (Supabase Postgres)

This is the target schema. Implement it as numbered migrations in `supabase/migrations/`. Any deviation must be reported before it is made.

## 1. Conventions
- **Primary keys:** `uuid` with `gen_random_uuid()`, except `audit_log`.
- **Tenancy:** every business table has `gym_id uuid not null references gyms(id)`.
- **Types:** money is `numeric(10,2)`; dates are `date`; moments are `timestamptz`.
- **Deletion:** nothing financial is ever deleted. Records are voided with `voided_at`, `voided_by` and `void_reason`.
- **"Today":** `gym_today(gym_id)`. Never `current_date` or `now()::date`.

## 2. Enums
```sql
create type app_role          as enum ('owner', 'manager', 'receptionist', 'admin');  -- admin added by D-58
create type program_kind      as enum ('group', 'personal');
create type plan_kind         as enum ('gym', 'group', 'combo', 'personal', 'day_pass');
create type duration_unit     as enum ('day', 'month');
create type visit_type        as enum ('gym', 'group', 'personal');
create type card_status       as enum ('unassigned', 'active', 'deactivated');
create type payment_kind      as enum ('membership', 'day_pass', 'card_replacement');
create type payment_method    as enum ('cash', 'card');
create type stock_move        as enum ('in', 'out');
create type shift_close_type  as enum ('manual', 'takeover', 'auto');
create type email_status      as enum ('not_sent', 'pending', 'sent', 'failed');
```

## 3. Tables
```sql
create extension if not exists pgcrypto;
create extension if not exists unaccent;
create extension if not exists pg_trgm;
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Tenancy & settings ----------------------------------------------------------
create table gyms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 2 and 100),
  timezone   text not null default 'Europe/Podgorica',
  currency   char(3) not null default 'EUR',
  created_at timestamptz not null default now()
);

create table gym_settings (
  gym_id                 uuid primary key references gyms(id),
  card_replacement_price numeric(10,2) not null default 5    check (card_replacement_price >= 0),
  personal_min_price     numeric(10,2) not null default 80   check (personal_min_price >= 0),
  expiry_reminder_days   smallint      not null default 3    check (expiry_reminder_days between 1 and 14),
  auto_close_time        time          not null default '23:00',
  double_scan_seconds    smallint      not null default 120  check (double_scan_seconds between 0 and 600),
  shift_report_emails    text[]        not null default array['mihajlo@stamenkovicc.com']
                         check (cardinality(shift_report_emails) >= 1),
  backup_emails          text[]        not null default array['mihajlo@stamenkovicc.com']
                         check (cardinality(backup_emails) >= 1),
  logo_path              text,                                -- Storage: gym-assets/<gym_id>/logo.*
  updated_at             timestamptz   not null default now()
);

-- Staff & shifts -------------------------------------------------------------------
create table staff (
  id                   uuid primary key default gen_random_uuid(),
  gym_id               uuid not null references gyms(id),
  user_id              uuid not null unique references auth.users(id),
  role                 app_role not null,
  full_name            text not null check (char_length(full_name) between 2 and 100),
  username             text unique check (username ~ '^[a-z0-9._]{3,30}$'),
  email                text unique check (email = lower(email)),
  must_change_password boolean not null default true,
  is_active            boolean not null default true,
  created_by           uuid references staff(id),
  created_at           timestamptz not null default now(),
  -- D-57: exactly one login identity per account. Usernames are the rule; an email
  -- login is for the admin role and the seeded owner account.
  check ((username is null) <> (email is null)),
  check (role <> 'admin' or email is not null)
);

create table staff_credentials (                          -- ADMIN ONLY (D-59)
  staff_id   uuid primary key references staff(id),
  gym_id     uuid not null references gyms(id),
  password   text not null,                               -- readable copy beside the bcrypt hash
  updated_at timestamptz not null default now()
);

create table shifts (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references gyms(id),
  staff_id       uuid not null references staff(id),
  started_at     timestamptz not null default now(),
  closed_at      timestamptz,
  close_type     shift_close_type,
  closed_by      uuid references staff(id),
  counted_cash   numeric(10,2) check (counted_cash >= 0),
  report_path    text,                                   -- Storage: shift-reports/<gym_id>/<shift_id>.pdf
  email_status   email_status not null default 'not_sent',
  email_attempts smallint not null default 0,
  emailed_at     timestamptz,
  check ((closed_at is null) = (close_type is null))
);
create unique index shifts_one_open_per_gym on shifts (gym_id) where closed_at is null;

-- Trainers, programs, schedule ------------------------------------------------
create table trainers (
  id        uuid primary key default gen_random_uuid(),
  gym_id    uuid not null references gyms(id),
  full_name text not null check (char_length(full_name) between 2 and 100),
  is_active boolean not null default true
);

create table trainer_finance (                            -- OWNER ONLY
  trainer_id       uuid primary key references trainers(id),
  gym_id           uuid not null references gyms(id),
  personal_gym_fee numeric(10,2) check (personal_gym_fee >= 0),  -- null = nije definisano (OQ-1)
  group_share_pct  numeric(5,2) check (group_share_pct between 0 and 100)
                   -- D-62: null = use the plan's percentage
);

create table programs (
  id        uuid primary key default gen_random_uuid(),
  gym_id    uuid not null references gyms(id),
  name      text not null check (char_length(name) between 2 and 50),
  kind      program_kind not null,
  is_active boolean not null default true,
  unique (gym_id, name)
);

create table trainer_programs (
  gym_id     uuid not null references gyms(id),
  trainer_id uuid not null references trainers(id),
  program_id uuid not null references programs(id),
  primary key (trainer_id, program_id)
);

create table class_slots (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references gyms(id),
  program_id uuid not null references programs(id),
  trainer_id uuid not null references trainers(id),
  weekday    smallint not null check (weekday between 1 and 7),   -- ISO: 1 = Monday
  starts_at  time not null,
  is_active  boolean not null default true
);

-- Plans ----------------------------------------------------------------------------
create table plans (
  id                  uuid primary key default gen_random_uuid(),
  gym_id              uuid not null references gyms(id),
  name                text not null check (char_length(name) between 2 and 50),
  kind                plan_kind not null,
  duration_value      smallint check (duration_value > 0),
  duration_unit       duration_unit,
  price               numeric(10,2) check (price >= 0),     -- null only for personal
  covers_gym          boolean not null default false,
  covers_group        boolean not null default false,
  covers_personal     boolean not null default false,
  gym_visit_limit     smallint check (gym_visit_limit > 0),
  group_session_limit smallint check (group_session_limit > 0),
  requires_trainer    boolean not null default false,
  sort_order          smallint not null default 0,
  is_active           boolean not null default true,
  unique (gym_id, name),
  check ((kind = 'day_pass') = (duration_value is null and duration_unit is null)),
  check ((duration_value is null) = (duration_unit is null)),   -- migration 0027 (N-14)
  check ((kind = 'personal') = (price is null))
);

create table plan_finance (                               -- OWNER ONLY
  plan_id           uuid primary key references plans(id),
  gym_id            uuid not null references gyms(id),
  gym_fixed_amount  numeric(10,2) not null default 0 check (gym_fixed_amount >= 0),
  trainer_share_pct numeric(5,2) check (trainer_share_pct between 0 and 100)
);

-- Members & cards --------------------------------------------------------------------
create table member_counters (
  gym_id      uuid primary key references gyms(id),
  last_number integer not null default 0
);

create table members (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references gyms(id),
  member_number  integer not null,
  first_name     text not null check (char_length(first_name) between 1 and 50),
  last_name      text not null check (char_length(last_name) between 1 and 50),
  phone          text check (phone ~ '^\+[0-9]{8,15}$'),
  email          text check (email = lower(email) and char_length(email) <= 254),
  date_of_birth  date check (date_of_birth >= date '1900-01-01'),
  is_anonymized  boolean not null default false,
  anonymized_at  timestamptz,
  search_text    text not null default '',                  -- unaccent(lower(first last)), maintained by trigger
  created_by     uuid not null references staff(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (gym_id, member_number),
  check (is_anonymized or (phone is not null and email is not null and date_of_birth is not null))
);
create index members_phone_idx  on members (gym_id, phone);
create index members_email_idx  on members (gym_id, email);
create index members_search_idx on members using gin (search_text gin_trgm_ops);  -- requires pg_trgm

create table card_batches (
  id         uuid primary key default gen_random_uuid(),
  gym_id     uuid not null references gyms(id),
  quantity   smallint not null check (quantity between 1 and 100),
  pdf_path   text,
  created_by uuid not null references staff(id),
  created_at timestamptz not null default now()
);

create table cards (
  id                 uuid primary key default gen_random_uuid(),
  gym_id             uuid not null references gyms(id),
  code               char(10) not null unique check (code ~ '^[1-9][0-9]{9}$'),
  status             card_status not null default 'unassigned',
  member_id          uuid references members(id),
  batch_id           uuid not null references card_batches(id),
  assigned_at        timestamptz,
  deactivated_at     timestamptz,
  deactivated_reason text,
  check ((status = 'unassigned') = (member_id is null))
);
create unique index cards_one_active_per_member on cards (member_id) where status = 'active';

-- Memberships ---------------------------------------------------------------------------
create table memberships (
  id                     uuid primary key default gen_random_uuid(),
  gym_id                 uuid not null references gyms(id),
  member_id              uuid not null references members(id),
  plan_id                uuid not null references plans(id),
  trainer_id             uuid references trainers(id),
  start_date             date not null,
  end_date               date not null,                    -- last valid day, inclusive (BR-051)
  start_reason           text not null,                    -- BR-052 reason text
  covers_gym             boolean not null,                 -- snapshots (BR-050)
  covers_group           boolean not null,
  covers_personal        boolean not null,
  gym_visit_limit        smallint,
  group_session_limit    smallint,
  personal_session_limit smallint check (personal_session_limit between 1 and 50),
  is_backdated           boolean not null default false,
  created_by             uuid not null references staff(id),
  shift_id               uuid references shifts(id),
  created_at             timestamptz not null default now(),
  voided_at              timestamptz,
  voided_by              uuid references staff(id),
  void_reason            text,
  check (end_date >= start_date),
  check (is_backdated = (shift_id is null)),
  check ((voided_at is null) = (void_reason is null))
);
create index memberships_member_idx on memberships (member_id, end_date desc);

create table membership_finance (                          -- OWNER ONLY, snapshot at sale
  membership_id     uuid primary key references memberships(id),
  gym_id            uuid not null references gyms(id),
  gym_fixed_amount  numeric(10,2) not null default 0,
  trainer_share_pct numeric(5,2),
  personal_gym_fee  numeric(10,2)                            -- null = nije definisano
);

-- Visits ------------------------------------------------------------------------------------
create table visits (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references gyms(id),
  member_id      uuid not null references members(id),
  membership_id  uuid references memberships(id),
  visit_type     visit_type not null,
  trainer_id     uuid references trainers(id),
  class_slot_id  uuid references class_slots(id),
  is_unpaid      boolean not null default false,
  is_manual      boolean not null default false,
  is_backdated   boolean not null default false,
  checked_in_at  timestamptz not null default now(),
  checked_in_by  uuid not null references staff(id),
  checked_out_at timestamptz,
  checked_out_by uuid references staff(id),
  auto_checkout  boolean not null default false,
  shift_id       uuid references shifts(id),                -- open shift at check-in, may be null
  check (checked_out_at is null or checked_out_at >= checked_in_at),
  check ((visit_type = 'gym') = (trainer_id is null)),
  check (visit_type = 'group' or class_slot_id is null)
  -- is_unpaid stays true after the visit is linked by a later sale (history, BR-052)
);
create unique index visits_one_open_per_member on visits (member_id) where checked_out_at is null;
create index visits_membership_idx on visits (membership_id, visit_type);
create index visits_checkin_idx    on visits (gym_id, checked_in_at);

-- Money in ------------------------------------------------------------------------------------
create table payments (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references gyms(id),
  kind          payment_kind not null,
  membership_id uuid unique references memberships(id),
  member_id     uuid references members(id),
  plan_id       uuid references plans(id),
  quantity      smallint not null default 1 check (quantity between 1 and 20),
  amount        numeric(10,2) not null check (amount >= 0),
  method        payment_method not null,
  paid_on       date not null,
  note          text check (char_length(note) <= 500),
  is_backdated  boolean not null default false,
  created_by    uuid not null references staff(id),
  shift_id      uuid references shifts(id),
  created_at    timestamptz not null default now(),
  voided_at     timestamptz,
  voided_by     uuid references staff(id),
  void_reason   text check (char_length(void_reason) between 3 and 200),
  check (is_backdated = (shift_id is null)),
  check ((kind = 'membership') = (membership_id is not null)),
  check (kind <> 'membership'       or (member_id is not null and plan_id is not null)),
  check (kind <> 'day_pass'         or (plan_id is not null and member_id is null)),
  check (kind <> 'card_replacement' or (member_id is not null and plan_id is null)),
  check ((voided_at is null) = (void_reason is null))
);
create index payments_shift_idx on payments (shift_id);
create index payments_paid_idx  on payments (gym_id, paid_on);

-- Money out -------------------------------------------------------------------------------------
create table expense_categories (
  id        uuid primary key default gen_random_uuid(),
  gym_id    uuid not null references gyms(id),
  name      text not null check (char_length(name) between 2 and 50),
  is_salary boolean not null default false,
  is_system boolean not null default false,
  is_active boolean not null default true,
  unique (gym_id, name),
  check (not is_system or is_active)
);

create table products (
  id                     uuid primary key default gen_random_uuid(),
  gym_id                 uuid not null references gyms(id),
  name                   text not null check (char_length(name) between 2 and 50),
  current_purchase_price numeric(10,2) not null check (current_purchase_price >= 0),
  sale_price             numeric(10,2) not null check (sale_price > 0),
  is_active              boolean not null default true,
  unique (gym_id, name)
);

create table stock_movements (
  id             uuid primary key default gen_random_uuid(),
  gym_id         uuid not null references gyms(id),
  product_id     uuid not null references products(id),
  type           stock_move not null,
  quantity       integer not null check (quantity between 1 and 10000),
  unit_cost      numeric(10,2) not null check (unit_cost >= 0),   -- in: entered; out: snapshot
  unit_price     numeric(10,2) check (unit_price > 0),           -- out only
  method         payment_method,                                -- out: required
  paid_from_till boolean not null default false,                -- in only
  created_by     uuid not null references staff(id),
  shift_id       uuid references shifts(id),
  created_at     timestamptz not null default now(),
  voided_at      timestamptz,
  voided_by      uuid references staff(id),
  void_reason    text,
  check ((type = 'out') = (unit_price is not null and method is not null)),
  check (type <> 'in' or unit_cost > 0),                     -- BR-141, D-55: no free deliveries
  check (type = 'in' or not paid_from_till),
  check (type = 'in' or shift_id is not null),
  check (not paid_from_till or shift_id is not null),
  check ((voided_at is null) = (void_reason is null))
);

create table expenses (
  id                uuid primary key default gen_random_uuid(),
  gym_id            uuid not null references gyms(id),
  spent_on          date not null,
  category_id       uuid not null references expense_categories(id),
  description       text not null check (char_length(description) between 2 and 200),
  amount            numeric(10,2) not null check (amount > 0 and amount <= 100000),
  method            payment_method,                    -- null = "Van kase" (AS-17)
  paid_from_till    boolean not null default false,
  supplier          text check (char_length(supplier) <= 100),
  invoice_number    text check (char_length(invoice_number) <= 50),
  vat_included      boolean,
  trainer_id        uuid references trainers(id),      -- payout (salary category only)
  stock_movement_id uuid unique references stock_movements(id),
  created_by        uuid not null references staff(id),
  shift_id          uuid references shifts(id),
  created_at        timestamptz not null default now(),
  voided_at         timestamptz,
  voided_by         uuid references staff(id),
  void_reason       text,
  check (not paid_from_till or (method = 'cash' and shift_id is not null)),
  check ((voided_at is null) = (void_reason is null))
);
create index expenses_spent_idx on expenses (gym_id, spent_on);

-- Notifications & audit -----------------------------------------------------------------------------
create table expiry_notifications (
  membership_id uuid primary key references memberships(id),
  gym_id        uuid not null references gyms(id),
  sent_at       timestamptz,
  status        email_status not null default 'pending',
  error         text
);

create table job_runs (                                   -- idempotency for scheduled jobs (doc 08 §8)
  gym_id   uuid not null references gyms(id),
  job      text not null check (job in ('nightly', 'morning', 'backup')),
  run_date date not null,
  ran_at   timestamptz not null default now(),
  primary key (gym_id, job, run_date)
);

create table backup_runs (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id),
  run_date    date not null,
  attempt     smallint not null default 1 check (attempt between 1 and 3),
  status      text not null check (status in ('running', 'success', 'failed')),
  file_path   text,                                    -- Storage: backups/<gym_id>/kpfitness-backup-<date>.zip
  size_bytes  bigint,
  emailed     boolean not null default false,
  error       text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  unique (gym_id, run_date, attempt)
);

create table audit_log (
  id         bigint generated always as identity primary key,
  gym_id     uuid not null references gyms(id),
  table_name text not null,
  row_id     text not null,
  action     text not null check (action in ('insert', 'update', 'void', 'anonymize')),
  old_data   jsonb,
  new_data   jsonb,
  changed_by uuid references staff(id),                -- null = system job
  changed_at timestamptz not null default now()
);
create index audit_gym_time_idx on audit_log (gym_id, changed_at desc);
```

**Audit triggers** (`insert`, `update`, `void`) are required on these tables:
- `payments`, `memberships`, `stock_movements`, `expenses`;
- `members` (update and anonymize);
- `plans`, `plan_finance`, `trainer_finance`, `gym_settings`, `products`, `expense_categories`, `staff`.

## 4. Helper functions
All are `stable`, with `set search_path = public`.

| Function | Returns | Definition |
|---|---|---|
| `current_staff()` | `staff` row | The active staff row for `auth.uid()`. Raises `E_NOT_STAFF` if none. |
| `my_role()` | `app_role` | `current_staff().role` |
| `my_gym()` | `uuid` | `current_staff().gym_id` |
| `gym_today(p_gym uuid)` | `date` | `(now() at time zone gyms.timezone)::date` |
| `gym_local_date(p_gym uuid, p_ts timestamptz)` | `date` | Local date of a timestamp |
| `open_shift(p_gym uuid)` | `shifts` row or null | The gym's open shift |
| `membership_end_date(p_start date, p_value int, p_unit duration_unit)` | `date` | BR-051 |
| `membership_used(p_membership uuid, p_type visit_type)` | `int` | Count of visits linked with that type |
| `membership_covers(p_membership uuid, p_type visit_type, p_date date)` | `bool` | BR-053 |
| `membership_status(p_membership uuid, p_date date)` | `text` | BR-054 |
| `calc_membership_start(p_member uuid, p_plan uuid, p_date date)` | `(start_date date, end_date date, reason text, visit_ids uuid[], warning text)` | BR-052 |
| `unlinked_unpaid_count(p_member uuid)` | `int` | BR-079 N |
| `trainer_can(p_trainer uuid, p_kind program_kind)` | `bool` | BR-023 |
| `resolve_group_share(p_trainer uuid, p_plan uuid)` | `numeric` | D-62: the trainer's own group share, or the plan's |

## 5. RPCs (write operations)
All RPCs are `security definer`. Each one:
- checks role and gym first;
- runs in one transaction;
- raises coded errors (doc 08 §5).

| RPC | Allowed roles | Rules |
|---|---|---|
| `resolve_login_shift()` → `{state: 'opened'\|'resumed'\|'gate', shift}` | receptionist | BR-111 |
| `take_over_shift(p_counted_cash numeric)` | receptionist | BR-111 |
| `close_shift(p_shift uuid, p_counted_cash numeric)` → shift | receptionist (own), owner (any; cash optional) | BR-114, BR-115 |
| `shift_summary(p_shift uuid)` → json | shift's receptionist, owner; manager: currently open shift only, aggregate totals only | BR-115, BR-117, D-54 |
| `scan_card(p_code text)` → json `{result, member, open_visit, options, candidates, unpaid_count}` | all | BR-070–073 (check-out happens inside, unless the guard applies) |
| `check_in(p_member uuid, p_type visit_type, p_membership uuid, p_trainer uuid, p_slot uuid, p_manual bool)` → json | all | BR-071–079 |
| `check_out(p_visit uuid, p_confirmed bool)` → json | all | BR-072 |
| `register_member(p_card_code, p_first, p_last, p_phone, p_email, p_dob, p_plan, p_trainer, p_amount, p_sessions, p_method, p_check_in bool)` → json | all | BR-033, BR-040–043, BR-050–060 |
| `find_duplicates(p_phone, p_email)` → rows | all | BR-043 |
| `update_member(p_member, …)` | all | BR-045 |
| `anonymize_member(p_member)` | owner | BR-046 |
| `sell_membership(p_member, p_plan, p_trainer, p_amount, p_sessions, p_method, p_start_override date default null)` | all (override: owner) | BR-050–060, BR-092 |
| `sell_day_passes(p_qty, p_method)` | all | BR-100 |
| `replace_card(p_member, p_new_code, p_method)` | all | BR-034 |
| `correct_payment(p_payment, p_method, p_note, p_amount default null)` | all (amount: owner) | BR-094 |
| `void_payment(p_payment, p_reason)` | all per BR-094 | BR-095 |
| `record_desk_expense(p_category, p_description, p_amount)` | all | BR-132 |
| `record_expense(…BR-133 fields)` | owner | BR-133 |
| `void_expense(p_expense, p_reason)` | per BR-135 | BR-135 |
| `stock_in(p_product, p_qty, p_unit_cost, p_from_till bool)` | all | BR-141 |
| `stock_sale(p_product, p_qty, p_method)` | all | BR-142 |
| `correct_sale(p_movement, p_method)`, `void_stock_movement(p_movement, p_reason)` | per BR-094 and BR-095 | |
| `backdated_visit(…)`, `backdated_membership(…)`, `backdated_day_passes(…)`, `backdated_card_fee(…)` | owner | BR-120 |
| `generate_card_batch(p_qty)` → batch | owner, manager | BR-030, BR-036 |
| `upsert_trainer`, `upsert_program`, `set_trainer_program`, `upsert_class_slot` | owner, manager | BR-023–026 |
| `set_trainer_fee(p_trainer, p_fee, p_group_share_pct)`, `upsert_plan` (incl. finance), `upsert_product`, `upsert_expense_category`, `update_gym_settings` | owner | BR-004, BR-131, BR-140, D-62 |
| `job_nightly(p_gym)` → shift ids to report | service role only | BR-082, BR-116 |
| `job_expiring_memberships(p_gym)` → rows | service role only | BR-160 |
| `job_backup_tables()` → table names in export order | service role only | BR-163 |

For managers, `shift_summary` must verify that the requested shift is the currently open shift in their own gym and return only `cash_income`, `card_income`, `till_expenses` and `expected_cash`. It must not return report items or individual expense details. Closed-shift or cross-gym requests raise `E_FORBIDDEN`. This does not widen the SELECT policies below (D-54).

`stock_in` rejects a purchase price below €0.01 with `E_STOCK_COST_INVALID` before creating either the movement or its expense (BR-141, D-55).

**Owner-only report functions** (`security definer`; each starts with `if my_role() <> 'owner' then raise`):
- `fin_summary(p_from, p_to)`;
- `fin_income_breakdown(p_from, p_to)`;
- `fin_chart(p_year, p_month default null)` — the S-16 chart (D-68): the year's twelve months, or the month's days, each with income and expenses, `null` after today; plus the totals and the first year that holds any money;
- `fin_expenses(p_from, p_to, filters)`;
- `fin_trainer_stats(p_month date)`;
- `fin_trainer_payments(p_trainer, p_month)`;
- `fin_storage(p_from, p_to)`;
- `fin_shifts(p_from, p_to)`;
- `fin_expiring(p_days)`;
- `fin_unpaid_members()`.

**Statistics** (owner, manager): `visit_stats(p_from, p_to)`.

## 6. RLS — SELECT policies
Writes: **none** for `authenticated`; everything goes through RPCs.

| Table | Owner | Manager | Receptionist |
|---|---|---|---|
| gyms, gym_settings | own gym | own gym | own gym |
| staff | own gym | own gym | own row only |

An `admin` reads every table in the list below on the same terms as an owner, and additionally `staff_credentials`, which no other role may read (D-58, D-59).

| shifts | all | open shift only | open shift and own shifts |
| trainers, programs, trainer_programs, class_slots, plans | own gym | own gym | own gym |
| trainer_finance, plan_finance, membership_finance | ✓ | ✗ | ✗ |
| staff_credentials | ✗ (admin only, D-59) | ✗ | ✗ |
| members, cards, card_batches, memberships, visits | own gym | own gym | own gym (card_batches: ✗) |
| payments | all | `paid_on = gym_today()` and not back-dated | same as manager |
| stock_movements | all | local date = today | same as manager |
| products | own gym | own gym | own gym |
| expense_categories | all | active and not salary | active and not salary |
| expenses | all | `created_by = me` and `spent_on = gym_today()` | same as manager |
| expiry_notifications, audit_log, job_runs, backup_runs | ✓ | ✗ | ✗ |

**Storage buckets:**
- `shift-reports` (private): owner reads.
- `card-batches` (private): owner and manager read.
- `gym-assets` (private): all staff read; owner writes via a server action.
- `backups` (private): no access for any staff role; only the service role (backup job, developer).

## 7. Seed (`supabase/seed.sql` plus a `scripts/seed-owner.ts` script for the Auth user)
1. **Gym:** `KP Fitness` and its `gym_settings` defaults (BR-012).
2. **Plans:** BR-010, including `plan_finance`. Sort order follows the table order.
3. **Trainers:** BR-020 (`trainer_finance`: Milena null, Julija null, Tamara 80, Tatjana 80).
4. **Programs, assignments and class slots:** BR-021, BR-022.
5. **Expense categories:** BR-130.
6. **Product:** BR-140 ("Voda", 0.30 / 1.50).
7. **`member_counters`:** the gym row with `last_number = 0`.
8. **Owner:** Auth user **Matija Vojinović**, email `matija.vojinovic@eurotehnikamn.me`. The password comes from the environment variable `SEED_OWNER_PASSWORD`, and `must_change_password = true`. The script is idempotent: it skips the user if it already exists.
