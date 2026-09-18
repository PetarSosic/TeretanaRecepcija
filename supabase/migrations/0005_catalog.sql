-- M-03: the catalogue tables of doc 07 §3 — trainers, programs, the schedule, plans,
-- expense categories and products — with their audit triggers and the doc 07 §6
-- SELECT policies. Financial columns live in their own owner-only tables (doc 04 §2).

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
  personal_gym_fee numeric(10,2) check (personal_gym_fee >= 0)  -- null = nije definisano (OQ-1)
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

-- BR-024: a slot's trainer must be assigned to that slot's program. A check constraint
-- cannot span tables, so the rule is a trigger and therefore holds for every writer,
-- not only for the RPC.
create function class_slot_trainer_assigned()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from trainer_programs tp
    where tp.trainer_id = new.trainer_id and tp.program_id = new.program_id
  ) then
    raise exception 'E_TRAINER_NOT_ASSIGNED';  -- doc 08 §5
  end if;
  return new;
end;
$$;

create trigger class_slots_trainer_assigned
  before insert or update of trainer_id, program_id on class_slots
  for each row execute function class_slot_trainer_assigned();

-- Plans ------------------------------------------------------------------------
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
  check ((kind = 'personal') = (price is null))
);

create table plan_finance (                               -- OWNER ONLY
  plan_id           uuid primary key references plans(id),
  gym_id            uuid not null references gyms(id),
  gym_fixed_amount  numeric(10,2) not null default 0 check (gym_fixed_amount >= 0),
  trainer_share_pct numeric(5,2) check (trainer_share_pct between 0 and 100)
);

-- Expenses and products --------------------------------------------------------
create table expense_categories (
  id        uuid primary key default gen_random_uuid(),
  gym_id    uuid not null references gyms(id),
  name      text not null check (char_length(name) between 2 and 50),
  is_salary boolean not null default false,
  is_system boolean not null default false,
  is_active boolean not null default true,
  unique (gym_id, name),
  check (not is_system or is_active)                      -- BR-131
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

-- Audit (BR-096) ----------------------------------------------------------------
-- Doc 07 §3 lists plans, plan_finance, trainer_finance, products and
-- expense_categories as audited. Trainers, programs and slots are not.
create trigger plans_audit
  after insert or update on plans
  for each row execute function audit_row();
create trigger plan_finance_audit
  after insert or update on plan_finance
  for each row execute function audit_row();
create trigger trainer_finance_audit
  after insert or update on trainer_finance
  for each row execute function audit_row();
create trigger products_audit
  after insert or update on products
  for each row execute function audit_row();
create trigger expense_categories_audit
  after insert or update on expense_categories
  for each row execute function audit_row();

-- Row level security (doc 07 §6) -------------------------------------------------
alter table trainers           enable row level security;
alter table trainer_finance    enable row level security;
alter table programs           enable row level security;
alter table trainer_programs   enable row level security;
alter table class_slots        enable row level security;
alter table plans              enable row level security;
alter table plan_finance       enable row level security;
alter table expense_categories enable row level security;
alter table products           enable row level security;

create policy trainers_select on trainers
  for select to authenticated using (gym_id = my_gym());
create policy programs_select on programs
  for select to authenticated using (gym_id = my_gym());
create policy trainer_programs_select on trainer_programs
  for select to authenticated using (gym_id = my_gym());
create policy class_slots_select on class_slots
  for select to authenticated using (gym_id = my_gym());
create policy plans_select on plans
  for select to authenticated using (gym_id = my_gym());
create policy products_select on products
  for select to authenticated using (gym_id = my_gym());

-- Financial columns: owner and admin only (doc 04 §2, D-58).
create policy trainer_finance_select on trainer_finance
  for select to authenticated
  using (my_role() in ('owner', 'admin') and gym_id = my_gym());
create policy plan_finance_select on plan_finance
  for select to authenticated
  using (my_role() in ('owner', 'admin') and gym_id = my_gym());

-- BR-134: a manager or receptionist picks only from active, non-salary categories.
create policy expense_categories_select on expense_categories
  for select to authenticated
  using (
    gym_id = my_gym()
    and (my_role() in ('owner', 'admin') or (is_active and not is_salary))
  );

-- Table privileges (doc 04 §2): reads only; every write goes through an RPC.
revoke all on trainers, trainer_finance, programs, trainer_programs, class_slots,
  plans, plan_finance, expense_categories, products
  from anon, authenticated;
grant select on trainers, trainer_finance, programs, trainer_programs, class_slots,
  plans, plan_finance, expense_categories, products
  to authenticated;
