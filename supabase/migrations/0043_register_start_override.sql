-- N-31: on S-05 "Novi član" the owner may change "Početak" (BR-052 step 4), and the form
-- previews the owner's date, but register_member had no parameter for it: the new
-- member's membership started on the computed day and the owner's date was lost. It now
-- takes the owner's start as sell_membership does (p_start_override, last, so every
-- existing call keeps its meaning), and membership_sale checks it the same way: only an
-- owner or admin may change the start (E_FORBIDDEN).

drop function register_member(text, text, text, text, text, date, uuid, uuid, numeric,
                              integer, payment_method, boolean, time);

/**
 * F-06 with "Prijavi odmah" (D-31, US-06.1 AC2), as in migration 0030, plus the owner's
 * own start date (BR-052 step 4, N-31). A new member holds only the membership just
 * sold, so the visit takes BR-073's preselected type, that membership, its trainer and
 * the BR-075 default slot; no question needs asking.
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
  p_class_time time default null,
  p_start_override date default null
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
    p_start_override, null, false, p_class_time
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

-- Signed-in staff only; the RPC checks the shift and membership_sale the role.
revoke execute on function
  register_member(text, text, text, text, text, date, uuid, uuid, numeric, integer,
                  payment_method, boolean, time, date)
  from public, anon;
