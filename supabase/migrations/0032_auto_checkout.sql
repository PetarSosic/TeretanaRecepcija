-- D-74: a member is checked out automatically 1 h 30 min after checking in (BR-082a), and
-- a scan soon after an automatic check-out records the member leaving rather than a new
-- visit (BR-072a).

-- BR-082a: the job looks only at open visits, oldest first, every minute.
create index visits_open_checkin_idx on visits (checked_in_at) where checked_out_at is null;

/**
 * BR-082a: every open visit that began 1 h 30 min ago or earlier ends at exactly its
 * check-in plus 1 h 30 min, as an automatic check-out, whenever the job happens to run.
 * pg_cron runs it every minute for every gym; it needs neither the application nor the
 * gym's local time, and running it twice changes nothing. Answers how many it closed.
 */
create function job_auto_checkout()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closed integer;
begin
  update visits
  set checked_out_at = checked_in_at + interval '90 minutes',
      auto_checkout  = true
  where checked_out_at is null
    and checked_in_at <= now() - interval '90 minutes';
  get diagnostics v_closed = row_count;
  return v_closed;
end;
$$;

revoke execute on function job_auto_checkout() from public, anon, authenticated;
grant execute on function job_auto_checkout() to service_role;

select cron.schedule('kp-fitness-auto-checkout', '* * * * *', 'select public.job_auto_checkout()');

/**
 * BR-072a: a visit automatically checked out (BR-082a or BR-082) less than 60 minutes ago,
 * by a member who has not been in since, ends now instead: the check-out becomes a real
 * one at this moment, by this staff member, and the answer is the ordinary BR-072
 * check-out. Null when the rule does not apply. Nobody can call it directly.
 */
create function perform_leave_after_auto(p_staff staff, p_visit uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visit visits;
begin
  select * into v_visit from visits
  where id = p_visit and gym_id = p_staff.gym_id
  for update;
  if not found
     or not v_visit.auto_checkout
     or v_visit.checked_out_at < now() - interval '60 minutes'
     or exists (select 1 from visits
                where member_id = v_visit.member_id
                  and checked_in_at > v_visit.checked_in_at) then
    return null;
  end if;

  update visits
  set checked_out_at = now(), checked_out_by = p_staff.id, auto_checkout = false
  where id = v_visit.id
  returning * into v_visit;
  return json_build_object(
    'result', 'checked_out',
    'visit_id', v_visit.id,
    'member', member_brief(v_visit.member_id),
    'duration_seconds', floor(extract(epoch from v_visit.checked_out_at - v_visit.checked_in_at))
  );
end;
$$;

revoke execute on function perform_leave_after_auto(staff, uuid) from public, anon, authenticated;

/**
 * BR-070: one scan, one decision. Card problems are answers rather than errors, so the
 * status area can show them without a round trip for the message; nothing is recorded
 * for them. Check-out happens here unless the double-scan guard asks first (BR-072).
 *
 * D-74: the open visit is locked, so the BR-082a job cannot close it under the scan; and a
 * member with no open visit who was automatically checked out within the hour is checked
 * out again at this moment instead of in (BR-072a).
 */
create or replace function scan_card(p_code text)
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
  v_left    json;
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
  where member_id = v_card.member_id and checked_out_at is null
  for update;
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

  v_left := perform_leave_after_auto(v_staff, (
    select id from visits where member_id = v_card.member_id
    order by checked_in_at desc limit 1));
  if v_left is not null then
    return v_left;
  end if;

  return start_check_in(v_staff, v_card.member_id, false);
end;
$$;

/**
 * BR-072 and BR-080: check a visit out. From a scan inside the guard time, S-03e asks
 * first and then calls this with p_confirmed; [Odjavi] in "U teretani" is a deliberate
 * click, so it is confirmed by nature.
 *
 * D-74: the list may still show a visit the BR-082a job has just closed; [Odjavi] then
 * records the member leaving now, as a scan would (BR-072a).
 */
create or replace function check_out(p_visit uuid, p_confirmed boolean)
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
  v_left    json;
begin
  select * into v_visit from visits
  where id = p_visit and gym_id = v_staff.gym_id
  for update;
  if not found then
    raise exception 'E_VALIDATION';
  end if;
  if v_visit.checked_out_at is not null then
    v_left := perform_leave_after_auto(v_staff, p_visit);
    if v_left is null then
      raise exception 'E_VALIDATION';
    end if;
    return v_left;
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
