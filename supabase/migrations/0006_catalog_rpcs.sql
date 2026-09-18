-- M-03: the settings RPCs of doc 07 §5. Every one is security definer, checks the role
-- and the gym first, runs in one transaction and raises the coded errors of doc 08 §5.
-- D-58: wherever the specification says "owner", an admin passes too.

create function assert_staff_role(p_allowed app_role[])
returns staff
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff staff;
begin
  v_staff := current_staff();          -- raises E_NOT_STAFF when there is no session
  if not (v_staff.role = any (p_allowed)) then
    raise exception 'E_FORBIDDEN';
  end if;
  return v_staff;
end;
$$;

-- Trainers, programs and schedule: owner, manager and admin (P-60, BR-026) --------
create function upsert_trainer(
  p_id uuid,
  p_full_name text,
  p_is_active boolean default true
)
returns trainers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff   staff := assert_staff_role(array['owner', 'manager', 'admin']::app_role[]);
  v_trainer trainers;
begin
  if char_length(btrim(p_full_name)) not between 2 and 100 then
    raise exception 'E_VALIDATION';
  end if;

  if p_id is null then
    insert into trainers (gym_id, full_name, is_active)
    values (v_staff.gym_id, btrim(p_full_name), coalesce(p_is_active, true))
    returning * into v_trainer;
    -- OQ-1: the fee starts undefined; only the owner may set it (BR-026).
    insert into trainer_finance (trainer_id, gym_id) values (v_trainer.id, v_staff.gym_id);
  else
    update trainers
    set full_name = btrim(p_full_name), is_active = coalesce(p_is_active, is_active)
    where id = p_id and gym_id = v_staff.gym_id
    returning * into v_trainer;
    if not found then raise exception 'E_FORBIDDEN'; end if;
  end if;
  return v_trainer;
end;
$$;

-- BR-026: only the owner sees and edits trainer fees.
create function set_trainer_fee(p_trainer uuid, p_fee numeric)
returns trainer_finance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff  staff := assert_staff_role(array['owner', 'admin']::app_role[]);
  v_result trainer_finance;
begin
  if p_fee is not null and p_fee < 0 then raise exception 'E_VALIDATION'; end if;

  update trainer_finance
  set personal_gym_fee = p_fee
  where trainer_id = p_trainer and gym_id = v_staff.gym_id
  returning * into v_result;
  if not found then raise exception 'E_FORBIDDEN'; end if;
  return v_result;
end;
$$;

create function upsert_program(
  p_id uuid,
  p_name text,
  p_kind program_kind,
  p_is_active boolean default true
)
returns programs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff   staff := assert_staff_role(array['owner', 'manager', 'admin']::app_role[]);
  v_program programs;
begin
  if char_length(btrim(p_name)) not between 2 and 50 then
    raise exception 'E_VALIDATION';
  end if;

  if p_id is null then
    insert into programs (gym_id, name, kind, is_active)
    values (v_staff.gym_id, btrim(p_name), p_kind, coalesce(p_is_active, true))
    returning * into v_program;
  else
    -- The kind is fixed after creation: assignments and memberships depend on it.
    update programs
    set name = btrim(p_name), is_active = coalesce(p_is_active, is_active)
    where id = p_id and gym_id = v_staff.gym_id
    returning * into v_program;
    if not found then raise exception 'E_FORBIDDEN'; end if;
  end if;
  return v_program;
end;
$$;

-- BR-023 and BR-025: assigning and removing an assignment.
create function set_trainer_program(
  p_trainer uuid,
  p_program uuid,
  p_assigned boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff staff := assert_staff_role(array['owner', 'manager', 'admin']::app_role[]);
begin
  if not exists (select 1 from trainers where id = p_trainer and gym_id = v_staff.gym_id)
     or not exists (select 1 from programs where id = p_program and gym_id = v_staff.gym_id)
  then
    raise exception 'E_FORBIDDEN';
  end if;

  if p_assigned then
    insert into trainer_programs (gym_id, trainer_id, program_id)
    values (v_staff.gym_id, p_trainer, p_program)
    on conflict (trainer_id, program_id) do nothing;
  else
    -- BR-025: removing an assignment hides the trainer from new selections but
    -- leaves existing slots and history alone, so active slots are deactivated
    -- rather than deleted.
    update class_slots set is_active = false
    where trainer_id = p_trainer and program_id = p_program and gym_id = v_staff.gym_id;
    delete from trainer_programs
    where trainer_id = p_trainer and program_id = p_program;
  end if;
  return p_assigned;
end;
$$;

create function upsert_class_slot(
  p_id uuid,
  p_program uuid,
  p_trainer uuid,
  p_weekday smallint,
  p_starts_at time,
  p_is_active boolean default true
)
returns class_slots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff staff := assert_staff_role(array['owner', 'manager', 'admin']::app_role[]);
  v_slot  class_slots;
begin
  if p_weekday is null or p_weekday not between 1 and 7 or p_starts_at is null then
    raise exception 'E_VALIDATION';
  end if;
  if not exists (select 1 from programs where id = p_program and gym_id = v_staff.gym_id)
     or not exists (select 1 from trainers where id = p_trainer and gym_id = v_staff.gym_id)
  then
    raise exception 'E_FORBIDDEN';
  end if;
  -- BR-024 is enforced by the class_slots trigger, which raises
  -- E_TRAINER_NOT_ASSIGNED for a trainer who is not on the program.

  if p_id is null then
    insert into class_slots (gym_id, program_id, trainer_id, weekday, starts_at, is_active)
    values (v_staff.gym_id, p_program, p_trainer, p_weekday, p_starts_at,
            coalesce(p_is_active, true))
    returning * into v_slot;
  else
    update class_slots
    set program_id = p_program,
        trainer_id = p_trainer,
        weekday    = p_weekday,
        starts_at  = p_starts_at,
        is_active  = coalesce(p_is_active, is_active)
    where id = p_id and gym_id = v_staff.gym_id
    returning * into v_slot;
    if not found then raise exception 'E_FORBIDDEN'; end if;
  end if;
  return v_slot;
end;
$$;

-- Plans, products, categories and settings: owner and admin (P-61 to P-63) --------
-- BR-004: a price change affects new records only; nothing existing is rewritten.
create function upsert_plan(
  p_id uuid,
  p_name text,
  p_kind plan_kind,
  p_duration_value smallint,
  p_duration_unit duration_unit,
  p_price numeric,
  p_covers_gym boolean,
  p_covers_group boolean,
  p_covers_personal boolean,
  p_gym_visit_limit smallint,
  p_group_session_limit smallint,
  p_requires_trainer boolean,
  p_sort_order smallint,
  p_is_active boolean,
  p_gym_fixed_amount numeric default 0,
  p_trainer_share_pct numeric default null
)
returns plans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff staff := assert_staff_role(array['owner', 'admin']::app_role[]);
  v_plan  plans;
begin
  if char_length(btrim(p_name)) not between 2 and 50 then
    raise exception 'E_VALIDATION';
  end if;

  if p_id is null then
    insert into plans (
      gym_id, name, kind, duration_value, duration_unit, price,
      covers_gym, covers_group, covers_personal,
      gym_visit_limit, group_session_limit, requires_trainer, sort_order, is_active
    ) values (
      v_staff.gym_id, btrim(p_name), p_kind, p_duration_value, p_duration_unit, p_price,
      coalesce(p_covers_gym, false), coalesce(p_covers_group, false),
      coalesce(p_covers_personal, false),
      p_gym_visit_limit, p_group_session_limit,
      coalesce(p_requires_trainer, false), coalesce(p_sort_order, 0),
      coalesce(p_is_active, true)
    )
    returning * into v_plan;
    insert into plan_finance (plan_id, gym_id, gym_fixed_amount, trainer_share_pct)
    values (v_plan.id, v_staff.gym_id, coalesce(p_gym_fixed_amount, 0), p_trainer_share_pct);
  else
    -- The kind is fixed after creation: sold memberships snapshot what it means.
    update plans
    set name                = btrim(p_name),
        duration_value      = p_duration_value,
        duration_unit       = p_duration_unit,
        price               = p_price,
        covers_gym          = coalesce(p_covers_gym, false),
        covers_group        = coalesce(p_covers_group, false),
        covers_personal     = coalesce(p_covers_personal, false),
        gym_visit_limit     = p_gym_visit_limit,
        group_session_limit = p_group_session_limit,
        requires_trainer    = coalesce(p_requires_trainer, false),
        sort_order          = coalesce(p_sort_order, sort_order),
        is_active           = coalesce(p_is_active, is_active)
    where id = p_id and gym_id = v_staff.gym_id
    returning * into v_plan;
    if not found then raise exception 'E_FORBIDDEN'; end if;

    update plan_finance
    set gym_fixed_amount  = coalesce(p_gym_fixed_amount, 0),
        trainer_share_pct = p_trainer_share_pct
    where plan_id = p_id;
  end if;
  return v_plan;
end;
$$;

-- BR-140: products are the owner's, and both prices are theirs to set.
create function upsert_product(
  p_id uuid,
  p_name text,
  p_purchase_price numeric,
  p_sale_price numeric,
  p_is_active boolean default true
)
returns products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff   staff := assert_staff_role(array['owner', 'admin']::app_role[]);
  v_product products;
begin
  if char_length(btrim(p_name)) not between 2 and 50 then
    raise exception 'E_VALIDATION';
  end if;
  if p_sale_price is null or p_sale_price <= 0
     or p_purchase_price is null or p_purchase_price < 0 then
    raise exception 'E_VALIDATION';
  end if;

  if p_id is null then
    insert into products (gym_id, name, current_purchase_price, sale_price, is_active)
    values (v_staff.gym_id, btrim(p_name), p_purchase_price, p_sale_price,
            coalesce(p_is_active, true))
    returning * into v_product;
  else
    update products
    set name                   = btrim(p_name),
        current_purchase_price = p_purchase_price,
        sale_price             = p_sale_price,
        is_active              = coalesce(p_is_active, is_active)
    where id = p_id and gym_id = v_staff.gym_id
    returning * into v_product;
    if not found then raise exception 'E_FORBIDDEN'; end if;
  end if;
  return v_product;
end;
$$;

-- BR-131: categories are added, renamed and deactivated, never deleted, and a system
-- category can never be deactivated.
create function upsert_expense_category(
  p_id uuid,
  p_name text,
  p_is_active boolean default true
)
returns expense_categories
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff    staff := assert_staff_role(array['owner', 'admin']::app_role[]);
  v_category expense_categories;
begin
  if char_length(btrim(p_name)) not between 2 and 50 then
    raise exception 'E_VALIDATION';
  end if;

  if p_id is null then
    insert into expense_categories (gym_id, name, is_active)
    values (v_staff.gym_id, btrim(p_name), coalesce(p_is_active, true))
    returning * into v_category;
  else
    select * into v_category
    from expense_categories where id = p_id and gym_id = v_staff.gym_id;
    if not found then raise exception 'E_FORBIDDEN'; end if;
    if v_category.is_system and coalesce(p_is_active, true) = false then
      raise exception 'E_CATEGORY_NOT_ALLOWED';
    end if;

    update expense_categories
    set name = btrim(p_name), is_active = coalesce(p_is_active, is_active)
    where id = p_id
    returning * into v_category;
  end if;
  return v_category;
end;
$$;

-- BR-012 and P-63: the gym-wide settings.
create function update_gym_settings(
  p_card_replacement_price numeric,
  p_personal_min_price numeric,
  p_expiry_reminder_days smallint,
  p_auto_close_time time,
  p_double_scan_seconds smallint,
  p_shift_report_emails text[],
  p_backup_emails text[],
  p_logo_path text default null
)
returns gym_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff    staff := assert_staff_role(array['owner', 'admin']::app_role[]);
  v_settings gym_settings;
begin
  if p_card_replacement_price < 0 or p_personal_min_price < 0
     or p_expiry_reminder_days not between 1 and 14
     or p_double_scan_seconds not between 0 and 600
     or coalesce(cardinality(p_shift_report_emails), 0) < 1
     or coalesce(cardinality(p_backup_emails), 0) < 1 then
    raise exception 'E_VALIDATION';
  end if;

  update gym_settings
  set card_replacement_price = p_card_replacement_price,
      personal_min_price     = p_personal_min_price,
      expiry_reminder_days   = p_expiry_reminder_days,
      auto_close_time        = p_auto_close_time,
      double_scan_seconds    = p_double_scan_seconds,
      shift_report_emails    = p_shift_report_emails,
      backup_emails          = p_backup_emails,
      -- The logo is uploaded separately; null here means "leave it as it is".
      logo_path              = coalesce(p_logo_path, logo_path),
      updated_at             = now()
  where gym_id = v_staff.gym_id
  returning * into v_settings;
  if not found then raise exception 'E_FORBIDDEN'; end if;
  return v_settings;
end;
$$;

-- Only signed-in staff may call these; each one checks the role itself.
revoke execute on function
  assert_staff_role(app_role[]),
  class_slot_trainer_assigned()
  from public, anon, authenticated;

revoke execute on function
  upsert_trainer(uuid, text, boolean),
  set_trainer_fee(uuid, numeric),
  upsert_program(uuid, text, program_kind, boolean),
  set_trainer_program(uuid, uuid, boolean),
  upsert_class_slot(uuid, uuid, uuid, smallint, time, boolean),
  upsert_plan(uuid, text, plan_kind, smallint, duration_unit, numeric, boolean, boolean,
              boolean, smallint, smallint, boolean, smallint, boolean, numeric, numeric),
  upsert_product(uuid, text, numeric, numeric, boolean),
  upsert_expense_category(uuid, text, boolean),
  update_gym_settings(numeric, numeric, smallint, time, smallint, text[], text[], text)
  from public, anon;
