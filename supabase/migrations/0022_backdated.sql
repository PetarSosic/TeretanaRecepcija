-- M-12: back-dated entries (F-23, BR-120), used after an internet outage. All four are
-- owner-only, carry `is_backdated = true`, and have no shift, which is what keeps them
-- out of every shift report and out of expected cash (BR-115) while still counting in
-- finance and statistics (BR-150, BR-151).

/**
 * BR-120: `membership_sale` gains the two things a back-dated sale needs — the day the
 * money was actually taken, and the flag that detaches the record from any shift. The
 * nine leading arguments and the behaviour for a normal sale are unchanged, so
 * `sell_membership` and `register_member` keep calling it exactly as before.
 */
drop function membership_sale(staff, uuid, uuid, uuid, uuid, numeric, integer, payment_method, date);

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
  p_backdated boolean default false
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
    gym_id, member_id, plan_id, trainer_id, start_date, end_date, start_reason,
    covers_gym, covers_group, covers_personal,
    gym_visit_limit, group_session_limit, personal_session_limit,
    is_backdated, created_by, shift_id
  ) values (
    p_staff.gym_id, p_member, p_plan, v_trainer, v_calc.start_date, v_calc.end_date, v_calc.reason,
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
 * BR-120 and BR-083: a visit the receptionist could not record at the time. The owner
 * gives the date and both times; the membership is chosen as of that date (BR-074), and
 * the visit is marked back-dated with no shift.
 */
create function backdated_visit(
  p_member    uuid,
  p_date      date,
  p_check_in  time,
  p_check_out time,
  p_type      visit_type,
  p_trainer   uuid default null,
  p_slot      uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff      staff := assert_owner();
  v_today      date := gym_today(v_staff.gym_id);
  v_zone       text;
  v_in         timestamptz;
  v_out        timestamptz;
  v_membership uuid;
  v_unpaid     boolean := true;
  v_visit      visits;
begin
  if p_date is null or p_date > v_today
     or p_check_in is null or p_check_out is null or p_check_out <= p_check_in then
    raise exception 'E_VALIDATION';
  end if;
  perform 1 from members
  where id = p_member and gym_id = v_staff.gym_id and not is_anonymized;
  if not found then
    raise exception 'E_FORBIDDEN';
  end if;

  -- BR-078 and BR-023: the trainer and the slot follow the same rules as a live visit.
  if p_type = 'gym' then
    if p_trainer is not null or p_slot is not null then
      raise exception 'E_VALIDATION';
    end if;
  else
    if p_trainer is null then
      raise exception 'E_TRAINER_REQUIRED';
    end if;
    if not exists (select 1 from trainers where id = p_trainer and gym_id = v_staff.gym_id)
       or not trainer_can(p_trainer,
              case when p_type = 'personal' then 'personal' else 'group' end::program_kind) then
      raise exception 'E_TRAINER_NOT_ASSIGNED';
    end if;
    if p_type <> 'group' and p_slot is not null then
      raise exception 'E_VALIDATION';
    end if;
  end if;

  select timezone into v_zone from gyms where id = v_staff.gym_id;
  v_in  := (p_date + p_check_in) at time zone v_zone;
  v_out := (p_date + p_check_out) at time zone v_zone;

  -- BR-074: the membership that covered this type on that day, the one ending soonest.
  select m.id into v_membership
  from memberships m
  where m.member_id = p_member and m.voided_at is null
    and membership_covers(m.id, p_type, p_date)
  order by m.end_date
  limit 1;
  v_unpaid := v_membership is null;

  insert into visits (
    gym_id, member_id, membership_id, visit_type, trainer_id, class_slot_id,
    is_unpaid, is_manual, is_backdated, checked_in_at, checked_in_by,
    checked_out_at, checked_out_by, shift_id
  ) values (
    v_staff.gym_id, p_member, v_membership, p_type, p_trainer, p_slot,
    v_unpaid, true, true, v_in, v_staff.id, v_out, v_staff.id, null
  )
  returning * into v_visit;

  return json_build_object(
    'visit_id', v_visit.id,
    'membership_id', v_membership,
    'is_unpaid', v_unpaid
  );
end;
$$;

/** BR-120: a membership sold on a past day, with its own start and payment dates. */
create function backdated_membership(
  p_member     uuid,
  p_plan       uuid,
  p_trainer    uuid,
  p_amount     numeric,
  p_sessions   integer,
  p_method     payment_method,
  p_paid_on    date,
  p_start_date date default null
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
    p_start_date, p_paid_on, true
  );
end;
$$;

/** BR-120 and BR-100: day passes sold on a past day. */
create function backdated_day_passes(p_qty integer, p_method payment_method, p_paid_on date)
returns payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff   staff := assert_owner();
  v_plan    plans;
  v_payment payments;
begin
  if p_qty is null or p_qty not between 1 and 20 or p_method is null
     or p_paid_on is null or p_paid_on > gym_today(v_staff.gym_id) then
    raise exception 'E_VALIDATION';
  end if;

  select * into v_plan from plans
  where gym_id = v_staff.gym_id and kind = 'day_pass' and is_active
  order by sort_order, name
  limit 1;
  if not found then
    raise exception 'E_VALIDATION';
  end if;

  insert into payments (gym_id, kind, plan_id, quantity, amount, method, paid_on,
                        is_backdated, created_by, shift_id)
  values (v_staff.gym_id, 'day_pass', v_plan.id, p_qty, round(v_plan.price * p_qty, 2),
          p_method, p_paid_on, true, v_staff.id, null)
  returning * into v_payment;
  return v_payment;
end;
$$;

/**
 * BR-120 and BR-034: a card replacement fee taken on a past day. The card itself was
 * swapped at the desk when it happened, so only the money is recorded here.
 */
create function backdated_card_fee(p_member uuid, p_method payment_method, p_paid_on date)
returns payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff   staff := assert_owner();
  v_fee     numeric(10,2);
  v_payment payments;
begin
  if p_method is null or p_paid_on is null or p_paid_on > gym_today(v_staff.gym_id) then
    raise exception 'E_VALIDATION';
  end if;
  perform 1 from members
  where id = p_member and gym_id = v_staff.gym_id and not is_anonymized;
  if not found then
    raise exception 'E_FORBIDDEN';
  end if;

  select card_replacement_price into v_fee from gym_settings where gym_id = v_staff.gym_id;

  insert into payments (gym_id, kind, member_id, amount, method, paid_on,
                        is_backdated, created_by, shift_id)
  values (v_staff.gym_id, 'card_replacement', p_member, v_fee, p_method, p_paid_on,
          true, v_staff.id, null)
  returning * into v_payment;
  return v_payment;
end;
$$;

-- Function privileges -------------------------------------------------------------------
revoke execute on function
  membership_sale(staff, uuid, uuid, uuid, uuid, numeric, integer, payment_method, date, date, boolean),
  backdated_visit(uuid, date, time, time, visit_type, uuid, uuid),
  backdated_membership(uuid, uuid, uuid, numeric, integer, payment_method, date, date),
  backdated_day_passes(integer, payment_method, date),
  backdated_card_fee(uuid, payment_method, date)
  from public, anon;
revoke execute on function
  membership_sale(staff, uuid, uuid, uuid, uuid, numeric, integer, payment_method, date, date, boolean)
  from authenticated;
