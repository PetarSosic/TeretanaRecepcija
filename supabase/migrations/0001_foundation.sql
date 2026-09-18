-- M-01 Database foundation: extensions, enums and the tenancy, staff, shift,
-- counter, audit and job tables (doc 07 §2–3).
-- pg_cron and pg_net are created in M-11, where the scheduled jobs are built.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Enums (doc 07 §2) -----------------------------------------------------------
create type app_role         as enum ('owner', 'manager', 'receptionist');
create type program_kind     as enum ('group', 'personal');
create type plan_kind        as enum ('gym', 'group', 'combo', 'personal', 'day_pass');
create type duration_unit    as enum ('day', 'month');
create type visit_type       as enum ('gym', 'group', 'personal');
create type card_status      as enum ('unassigned', 'active', 'deactivated');
create type payment_kind     as enum ('membership', 'day_pass', 'card_replacement');
create type payment_method   as enum ('cash', 'card');
create type stock_move       as enum ('in', 'out');
create type shift_close_type as enum ('manual', 'takeover', 'auto');
create type email_status     as enum ('not_sent', 'pending', 'sent', 'failed');

-- Tenancy and settings --------------------------------------------------------
create table gyms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 2 and 100),
  timezone   text not null default 'Europe/Podgorica',
  currency   char(3) not null default 'EUR',
  created_at timestamptz not null default now()
);

-- BR-012 seeds the defaults below.
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

-- Staff and shifts ------------------------------------------------------------
-- D-05: receptionists log in with a username, owners and managers with an email.
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
  check ((role = 'receptionist' and username is not null and email is null)
      or (role <> 'receptionist' and email is not null and username is null))
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
-- BR-110: at most one open shift per gym.
create unique index shifts_one_open_per_gym on shifts (gym_id) where closed_at is null;

-- Member numbering (BR-042) ---------------------------------------------------
create table member_counters (
  gym_id      uuid primary key references gyms(id),
  last_number integer not null default 0
);

-- Audit and scheduled jobs ----------------------------------------------------
-- BR-096: corrections, voids, price, settings and member edits are recorded here.
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

create table job_runs (                                 -- idempotency for scheduled jobs (doc 08 §8)
  gym_id   uuid not null references gyms(id),
  job      text not null check (job in ('nightly', 'morning', 'backup')),
  run_date date not null,
  ran_at   timestamptz not null default now(),
  primary key (gym_id, job, run_date)
);
