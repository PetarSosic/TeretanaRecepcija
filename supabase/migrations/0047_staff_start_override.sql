-- D-97: every staff role may change the start date of a membership being sold (BR-052
-- step 4, P-27a), not only the owner and admin. membership_sale no longer refuses another
-- start with E_FORBIDDEN, and the reason it stores names the role that chose it. Only that
-- block changes: the amount stays the owner's (BR-059), back-dated sales stay the owner's
-- (backdated_membership calls assert_owner, BR-120), and sell_membership and
-- register_member already pass the date through. The signature is unchanged, so the
-- privileges of migration 0030 (internal only) stay as they are.

/**
 * The sale shared by sell_membership, register_member and backdated_membership
 * (BR-050 to BR-060, BR-120), as in migration 0030, except that since D-97 any staff role
 * may choose the start date (BR-052 step 4).
 */
create or replace function membership_sale(
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

  -- BR-052: the computed start, unless staff choose another (step 4, D-97: any role). A
  -- back-dated sale computes it as of the day it was sold, not as of today.
  v_calc := calc_membership_start(p_member, p_plan, case when p_backdated then v_paid_on else v_today end);
  if p_start_override is not null and p_start_override <> v_calc.start_date then
    v_calc.start_date := p_start_override;
    v_calc.end_date := membership_end_date(p_start_override, v_plan.duration_value, v_plan.duration_unit);
    -- D-97: the reason names the role; the admin counts as the owner (D-58).
    v_calc.reason := case p_staff.role
      when 'manager'      then 'Početak je odredio menadžer.'
      when 'receptionist' then 'Početak je odredio recepcioner.'
      else                     'Početak je odredio vlasnik.'
    end;
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
