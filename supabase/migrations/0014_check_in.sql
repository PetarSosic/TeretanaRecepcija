-- M-07: check-in and check-out (F-04, F-05, F-10). The scan decision of BR-070, the visit
-- type and membership choice of BR-073 to BR-076, the result of BR-079, and "Prijavi
-- odmah" at registration (US-06.1 AC2), which M-06 left refused.

/** BR-079: N, the member's visits that are unpaid and not yet covered by a later sale. */
create function unlinked_unpaid_count(p_member uuid)
returns int
language sql
stable
set search_path = public
as $$
  select count(*)::int from visits v
  where v.member_id = p_member and v.is_unpaid and v.membership_id is null;
$$;

/**
 * BR-075 and AS-12: the trainer's active slot today whose start is closest to now and
 * within ±90 minutes, or null ("Bez časa iz rasporeda").
 */
create function default_class_slot(p_gym uuid, p_trainer uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with local_now as (
    select (now() at time zone g.timezone) as ts from gyms g where g.id = p_gym
  )
  select cs.id
  from class_slots cs, local_now n
  where cs.gym_id = p_gym
    and cs.trainer_id = p_trainer
    and cs.is_active
    and cs.weekday = extract(isodow from n.ts)
    and abs(extract(epoch from (cs.starts_at - n.ts::time))) <= 90 * 60
  order by abs(extract(epoch from (cs.starts_at - n.ts::time))), cs.starts_at
  limit 1;
$$;

/** BR-079: the member as every result names them. */
create function member_brief(p_member uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'id', m.id,
    'member_number', m.member_number,
    'first_name', m.first_name,
    'last_name', m.last_name
  )
  from members m where m.id = p_member;
$$;

/**
 * BR-073 to BR-076: what S-03a offers for this member today, with every default decided
 * here so the screen never re-implements a rule:
 *   types        Teretana plus each type any membership in its date range covers, even
 *                with its sessions used up (BR-073);
 *   preselect    Teretana if a membership covers the gym today, else Grupni, else
 *                Personalni;
 *   candidates   per type, the memberships covering it today (BR-053), earliest end
 *                first, then earliest created (BR-074);
 *   trainers     BR-023 group and personal trainers, each group trainer with its
 *                BR-075 default slot for today;
 *   fallback     BR-075's trainer of the latest group or combo membership, used when a
 *                group visit would be unpaid;
 *   trainer_defaults  BR-058's latest trainer per kind, for [Produži članarinu].
 */
create function check_in_options(p_member uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member members;
  v_today  date;
  v_types  text[] := array['gym'];
  v_pre    text;
begin
  select * into v_member from members where id = p_member;
  v_today := gym_today(v_member.gym_id);

  if exists (select 1 from memberships m where m.member_id = p_member and m.voided_at is null
             and m.covers_group and v_today between m.start_date and m.end_date) then
    v_types := array_append(v_types, 'group');
  end if;
  if exists (select 1 from memberships m where m.member_id = p_member and m.voided_at is null
             and m.covers_personal and v_today between m.start_date and m.end_date) then
    v_types := array_append(v_types, 'personal');
  end if;

  v_pre := case
    when exists (select 1 from memberships m where m.member_id = p_member
                 and membership_covers(m.id, 'gym', v_today)) then 'gym'
    when 'group' = any (v_types) then 'group'
    when 'personal' = any (v_types) then 'personal'
    else 'gym'
  end;

  return json_build_object(
    'types', to_json(v_types),
    'preselect', v_pre,
    'candidates', (
      select json_object_agg(t.type, coalesce(c.list, '[]'::json))
      from unnest(v_types) as t(type)
      left join lateral (
        select json_agg(json_build_object(
                 'id', m.id,
                 'plan_name', p.name,
                 'end_date', m.end_date,
                 'trainer_id', m.trainer_id,
                 'remaining', case t.type
                   when 'gym'   then m.gym_visit_limit - membership_used(m.id, 'gym')
                   when 'group' then m.group_session_limit - membership_used(m.id, 'group')
                   else              m.personal_session_limit - membership_used(m.id, 'personal')
                 end
               ) order by m.end_date, m.created_at) as list
        from memberships m
        join plans p on p.id = m.plan_id
        where m.member_id = p_member
          and membership_covers(m.id, t.type::visit_type, v_today)
      ) c on true
    ),
    'group_trainers', coalesce((
      select json_agg(json_build_object(
               'id', t.id, 'full_name', t.full_name,
               'default_slot', default_class_slot(v_member.gym_id, t.id)
             ) order by t.full_name)
      from trainers t
      where t.gym_id = v_member.gym_id and trainer_can(t.id, 'group')
    ), '[]'::json),
    'personal_trainers', coalesce((
      select json_agg(json_build_object('id', t.id, 'full_name', t.full_name)
                      order by t.full_name)
      from trainers t
      where t.gym_id = v_member.gym_id and trainer_can(t.id, 'personal')
    ), '[]'::json),
    -- BR-075: any of the trainer's slots today may be chosen instead of the default.
    'slots', coalesce((
      select json_agg(json_build_object(
               'id', cs.id, 'trainer_id', cs.trainer_id,
               'starts_at', to_char(cs.starts_at, 'HH24:MI')
             ) order by cs.starts_at)
      from class_slots cs
      join programs pr on pr.id = cs.program_id and pr.kind = 'group'
      where cs.gym_id = v_member.gym_id and cs.is_active
        and cs.weekday = extract(isodow from v_today)
    ), '[]'::json),
    'fallback_group_trainer', (
      select m.trainer_id from memberships m
      where m.member_id = p_member and m.voided_at is null and m.covers_group
        and m.trainer_id is not null
      order by m.start_date desc, m.created_at desc limit 1
    ),
    'trainer_defaults', json_build_object(
      'group', (select m.trainer_id from memberships m
                where m.member_id = p_member and m.covers_group and m.trainer_id is not null
                order by m.start_date desc, m.created_at desc limit 1),
      'personal', (select m.trainer_id from memberships m
                   where m.member_id = p_member and m.covers_personal and m.trainer_id is not null
                   order by m.start_date desc, m.created_at desc limit 1)
    )
  );
end;
$$;

/**
 * BR-071 to BR-079, shared by check_in, scan_card and register_member: records the visit
 * and returns what S-03b, S-03c or S-03d shows. A null membership means "the BR-074
 * default": the earliest-ending candidate, or an unpaid visit when there is none.
 */
create function perform_check_in(
  p_staff staff,
  p_member uuid,
  p_type visit_type,
  p_membership uuid,
  p_trainer uuid,
  p_slot uuid,
  p_manual boolean
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today      date := gym_today(p_staff.gym_id);
  v_membership memberships;
  v_trainer    uuid;
  v_slot       uuid;
  v_visit      visits;
  v_remaining  int;
begin
  -- The row lock serialises two desks checking in the same member (BR-071).
  perform 1 from members
  where id = p_member and gym_id = p_staff.gym_id and not is_anonymized
  for update;
  if not found then
    raise exception 'E_FORBIDDEN';
  end if;
  if exists (select 1 from visits where member_id = p_member and checked_out_at is null) then
    raise exception 'E_MEMBER_HAS_OPEN_VISIT';
  end if;
  if p_type is null then
    raise exception 'E_VALIDATION';
  end if;

  -- BR-074: the chosen candidate must cover the type today; none chosen means the default.
  if p_membership is not null then
    select * into v_membership from memberships
    where id = p_membership and member_id = p_member;
    if not found or not membership_covers(p_membership, p_type, v_today) then
      raise exception 'E_VALIDATION';
    end if;
  else
    select m.* into v_membership from memberships m
    where m.member_id = p_member and membership_covers(m.id, p_type, v_today)
    order by m.end_date, m.created_at
    limit 1;
  end if;

  -- BR-075 to BR-077: trainers and slots only where the type has them.
  if p_type = 'gym' then
    v_trainer := null;
    v_slot := null;
  else
    if p_trainer is null then
      raise exception 'E_TRAINER_REQUIRED';
    end if;
    if not exists (select 1 from trainers where id = p_trainer and gym_id = p_staff.gym_id)
       or not trainer_can(p_trainer, p_type::text::program_kind) then
      raise exception 'E_TRAINER_NOT_ASSIGNED';
    end if;
    v_trainer := p_trainer;
    if p_type = 'group' and p_slot is not null then
      if not exists (
        select 1 from class_slots cs
        where cs.id = p_slot and cs.gym_id = p_staff.gym_id and cs.trainer_id = p_trainer
          and cs.is_active and cs.weekday = extract(isodow from v_today)
      ) then
        raise exception 'E_VALIDATION';
      end if;
      v_slot := p_slot;
    end if;
  end if;

  -- BR-078: entry is never blocked; without a covering membership the visit is unpaid.
  insert into visits (
    gym_id, member_id, membership_id, visit_type, trainer_id, class_slot_id,
    is_unpaid, is_manual, checked_in_by, shift_id
  ) values (
    p_staff.gym_id, p_member, v_membership.id, p_type, v_trainer, v_slot,
    v_membership.id is null, coalesce(p_manual, false), p_staff.id,
    (open_shift(p_staff.gym_id)).id
  )
  returning * into v_visit;

  if v_membership.id is not null then
    v_remaining := case p_type
      when 'gym'   then v_membership.gym_visit_limit - membership_used(v_membership.id, 'gym')
      when 'group' then v_membership.group_session_limit - membership_used(v_membership.id, 'group')
      else              v_membership.personal_session_limit - membership_used(v_membership.id, 'personal')
    end;
  end if;

  return json_build_object(
    'visit_id', v_visit.id,
    'member', member_brief(p_member),
    'visit_type', p_type,
    'covered', v_membership.id is not null,
    'plan_name', (select name from plans where id = v_membership.plan_id),
    'end_date', v_membership.end_date,
    'status', case when v_membership.id is not null
                   then membership_status(v_membership.id, v_today) end,
    -- null = Neograničeno
    'remaining', v_remaining,
    'unpaid_count', unlinked_unpaid_count(p_member),
    'trainer_defaults', check_in_options(p_member) -> 'trainer_defaults'
  );
end;
$$;

/**
 * BR-073 and US-04.2: the check-in flow for a member with no open visit. When Teretana is
 * the only option and at most one membership covers it, the visit is recorded at once
 * (one scan, zero clicks); otherwise S-03a is needed and the options are returned.
 */
create function start_check_in(p_staff staff, p_member uuid, p_manual boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_options json := check_in_options(p_member);
begin
  if json_array_length(v_options -> 'types') = 1
     and json_array_length(v_options -> 'candidates' -> 'gym') <= 1 then
    return json_build_object(
      'result', 'checked_in',
      'check_in', perform_check_in(p_staff, p_member, 'gym', null, null, null, p_manual)
    );
  end if;
  return json_build_object(
    'result', 'choose',
    'member', member_brief(p_member),
    'manual', coalesce(p_manual, false),
    'options', v_options
  );
end;
$$;

/** BR-072: the check-out itself, with the duration S-03 and the toast show. */
create function perform_check_out(p_staff staff, p_visit uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit visits;
begin
  update visits
  set checked_out_at = now(), checked_out_by = p_staff.id
  where id = p_visit and gym_id = p_staff.gym_id and checked_out_at is null
  returning * into v_visit;
  if not found then
    raise exception 'E_VALIDATION';
  end if;
  return json_build_object(
    'result', 'checked_out',
    'visit_id', v_visit.id,
    'member', member_brief(v_visit.member_id),
    'duration_seconds', floor(extract(epoch from v_visit.checked_out_at - v_visit.checked_in_at))
  );
end;
$$;

-- RPCs (doc 07 §5) --------------------------------------------------------------------

/**
 * BR-070: one scan, one decision. Card problems are answers rather than errors, so the
 * status area can show them without a round trip for the message; nothing is recorded
 * for them. Check-out happens here unless the double-scan guard asks first (BR-072).
 */
create function scan_card(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff   staff := current_staff();
  v_code    text := btrim(coalesce(p_code, ''));
  v_card    cards;
  v_open    visits;
  v_guard   smallint;
  v_seconds int;
begin
  if v_code !~ '^[0-9]{10}$' then
    return json_build_object('result', 'invalid');
  end if;
  select * into v_card from cards where code = v_code and gym_id = v_staff.gym_id;
  if not found then
    return json_build_object('result', 'unknown');
  end if;
  if v_card.status = 'deactivated' then
    return json_build_object('result', 'deactivated');
  end if;
  if v_card.status = 'unassigned' then
    return json_build_object('result', 'unassigned', 'code', v_card.code);
  end if;

  -- An active card: check the member out if they are in, otherwise in (BR-071).
  perform 1 from members where id = v_card.member_id for update;
  select * into v_open from visits
  where member_id = v_card.member_id and checked_out_at is null;
  if found then
    select double_scan_seconds into v_guard from gym_settings where gym_id = v_staff.gym_id;
    v_seconds := floor(extract(epoch from now() - v_open.checked_in_at));
    if v_seconds < v_guard then
      return json_build_object(
        'result', 'confirm_checkout',
        'visit_id', v_open.id,
        'member', member_brief(v_card.member_id),
        'seconds', v_seconds
      );
    end if;
    return perform_check_out(v_staff, v_open.id);
  end if;

  return start_check_in(v_staff, v_card.member_id, false);
end;
$$;

/**
 * F-05 and BR-080: the manual start, from the reception search or [Ručna prijava] on
 * S-07. It answers like a scan of the member's card, with is_manual set.
 */
create function begin_check_in(p_member uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff staff := current_staff();
begin
  if not exists (select 1 from members where id = p_member and gym_id = v_staff.gym_id
                 and not is_anonymized) then
    raise exception 'E_FORBIDDEN';
  end if;
  if exists (select 1 from visits where member_id = p_member and checked_out_at is null) then
    raise exception 'E_MEMBER_HAS_OPEN_VISIT';
  end if;
  return start_check_in(v_staff, p_member, true);
end;
$$;

/** S-03a [Prijavi]: the visit with the type, membership, trainer and slot chosen. */
create function check_in(
  p_member uuid,
  p_type visit_type,
  p_membership uuid,
  p_trainer uuid,
  p_slot uuid,
  p_manual boolean
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff staff := current_staff();
begin
  return perform_check_in(v_staff, p_member, p_type, p_membership, p_trainer, p_slot, p_manual);
end;
$$;

/**
 * BR-072 and BR-080: check a visit out. From a scan inside the guard time, S-03e asks
 * first and then calls this with p_confirmed; [Odjavi] in "U teretani" is a deliberate
 * click, so it is confirmed by nature.
 */
create function check_out(p_visit uuid, p_confirmed boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff   staff := current_staff();
  v_visit   visits;
  v_guard   smallint;
  v_seconds int;
begin
  select * into v_visit from visits
  where id = p_visit and gym_id = v_staff.gym_id and checked_out_at is null;
  if not found then
    raise exception 'E_VALIDATION';
  end if;
  if not coalesce(p_confirmed, false) then
    select double_scan_seconds into v_guard from gym_settings where gym_id = v_staff.gym_id;
    v_seconds := floor(extract(epoch from now() - v_visit.checked_in_at));
    if v_seconds < v_guard then
      return json_build_object(
        'result', 'confirm_checkout',
        'visit_id', v_visit.id,
        'member', member_brief(v_visit.member_id),
        'seconds', v_seconds
      );
    end if;
  end if;
  return perform_check_out(v_staff, p_visit);
end;
$$;

/** BR-081 and US-05.2: who is in the gym now, and how many visits today. */
create function reception_panel()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff staff := current_staff();
  v_today date := gym_today(v_staff.gym_id);
  v_tz    text := (select timezone from gyms where id = v_staff.gym_id);
begin
  return json_build_object(
    'in_gym', coalesce((
      select json_agg(json_build_object(
               'visit_id', v.id,
               'member_id', m.id,
               'member_number', m.member_number,
               'first_name', m.first_name,
               'last_name', m.last_name,
               'visit_type', v.visit_type,
               'checked_in_at', v.checked_in_at
             ) order by v.checked_in_at)
      from visits v join members m on m.id = v.member_id
      where v.gym_id = v_staff.gym_id and v.checked_out_at is null
    ), '[]'::json),
    'today_count', (
      select count(*) from visits v
      where v.gym_id = v_staff.gym_id
        and v.checked_in_at >= (v_today::timestamp at time zone v_tz)
        and v.checked_in_at < ((v_today + 1)::timestamp at time zone v_tz)
    )
  );
end;
$$;

/**
 * F-06 with "Prijavi odmah" (D-31, US-06.1 AC2): M-06 refused the flag; now the member
 * is checked in within the same transaction. A new member holds only the membership just
 * sold, so the visit takes BR-073's preselected type, that membership, its trainer and
 * the BR-075 default slot; no question needs asking.
 */
create or replace function register_member(
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
  p_check_in boolean default false
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
    v_staff, v_shift.id, v_member.id, p_plan, p_trainer, p_amount, p_sessions, p_method, null
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

-- Function privileges -------------------------------------------------------------------
revoke execute on function
  default_class_slot(uuid, uuid),
  member_brief(uuid),
  check_in_options(uuid),
  perform_check_in(staff, uuid, visit_type, uuid, uuid, uuid, boolean),
  start_check_in(staff, uuid, boolean),
  perform_check_out(staff, uuid)
  from public, anon, authenticated;

revoke execute on function
  unlinked_unpaid_count(uuid),
  scan_card(text),
  begin_check_in(uuid),
  check_in(uuid, visit_type, uuid, uuid, uuid, boolean),
  check_out(uuid, boolean),
  reception_panel()
  from public, anon;
