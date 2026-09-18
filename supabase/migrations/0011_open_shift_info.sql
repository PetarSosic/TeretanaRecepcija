/**
 * Doc 06 §1 and S-02 both have to name whoever holds the open shift: the header badge
 * reads `Smjena: <ime> od <HH:mm>`, and the gate says `Otvorena je smjena: <ime>`.
 *
 * Doc 07 §6 deliberately limits a receptionist to their own row in `staff`, so a
 * receptionist cannot read that name from the table. Rather than widening the policy —
 * which would expose every colleague's row to satisfy one label — this function hands
 * back the one field the screens need, and the table policy stays exactly as the
 * specification writes it.
 */
create function open_shift_info()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff staff := current_staff();
  v_open  shifts;
  v_name  text;
begin
  v_open := open_shift(v_staff.gym_id);
  if v_open.id is null then
    return null;
  end if;

  select full_name into v_name from staff where id = v_open.staff_id;

  return json_build_object(
    'id', v_open.id,
    'staff_id', v_open.staff_id,
    'staff_name', v_name,
    'started_at', v_open.started_at,
    'is_mine', v_open.staff_id = v_staff.id
  );
end;
$$;

revoke execute on function open_shift_info() from public, anon;
