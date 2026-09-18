-- M-05: the shift rules of BR-110 to BR-113. Closing a shift and its report are M-10,
-- so a takeover here closes the other shift and leaves its report queued.

/**
 * BR-111: what a receptionist's login does.
 *   'opened'  — there was no open shift, so one was created for them;
 *   'resumed' — the open shift is already theirs;
 *   'gate'    — someone else's shift is open, so S-02 asks what to do.
 *
 * BR-110 and BR-112: only receptionists have shifts. An owner, manager or admin
 * logging in never opens or closes one, so they are answered 'gate' with no shift to
 * act on — their money actions simply attach to whatever shift is open (BR-092).
 */
create function resolve_login_shift()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff staff := current_staff();
  v_open  shifts;
  v_new   shifts;
begin
  v_open := open_shift(v_staff.gym_id);

  if v_staff.role <> 'receptionist' then
    return json_build_object('state', 'none', 'shift', to_json(v_open));
  end if;

  if v_open.id is null then
    insert into shifts (gym_id, staff_id) values (v_staff.gym_id, v_staff.id)
    returning * into v_new;
    return json_build_object('state', 'opened', 'shift', to_json(v_new));
  end if;

  if v_open.staff_id = v_staff.id then
    return json_build_object('state', 'resumed', 'shift', to_json(v_open));
  end if;

  return json_build_object('state', 'gate', 'shift', to_json(v_open));
end;
$$;

/**
 * BR-111: [Preuzmi smjenu]. The other shift is closed as a takeover and a new one is
 * opened for the caller, in one transaction — BR-110 allows only one open shift per
 * gym, so the two steps can never be seen apart.
 *
 * AS-10: the counted cash for the shift being taken over is optional.
 * BR-117: the report is generated and emailed by M-10; email_status stays 'not_sent'
 * until then, which is what marks the shift as still needing its report.
 */
create function take_over_shift(p_counted_cash numeric default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff  staff := assert_staff_role(array['receptionist']::app_role[]);
  v_open   shifts;
  v_closed shifts;
  v_new    shifts;
begin
  if p_counted_cash is not null and p_counted_cash < 0 then
    raise exception 'E_VALIDATION';
  end if;

  v_open := open_shift(v_staff.gym_id);

  -- S-02: if the shift was closed while the gate was on screen, just open a new one.
  if v_open.id is null then
    insert into shifts (gym_id, staff_id) values (v_staff.gym_id, v_staff.id)
    returning * into v_new;
    return json_build_object('state', 'opened', 'shift', to_json(v_new));
  end if;

  if v_open.staff_id = v_staff.id then
    return json_build_object('state', 'resumed', 'shift', to_json(v_open));
  end if;

  update shifts
  set closed_at    = now(),
      close_type   = 'takeover',
      closed_by    = v_staff.id,
      counted_cash = p_counted_cash
  where id = v_open.id and closed_at is null
  returning * into v_closed;
  if not found then
    raise exception 'E_SHIFT_TAKEN';   -- someone closed it a moment earlier
  end if;

  insert into shifts (gym_id, staff_id) values (v_staff.gym_id, v_staff.id)
  returning * into v_new;

  return json_build_object(
    'state', 'taken_over',
    'shift', to_json(v_new),
    'closed_shift', to_json(v_closed)
  );
end;
$$;

revoke execute on function
  resolve_login_shift(), take_over_shift(numeric)
  from public, anon;
