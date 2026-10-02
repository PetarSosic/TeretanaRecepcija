-- D-100: a membership may be paused, 7 days at most in total (BR-056, which used to forbid
-- it). Any staff role pauses it on S-07 from a day that is today or later and inside its
-- validity. Every paused day moves "Važi do" one day later, and a membership that was
-- sold to follow it (BR-052 step 1) moves with it. On a paused day the membership covers
-- nothing and its status is "Pauzirana". A member who comes in ends the pause that day:
-- the scan or the manual start of a check-in (start_check_in, check_in) gives back the
-- days not yet used, and "Važi do" keeps only the days that were paused. [Prekini pauzu]
-- on S-07 does the same by hand. Nothing existing is deleted or rewritten: the table is
-- new, and a membership changes only when it is paused.

create table membership_pauses (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references gyms(id),
  membership_id uuid not null references memberships(id),
  paused_from   date not null,
  -- The last paused day, inclusive. paused_from - 1 when the pause was ended on its first
  -- day or before it began, so the row keeps what happened but holds no day.
  paused_until  date not null,
  ended_early   boolean not null default false,
  created_by    uuid not null references staff(id),
  created_at    timestamptz not null default now(),
  check (paused_until >= paused_from - 1)
);
create index membership_pauses_membership_idx on membership_pauses (membership_id);

-- BR-096: pauses are audited; the membership's new "Važi do" is audited by its own trigger.
create trigger membership_pauses_audit
  after insert or update on membership_pauses
  for each row execute function audit_row();

alter table membership_pauses enable row level security;

-- Every role sees the pauses of its own gym, as it sees the memberships (doc 07 §6).
create policy membership_pauses_select on membership_pauses
  for select to authenticated
  using (gym_id = (select my_gym()));

revoke all on membership_pauses from anon, authenticated;
grant select on membership_pauses to authenticated;

/** BR-056 (D-100): the days a membership's pauses hold, at most 7. */
create function membership_paused_days(p_membership uuid)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce(sum(mp.paused_until - mp.paused_from + 1), 0)::int
  from membership_pauses mp
  where mp.membership_id = p_membership and mp.paused_until >= mp.paused_from;
$$;

/** BR-056 (D-100): is the membership paused on date X. */
create function membership_paused(p_membership uuid, p_date date)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from membership_pauses mp
    where mp.membership_id = p_membership
      and p_date between mp.paused_from and mp.paused_until
  );
$$;

/** BR-053: does membership M cover visit type T on date X. D-100: never on a paused day. */
create or replace function membership_covers(p_membership uuid, p_type visit_type, p_date date)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce((
    select m.voided_at is null
       and p_date between m.start_date and m.end_date
       and not membership_paused(m.id, p_date)
       and case p_type
             when 'gym'   then m.covers_gym
             when 'group' then m.covers_group
             else              m.covers_personal
           end
       -- A null limit means unlimited, which the null comparison turns into true.
       and coalesce(
             case p_type
               when 'gym'   then m.gym_visit_limit
               when 'group' then m.group_session_limit
               else              m.personal_session_limit
             end > membership_used(m.id, p_type),
             true)
    from memberships m
    where m.id = p_membership
  ), false);
$$;

/**
 * BR-054: the display status on a date. A G+T membership whose group sessions are gone
 * still covers the gym, so it stays 'active'. D-100: 'paused' on a paused day.
 */
create or replace function membership_status(p_membership uuid, p_date date)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when m.voided_at is not null         then 'voided'
    when p_date < m.start_date           then 'upcoming'
    when p_date > m.end_date             then 'expired'
    when membership_paused(m.id, p_date) then 'paused'
    when membership_covers(m.id, 'gym', p_date)
      or membership_covers(m.id, 'group', p_date)
      or membership_covers(m.id, 'personal', p_date) then 'active'
    else 'used_up'
  end
  from memberships m
  where m.id = p_membership;
$$;

/**
 * D-100: when a membership's last day moves by p_days, the memberships sold to follow it
 * (BR-052 step 1: same member, a shared visit type, starting the day after its old last
 * day) move by as many days, with their pauses, and so on down the chain. A start chosen
 * by staff (step 4) that does not touch the old last day stays where it is.
 */
create function shift_chained_memberships(p_membership memberships, p_old_end date,
                                          p_days integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next memberships;
begin
  for v_next in
    select * from memberships m
    where m.member_id = p_membership.member_id
      and m.id <> p_membership.id
      and m.voided_at is null
      and m.start_date = p_old_end + 1
      and ((m.covers_gym and p_membership.covers_gym)
        or (m.covers_group and p_membership.covers_group)
        or (m.covers_personal and p_membership.covers_personal))
    for update
  loop
    update memberships
    set start_date = start_date + p_days,
        end_date = end_date + p_days,
        -- The BR-052 reason names the last day it follows, which has just moved.
        start_reason = case
          when start_reason like 'Nastavlja se na članarinu koja važi do %'
            then 'Nastavlja se na članarinu koja važi do '
                 || to_char(p_old_end + p_days, 'DD.MM.YYYY')
          else start_reason
        end
    where id = v_next.id;
    update membership_pauses
    set paused_from = paused_from + p_days,
        paused_until = paused_until + p_days
    where membership_id = v_next.id;
    perform shift_chained_memberships(v_next, v_next.end_date, p_days);
  end loop;
end;
$$;

/**
 * D-100: end a pause as of p_today. One that has not begun is given back whole; one that
 * has keeps the days before p_today. "Važi do" loses the days given back, and the
 * memberships that follow move back with it. Returns the number of days given back.
 */
create function finish_pause(p_pause uuid, p_today date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pause      membership_pauses;
  v_membership memberships;
  v_last       date;
  v_back       integer;
begin
  select * into v_pause from membership_pauses where id = p_pause for update;
  v_last := greatest(v_pause.paused_from, p_today) - 1;
  v_back := v_pause.paused_until - v_last;
  if v_back <= 0 then
    return 0;
  end if;

  update membership_pauses
  set paused_until = v_last, ended_early = true
  where id = v_pause.id;
  select * into v_membership from memberships where id = v_pause.membership_id for update;
  update memberships set end_date = end_date - v_back where id = v_membership.id;
  perform shift_chained_memberships(v_membership, v_membership.end_date, -v_back);
  return v_back;
end;
$$;

/**
 * D-100: a member who comes in on a paused day ends that pause (BR-056). Returns true when
 * a pause was ended, so the desk can say so.
 */
create function end_member_pauses(p_member uuid, p_today date)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pause uuid;
  v_ended boolean := false;
begin
  for v_pause in
    select mp.id
    from membership_pauses mp
    join memberships m on m.id = mp.membership_id
    where m.member_id = p_member
      and m.voided_at is null
      and p_today between mp.paused_from and mp.paused_until
  loop
    if finish_pause(v_pause, p_today) > 0 then
      v_ended := true;
    end if;
  end loop;
  return v_ended;
end;
$$;

/**
 * S-07 [Pauziraj] (BR-056, D-100): any staff role pauses a membership for p_days from
 * p_from. The pause begins today or later, inside the membership's validity, does not
 * overlap another of its pauses, and keeps the membership's pauses at 7 days in total.
 * It cannot begin today when the member already came in today on this membership.
 */
create function pause_membership(p_membership uuid, p_from date, p_days integer)
returns membership_pauses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff      staff := current_staff();
  v_today      date := gym_today(v_staff.gym_id);
  v_membership memberships;
  v_pause      membership_pauses;
begin
  -- The member row lock serialises a pause with a scan or a sale for the same member.
  perform 1
  from members m
  join memberships ms on ms.member_id = m.id
  where ms.id = p_membership and ms.gym_id = v_staff.gym_id and not m.is_anonymized
  for update of m;
  if not found then
    raise exception 'E_FORBIDDEN';
  end if;
  select * into v_membership from memberships where id = p_membership for update;

  if v_membership.voided_at is not null
     or p_from is null or p_days is null or p_days < 1
     or p_from < greatest(v_membership.start_date, v_today)
     or p_from > v_membership.end_date then
    raise exception 'E_PAUSE_INVALID';
  end if;
  if membership_paused_days(v_membership.id) + p_days > 7 then
    raise exception 'E_PAUSE_TOO_LONG';
  end if;
  if exists (
    select 1 from membership_pauses mp
    where mp.membership_id = v_membership.id
      and mp.paused_until >= mp.paused_from
      and mp.paused_from <= p_from + p_days - 1
      and mp.paused_until >= p_from
  ) then
    raise exception 'E_PAUSE_OVERLAP';
  end if;
  if p_from = v_today and exists (
    select 1 from visits v
    where v.membership_id = v_membership.id
      and gym_local_date(v.gym_id, v.checked_in_at) = v_today
  ) then
    raise exception 'E_PAUSE_VISITED';
  end if;

  insert into membership_pauses (gym_id, membership_id, paused_from, paused_until, created_by)
  values (v_staff.gym_id, v_membership.id, p_from, p_from + p_days - 1, v_staff.id)
  returning * into v_pause;
  update memberships set end_date = end_date + p_days where id = v_membership.id;
  perform shift_chained_memberships(v_membership, v_membership.end_date, p_days);
  return v_pause;
end;
$$;

/**
 * S-07 [Prekini pauzu] (D-100): the member is back. A pause that has begun keeps the days
 * before today; one that has not begun is given back whole.
 */
create function end_membership_pause(p_pause uuid)
returns membership_pauses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff  staff := current_staff();
  v_today  date := gym_today(v_staff.gym_id);
  v_member uuid;
  v_pause  membership_pauses;
begin
  select ms.member_id into v_member
  from membership_pauses mp
  join memberships ms on ms.id = mp.membership_id
  join members m on m.id = ms.member_id
  where mp.id = p_pause and mp.gym_id = v_staff.gym_id
    and ms.voided_at is null and not m.is_anonymized;
  if not found then
    raise exception 'E_FORBIDDEN';
  end if;
  perform 1 from members where id = v_member for update;

  select * into v_pause from membership_pauses where id = p_pause;
  if v_pause.paused_until < greatest(v_pause.paused_from, v_today) then
    raise exception 'E_PAUSE_INVALID';
  end if;
  perform finish_pause(p_pause, v_today);
  select * into v_pause from membership_pauses where id = p_pause;
  return v_pause;
end;
$$;

/**
 * BR-073 and US-04.2, as in migration 0014. D-100: a member who comes in first ends a
 * pause that has begun, so the membership covers the visit; the answer says so.
 */
create or replace function start_check_in(p_staff staff, p_member uuid, p_manual boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ended   boolean := end_member_pauses(p_member, gym_today(p_staff.gym_id));
  v_options json := check_in_options(p_member);
begin
  if json_array_length(v_options -> 'types') = 1
     and json_array_length(v_options -> 'candidates' -> 'gym') <= 1 then
    return json_build_object(
      'result', 'checked_in',
      'check_in', perform_check_in(p_staff, p_member, 'gym', null, null, null, p_manual),
      'pause_ended', v_ended
    );
  end if;
  return json_build_object(
    'result', 'choose',
    'member', member_brief(p_member),
    'manual', coalesce(p_manual, false),
    'options', v_options,
    'pause_ended', v_ended
  );
end;
$$;

/**
 * S-03a [Prijavi], as in migration 0014. D-100: a pause that began while the dialog was
 * open ends here too; perform_check_in refuses a member of another gym, and the whole
 * call is undone with it.
 */
create or replace function check_in(
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
  perform end_member_pauses(p_member, gym_today(v_staff.gym_id));
  return perform_check_in(v_staff, p_member, p_type, p_membership, p_trainer, p_slot, p_manual);
end;
$$;

-- S-07: each membership with its pauses (D-100), otherwise as in migration 0030.
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
  created_at timestamptz,
  paused_days integer,
  pauses json
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
         ms.is_backdated, ms.created_at,
         membership_paused_days(ms.id),
         coalesce((
           select json_agg(json_build_object(
                    'id', mp.id,
                    'paused_from', mp.paused_from,
                    'paused_until', mp.paused_until,
                    'ended_early', mp.ended_early
                  ) order by mp.paused_from, mp.created_at)
           from membership_pauses mp
           where mp.membership_id = ms.id and mp.paused_until >= mp.paused_from
         ), '[]'::json)
  from memberships ms
  join plans p on p.id = ms.plan_id
  left join trainers t on t.id = ms.trainer_id
  where ms.member_id = p_member and ms.gym_id = my_gym()
  order by ms.end_date desc, ms.created_at desc;
$$;

-- S-06 (BR-044), as in migration 0026. D-100: a paused membership ranks right after an
-- active one, so a paused member reads "Pauzirana", never the status of an older one.
create or replace function member_search(
  p_query text default '',
  p_filter text default 'all',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  member_number integer,
  first_name text,
  last_name text,
  phone text,
  status text,
  status_date date,
  last_visit date,
  total bigint
)
language sql
stable
set search_path = public
as $$
  with input as (
    select btrim(coalesce(p_query, '')) as q,
           lower(extensions.unaccent('extensions.unaccent'::regdictionary,
                                    btrim(coalesce(p_query, '')))) as folded,
           ltrim(regexp_replace(coalesce(p_query, ''), '\D', '', 'g'), '0') as digits,
           gym_today(my_gym()) as today
  ),
  found as (
    select m.*
    from members m, input i
    where m.gym_id = my_gym()
      and not m.is_anonymized
      and (i.q = ''
        or (i.q ~ '^\d{1,9}$' and m.member_number = i.q::int)
        -- N-02: what was typed is a literal substring (BR-044), so the two LIKE
        -- wildcards and the escape character itself are escaped before matching.
        or m.search_text like '%' ||
             replace(replace(replace(i.folded, '\', '\\'),
                             '%', '\%'),
                     '_', '\_')
             || '%' escape '\'
        -- "067 123" is typed without the country code, so its leading 0 is dropped.
        or (char_length(i.digits) >= 3
            and regexp_replace(m.phone, '\D', '', 'g') like '%' || i.digits || '%'))
  ),
  summary as (
    select f.id,
           s.status,
           s.status_date,
           (select gym_local_date(f.gym_id, max(v.checked_in_at))
            from visits v where v.member_id = f.id) as last_visit
    from found f
    cross join input i
    left join lateral (
      select st.status,
             case st.status
               when 'upcoming' then min(st.start_date)
               else max(st.end_date)
             end as status_date
      from (
        select ms.start_date, ms.end_date, membership_status(ms.id, i.today) as status
        from memberships ms
        where ms.member_id = f.id and ms.voided_at is null
      ) st
      group by st.status
      order by case st.status
        when 'active' then 1 when 'paused' then 2 when 'used_up' then 3
        when 'upcoming' then 4 else 5 end
      limit 1
    ) s on true
  )
  select f.id, f.member_number, f.first_name, f.last_name, f.phone,
         s.status, s.status_date, s.last_visit,
         count(*) over () as total
  from found f
  join summary s on s.id = f.id, input i
  where p_filter = 'all'
     or (p_filter = 'active' and s.status = 'active')
     or (p_filter = 'inactive' and s.status is distinct from 'active')
  order by (i.q ~ '^\d{1,9}$' and f.member_number = i.q::int) desc,
           f.last_name, f.first_name, f.member_number
  limit greatest(least(coalesce(p_limit, 25), 100), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Function privileges ---------------------------------------------------------------------
-- Internal: only other security definer functions call these.
revoke execute on function
  shift_chained_memberships(memberships, date, integer),
  finish_pause(uuid, date),
  end_member_pauses(uuid, date)
  from public, anon, authenticated;

-- Signed-in staff only; membership_covers and membership_status read pauses with the
-- caller's rights, and each RPC checks the gym itself.
revoke execute on function
  membership_paused_days(uuid),
  membership_paused(uuid, date),
  pause_membership(uuid, date, integer),
  end_membership_pause(uuid),
  member_memberships(uuid)
  from public, anon;
