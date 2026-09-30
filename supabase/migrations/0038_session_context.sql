-- D-89: one call gives a request everything it needs about its session — the signed-in
-- staff row, the gym's name, the gym's today (BR-001) and the gym's open shift (BR-110) —
-- where the proxy, the app layout and the pages used to ask for them one by one (a staff
-- read in the proxy and again in the layout, the gym, open_shift_info, gym_today).

/**
 * D-89: the session of the caller, or null when the caller has no staff row or is
 * deactivated (doc 04 §2 point 5), so the caller is signed out rather than shown an
 * error. `open_shift` is what open_shift_info() answers, and `today` is gym_today().
 */
create function session_context()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff staff;
  v_open  shifts;
begin
  select * into v_staff from staff where user_id = auth.uid();
  if not found or not v_staff.is_active then
    return null;
  end if;

  v_open := open_shift(v_staff.gym_id);

  return json_build_object(
    'staff', json_build_object(
      'id', v_staff.id,
      'gym_id', v_staff.gym_id,
      'user_id', v_staff.user_id,
      'role', v_staff.role,
      'full_name', v_staff.full_name,
      'username', v_staff.username,
      'email', v_staff.email,
      'must_change_password', v_staff.must_change_password,
      'is_active', v_staff.is_active
    ),
    'gym_name', (select name from gyms where id = v_staff.gym_id),
    'today', gym_today(v_staff.gym_id),
    'open_shift', case
      when v_open.id is null then null
      else json_build_object(
        'id', v_open.id,
        'staff_id', v_open.staff_id,
        'staff_name', (select full_name from staff where id = v_open.staff_id),
        'started_at', v_open.started_at,
        'is_mine', v_open.staff_id = v_staff.id
      )
    end
  );
end;
$$;

revoke execute on function session_context() from public, anon;
