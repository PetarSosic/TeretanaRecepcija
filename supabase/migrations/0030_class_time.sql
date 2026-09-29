-- D-71 (BR-058a): a group member's fixed class time ("Fiksni termin").
--
-- The owner decided on 29.09.2026 that selling a plan which covers group training
-- (Grupni, G+T) also records the class the member will attend: one of the chosen
-- trainer's start times in the group schedule, with every day that time is held
-- ("Uto, čet, sub · 08:00"). A trainer with no active time cannot be sold. Reception
-- may change the time later on S-07 without a new sale. The time is stored on the
-- membership beside its trainer; the days are read from the schedule when shown.

alter table memberships add column class_time time;
alter table memberships add constraint memberships_class_time_group
  check (class_time is null or (covers_group and trainer_id is not null));

/**
 * D-71: one of the trainer's active group class times. A slot counts while it, its
 * program (of kind group) and therefore the trainer's assignment are active (BR-025:
 * removing an assignment deactivates its slots, migration 0006).
 */
create function class_time_active(p_gym uuid, p_trainer uuid, p_time time)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from class_slots cs
    join programs p on p.id = cs.program_id
    where cs.gym_id = p_gym
      and cs.trainer_id = p_trainer
      and cs.starts_at = p_time
      and cs.is_active
      and p.is_active
      and p.kind = 'group'
  );
$$;

-- The sale and its three callers gain p_class_time. PostgREST calls them by name, so
-- the old signatures are dropped rather than left beside the new ones as overloads.
drop function register_member(text, text, text, text, text, date, uuid, uuid, numeric,
                              integer, payment_method, boolean);
drop function sell_membership(uuid, uuid, uuid, numeric, integer, payment_method, date);
drop function backdated_membership(uuid, uuid, uuid, numeric, integer, payment_method,
                                   date, date);
drop function membership_sale(staff, uuid, uuid, uuid, uuid, numeric, integer,
                              payment_method, date, date, boolean);

/**
 * The sale shared by sell_membership, register_member and backdated_membership
 * (BR-050 to BR-060, BR-120). Unchanged from migration 0022 except for D-71: a plan
 * that covers group training and needs a trainer also needs the member's fixed class
 * time, one of that trainer's active times.
 */
create function membership_sale(
  p_staff staff,
  p_shift uuid,
  p_member uuid,
  p_plan uuid,
  p_trainer uuid,
  p_amount numeric,
  p_sessions integer,
  p_method payment_method,
  p_start_override date,
  p_paid_on date default null,
  p_backdated boolean default false,
  p_class_time time default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_owner   boolean := p_staff.role in ('owner', 'admin');
  v_today      date := gym_today(p_staff.gym_id);
  v_paid_on    date := coalesce(p_paid_on, v_today);
  v_plan       plans;
  v_finance    plan_finance;
  v_min        numeric(10,2);
  v_amount     numeric(10,2);
  v_trainer    uuid;
  v_class_time time;
  v_calc       membership_start;
  v_membership memberships;
  v_payment    payments;
  v_linked     integer;
begin
  select * into v_plan from plans
  where id = p_plan and gym_id = p_staff.gym_id and is_active and kind <> 'day_pass';
  if not found or p_method is null then
    raise exception 'E_VALIDATION';
  end if;

  -- BR-120: the payment day is the owner's, but never in the future.
  if v_paid_on > v_today then
    raise exception 'E_VALIDATION';
  end if;

  -- BR-058 and BR-023: a trainer where the plan needs one, from the right program kind.
  if v_plan.requires_trainer then
    if p_trainer is null then
      raise exception 'E_TRAINER_REQUIRED';
    end if;
    if not exists (select 1 from trainers where id = p_trainer and gym_id = p_staff.gym_id)
       or not trainer_can(
            p_trainer,
            case when v_plan.kind = 'personal' then 'personal' else 'group' end::program_kind
          ) then
      raise exception 'E_TRAINER_NOT_ASSIGNED';
    end if;
    v_trainer := p_trainer;
  end if;

  -- D-71 (BR-058a): the fixed class time, one of the chosen trainer's active times.
  if v_plan.covers_group and v_trainer is not null then
    if p_class_time is null then
      raise exception 'E_CLASS_TIME_REQUIRED';
    end if;
    if not class_time_active(p_staff.gym_id, v_trainer, p_class_time) then
      raise exception 'E_CLASS_TIME_INVALID';
    end if;
    v_class_time := p_class_time;
  end if;

  -- BR-059: the list price, which only the owner may change; Personalni is entered.
  if v_plan.kind = 'personal' then
    if p_amount is null or p_sessions is null or p_sessions not between 1 and 50 then
      raise exception 'E_VALIDATION';
    end if;
    select personal_min_price into v_min from gym_settings where gym_id = p_staff.gym_id;
    if p_amount < v_min then
      raise exception 'E_AMOUNT_BELOW_MIN';             -- E13
    end if;
    v_amount := round(p_amount, 2);
  elsif p_amount is null or p_amount = v_plan.price then
    v_amount := v_plan.price;
  elsif v_is_owner and p_amount >= 0 then
    v_amount := round(p_amount, 2);
  elsif v_is_owner then
    raise exception 'E_VALIDATION';
  else
    raise exception 'E_AMOUNT_LOCKED';
  end if;

  -- BR-052: the computed start, unless the owner overrides it (step 4). A back-dated
  -- sale computes it as of the day it was sold, not as of today.
  v_calc := calc_membership_start(p_member, p_plan, case when p_backdated then v_paid_on else v_today end);
  if p_start_override is not null and p_start_override <> v_calc.start_date then
    if not v_is_owner then
      raise exception 'E_FORBIDDEN';
    end if;
    v_calc.start_date := p_start_override;
    v_calc.end_date := membership_end_date(p_start_override, v_plan.duration_value, v_plan.duration_unit);
    v_calc.reason := 'Početak je odredio vlasnik.';
    -- The unpaid visits the chosen period covers, up to today.
    select coalesce(array_agg(v.id order by v.checked_in_at), '{}') into v_calc.visit_ids
    from visits v
    where v.member_id = p_member
      and v.is_unpaid and v.membership_id is null
      and ((v.visit_type = 'gym' and v_plan.covers_gym)
        or (v.visit_type = 'group' and v_plan.covers_group)
        or (v.visit_type = 'personal' and v_plan.covers_personal))
      and gym_local_date(v.gym_id, v.checked_in_at)
          between v_calc.start_date and least(v_calc.end_date, v_today);
  end if;

  -- BR-050: coverage, limits and the trainer are copied, never looked up again.
  insert into memberships (
    gym_id, member_id, plan_id, trainer_id, class_time, start_date, end_date, start_reason,
    covers_gym, covers_group, covers_personal,
    gym_visit_limit, group_session_limit, personal_session_limit,
    is_backdated, created_by, shift_id
  ) values (
    p_staff.gym_id, p_member, p_plan, v_trainer, v_class_time, v_calc.start_date,
    v_calc.end_date, v_calc.reason,
    v_plan.covers_gym, v_plan.covers_group, v_plan.covers_personal,
    v_plan.gym_visit_limit, v_plan.group_session_limit,
    case when v_plan.kind = 'personal' then p_sessions end,
    p_backdated, p_staff.id, p_shift
  )
  returning * into v_membership;

  -- BR-050 and D-62: the financial terms, frozen at sale in the owner-only table.
  select * into v_finance from plan_finance where plan_id = p_plan;
  insert into membership_finance (
    membership_id, gym_id, gym_fixed_amount, trainer_share_pct, personal_gym_fee
  ) values (
    v_membership.id,
    p_staff.gym_id,
    coalesce(v_finance.gym_fixed_amount, 0),
    case
      when v_plan.kind in ('group', 'combo') then resolve_group_share(v_trainer, p_plan)
      else v_finance.trainer_share_pct
    end,
    case
      when v_plan.kind = 'personal' then
        (select tf.personal_gym_fee from trainer_finance tf where tf.trainer_id = v_trainer)
    end
  );

  -- BR-060 and BR-093: exactly one payment for the full amount.
  insert into payments (
    gym_id, kind, membership_id, member_id, plan_id, amount, method, paid_on,
    is_backdated, created_by, shift_id
  ) values (
    p_staff.gym_id, 'membership', v_membership.id, p_member, p_plan, v_amount, p_method,
    v_paid_on, p_backdated, p_staff.id, p_shift
  )
  returning * into v_payment;

  -- BR-052 step 2: the unpaid visits become this membership's, oldest first and no more
  -- than a limit allows, so BR-053 and BR-055 stay true for the membership afterwards.
  with ranked as (
    select v.id,
           v.visit_type,
           row_number() over (partition by v.visit_type order by v.checked_in_at) as position
    from visits v
    where v.id = any (v_calc.visit_ids) and v.membership_id is null
  )
  update visits v
  set membership_id = v_membership.id
  from ranked r
  where v.id = r.id
    and r.position <= coalesce(
      case r.visit_type
        when 'gym'   then v_membership.gym_visit_limit
        when 'group' then v_membership.group_session_limit
        else              v_membership.personal_session_limit
      end,
      2147483647);
  get diagnostics v_linked = row_count;

  return json_build_object(
    'membership_id', v_membership.id,
    'payment_id', v_payment.id,
    'start_date', v_membership.start_date,
    'end_date', v_membership.end_date,
    'reason', v_membership.start_reason,
    'warning', v_calc.warning,
    'amount', v_payment.amount,
    'linked_visits', v_linked
  );
end;
$$;

/**
 * F-06 with "Prijavi odmah" (D-31, US-06.1 AC2), as in migration 0014, plus the fixed
 * class time of D-71. A new member holds only the membership just sold, so the visit
 * takes BR-073's preselected type, that membership, its trainer and the BR-075 default
 * slot; no question needs asking.
 */
create function register_member(
  p_card_code text,
  p_first text,
  p_last text,
  p_phone text,
  p_email text,
  p_dob date,
  p_plan uuid,
  p_trainer uuid,
  p_amount numeric,
  p_sessions integer,
  p_method payment_method,
  p_check_in boolean default false,
  p_class_time time default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff   staff := current_staff();
  v_shift   shifts := require_open_shift(v_staff.gym_id);
  v_card    cards;
  v_fields  members;
  v_number  integer;
  v_member  members;
  v_sale    json;
  v_options json;
  v_type    text;
  v_cand    json;
  v_trainer uuid;
  v_visit   json;
begin
  v_card := unassigned_card(v_staff.gym_id, p_card_code);
  v_fields := clean_member(v_staff.gym_id, p_first, p_last, p_phone, p_email, p_dob);

  -- BR-042: sequential per gym, never reused; the row lock serialises registrations.
  insert into member_counters (gym_id, last_number) values (v_staff.gym_id, 1)
  on conflict (gym_id) do update set last_number = member_counters.last_number + 1
  returning last_number into v_number;

  insert into members (
    gym_id, member_number, first_name, last_name, phone, email, date_of_birth, created_by
  ) values (
    v_staff.gym_id, v_number, v_fields.first_name, v_fields.last_name, v_fields.phone,
    v_fields.email, v_fields.date_of_birth, v_staff.id
  )
  returning * into v_member;

  update cards
  set status = 'active', member_id = v_member.id, assigned_at = now()
  where id = v_card.id;

  v_sale := membership_sale(
    v_staff, v_shift.id, v_member.id, p_plan, p_trainer, p_amount, p_sessions, p_method,
    null, null, false, p_class_time
  );

  if coalesce(p_check_in, false) then
    v_options := check_in_options(v_member.id);
    v_type := v_options ->> 'preselect';
    v_cand := v_options -> 'candidates' -> v_type -> 0;
    v_trainer := case when v_type = 'gym' then null else (v_cand ->> 'trainer_id')::uuid end;
    v_visit := perform_check_in(
      v_staff, v_member.id, v_type::visit_type, (v_cand ->> 'id')::uuid, v_trainer,
      case when v_type = 'group' then default_class_slot(v_staff.gym_id, v_trainer) end,
      false
    );
  end if;

  return json_build_object(
    'member_id', v_member.id,
    'member_number', v_member.member_number,
    'first_name', v_member.first_name,
    'last_name', v_member.last_name,
    'membership', v_sale,
    'check_in', v_visit
  );
end;
$$;

/** F-08: sell or renew (BR-050 to BR-060), with the D-71 fixed class time. */
create function sell_membership(
  p_member uuid,
  p_plan uuid,
  p_trainer uuid,
  p_amount numeric,
  p_sessions integer,
  p_method payment_method,
  p_start_override date default null,
  p_class_time time default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff staff := current_staff();
  v_shift shifts := require_open_shift(v_staff.gym_id);
begin
  -- The member row lock keeps two sales for one member from computing the same start.
  perform 1 from members
  where id = p_member and gym_id = v_staff.gym_id and not is_anonymized
  for update;
  if not found then
    raise exception 'E_FORBIDDEN';
  end if;

  return membership_sale(
    v_staff, v_shift.id, p_member, p_plan, p_trainer, p_amount, p_sessions, p_method,
    p_start_override, null, false, p_class_time
  );
end;
$$;

/** BR-120: a membership sold on a past day (S-22 works like S-08, D-71 included). */
create function backdated_membership(
  p_member     uuid,
  p_plan       uuid,
  p_trainer    uuid,
  p_amount     numeric,
  p_sessions   integer,
  p_method     payment_method,
  p_paid_on    date,
  p_start_date date default null,
  p_class_time time default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff staff := assert_owner();
begin
  perform 1 from members
  where id = p_member and gym_id = v_staff.gym_id and not is_anonymized
  for update;
  if not found then
    raise exception 'E_FORBIDDEN';
  end if;

  return membership_sale(
    v_staff, null, p_member, p_plan, p_trainer, p_amount, p_sessions, p_method,
    p_start_date, p_paid_on, true, p_class_time
  );
end;
$$;

/**
 * D-71: S-07 [Promijeni termin]. Any staff role changes the fixed class time of a group
 * membership that is neither voided nor expired, to another active time of the same
 * trainer. The trainer, amount and payment stay as sold (BR-050), and the memberships
 * trigger writes the change to the audit log (BR-096).
 */
create function set_membership_class_time(p_membership uuid, p_class_time time)
returns memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff      staff := current_staff();
  v_membership memberships;
begin
  -- S-07: an anonymized profile is read-only.
  select ms.* into v_membership
  from memberships ms
  join members m on m.id = ms.member_id
  where ms.id = p_membership and ms.gym_id = v_staff.gym_id and not m.is_anonymized
  for update of ms;
  if not found then
    raise exception 'E_FORBIDDEN';
  end if;

  if v_membership.voided_at is not null
     or not v_membership.covers_group
     or v_membership.trainer_id is null
     or v_membership.end_date < gym_today(v_staff.gym_id) then
    raise exception 'E_VALIDATION';
  end if;
  if p_class_time is null then
    raise exception 'E_CLASS_TIME_REQUIRED';
  end if;
  if not class_time_active(v_staff.gym_id, v_membership.trainer_id, p_class_time) then
    raise exception 'E_CLASS_TIME_INVALID';
  end if;

  update memberships
  set class_time = p_class_time
  where id = v_membership.id and class_time is distinct from p_class_time
  returning * into v_membership;
  return v_membership;
end;
$$;

-- S-07 Članarine gains the fixed class time; the return type changes, so it is
-- recreated. Otherwise as in migration 0012.
drop function member_memberships(uuid);

create function member_memberships(p_member uuid)
returns table (
  id uuid,
  plan_id uuid,
  plan_name text,
  plan_kind plan_kind,
  plan_is_active boolean,
  trainer_id uuid,
  trainer_name text,
  class_time time,
  start_date date,
  end_date date,
  start_reason text,
  status text,
  covers_gym boolean,
  covers_group boolean,
  covers_personal boolean,
  gym_visit_limit smallint,
  gym_used integer,
  group_session_limit smallint,
  group_used integer,
  personal_session_limit smallint,
  personal_used integer,
  is_backdated boolean,
  created_at timestamptz
)
language sql
stable
set search_path = public
as $$
  select ms.id, ms.plan_id, p.name, p.kind, p.is_active, ms.trainer_id, t.full_name,
         ms.class_time, ms.start_date, ms.end_date, ms.start_reason,
         membership_status(ms.id, gym_today(ms.gym_id)),
         ms.covers_gym, ms.covers_group, ms.covers_personal,
         ms.gym_visit_limit, membership_used(ms.id, 'gym'),
         ms.group_session_limit, membership_used(ms.id, 'group'),
         ms.personal_session_limit, membership_used(ms.id, 'personal'),
         ms.is_backdated, ms.created_at
  from memberships ms
  join plans p on p.id = ms.plan_id
  left join trainers t on t.id = ms.trainer_id
  where ms.member_id = p_member and ms.gym_id = my_gym()
  order by ms.end_date desc, ms.created_at desc;
$$;

-- Function privileges -------------------------------------------------------------------
-- Internal: only other security definer functions call these.
revoke execute on function
  class_time_active(uuid, uuid, time),
  membership_sale(staff, uuid, uuid, uuid, uuid, numeric, integer, payment_method, date,
                  date, boolean, time)
  from public, anon, authenticated;

-- Signed-in staff only; each RPC checks the role itself.
revoke execute on function
  register_member(text, text, text, text, text, date, uuid, uuid, numeric, integer,
                  payment_method, boolean, time),
  sell_membership(uuid, uuid, uuid, numeric, integer, payment_method, date, time),
  backdated_membership(uuid, uuid, uuid, numeric, integer, payment_method, date, date,
                       time),
  set_membership_class_time(uuid, time),
  member_memberships(uuid)
  from public, anon;
