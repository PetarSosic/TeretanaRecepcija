-- D-72 (BR-027): S-29 Treneri, the trainer roster.
--
-- The owner decided on 29.09.2026 that every role sees which members are assigned to
-- which trainer and fixed class time (D-71), so that reception can check at the start of
-- a class that everyone on the list came and that nobody trained without a record. Only
-- group memberships valid today are listed. For the classes held today the roster adds
-- each member's check-in and the check-ins by members who are not on the list.
--
-- The amounts are the owner's (BR-157): trainer_roster returns none, and the owner's
-- columns come from fin_roster_prices, which starts with the owner check like every
-- other fin_ function (doc 08 §2).

/**
 * BR-027: the roster for the caller's gym, as of gym today (BR-001).
 *
 * - times:   every trainer's active group class times, one per start time, with the
 *            ISO weekdays it is held (as class_time_active() counts them, BR-025);
 * - members: the group memberships valid today, one per member, trainer and time, with
 *            the first group check-in today to a slot of that trainer at that time;
 * - extras:  today's group check-ins to a slot by members not on that slot's list.
 *
 * A group visit without a slot ("Bez časa iz rasporeda") belongs to no class time.
 */
create function trainer_roster()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff staff := current_staff();
  v_today date := gym_today(v_staff.gym_id);
  v_tz    text := (select g.timezone from gyms g where g.id = v_staff.gym_id);
  -- The gym's local day as instants, so visits_checkin_idx can serve the range.
  v_from  timestamptz := v_today::timestamp at time zone v_tz;
  v_to    timestamptz := (v_today + 1)::timestamp at time zone v_tz;
begin
  return json_build_object(
    'today', v_today,
    'weekday', extract(isodow from v_today)::int,
    'times', coalesce((
      select json_agg(row_to_json(t) order by t.trainer_name, t.trainer_id, t.starts_at)
      from (
        select cs.trainer_id,
               tr.full_name as trainer_name,
               cs.starts_at,
               array_agg(distinct cs.weekday order by cs.weekday) as weekdays
        from class_slots cs
        join programs p on p.id = cs.program_id
        join trainers tr on tr.id = cs.trainer_id
        where cs.gym_id = v_staff.gym_id
          and cs.is_active
          and p.is_active
          and p.kind = 'group'
        group by cs.trainer_id, tr.full_name, cs.starts_at
      ) t
    ), '[]'::json),
    'members', coalesce((
      select json_agg(row_to_json(r)
                      order by r.trainer_name, r.trainer_id, r.class_time nulls last,
                               r.paid_on, r.last_name, r.first_name)
      from (
        -- Two valid memberships for the same trainer and time list the member once,
        -- with the one that lasts longer.
        select distinct on (ms.member_id, ms.trainer_id, ms.class_time)
               ms.id as membership_id,
               ms.trainer_id,
               tr.full_name as trainer_name,
               ms.class_time,
               m.id as member_id,
               m.member_number,
               m.first_name,
               m.last_name,
               pl.name as plan_name,
               pay.paid_on,
               ms.end_date,
               (select min(v.checked_in_at)
                from visits v
                join class_slots cs on cs.id = v.class_slot_id
                where v.gym_id = v_staff.gym_id
                  and v.member_id = ms.member_id
                  and v.visit_type = 'group'
                  and v.checked_in_at >= v_from and v.checked_in_at < v_to
                  and cs.trainer_id = ms.trainer_id
                  and cs.starts_at = ms.class_time) as checked_in_at
        from memberships ms
        join members m on m.id = ms.member_id
        join plans pl on pl.id = ms.plan_id
        join trainers tr on tr.id = ms.trainer_id
        left join payments pay on pay.membership_id = ms.id and pay.voided_at is null
        where ms.gym_id = v_staff.gym_id
          and ms.covers_group
          and ms.voided_at is null
          and not m.is_anonymized
          and v_today between ms.start_date and ms.end_date
        order by ms.member_id, ms.trainer_id, ms.class_time, ms.end_date desc,
                 ms.created_at desc
      ) r
    ), '[]'::json),
    'extras', coalesce((
      select json_agg(row_to_json(e) order by e.checked_in_at)
      from (
        select cs.trainer_id,
               tr.full_name as trainer_name,
               cs.starts_at as class_time,
               m.id as member_id,
               m.member_number,
               m.first_name,
               m.last_name,
               min(v.checked_in_at) as checked_in_at,
               bool_and(v.is_unpaid) as is_unpaid
        from visits v
        join class_slots cs on cs.id = v.class_slot_id
        join members m on m.id = v.member_id
        join trainers tr on tr.id = cs.trainer_id
        where v.gym_id = v_staff.gym_id
          and v.visit_type = 'group'
          and v.checked_in_at >= v_from and v.checked_in_at < v_to
          and not m.is_anonymized
          and not exists (
            select 1
            from memberships ms
            where ms.member_id = v.member_id
              and ms.trainer_id = cs.trainer_id
              and ms.class_time = cs.starts_at
              and ms.covers_group
              and ms.voided_at is null
              and v_today between ms.start_date and ms.end_date)
        group by cs.trainer_id, tr.full_name, cs.starts_at, m.id, m.member_number,
                 m.first_name, m.last_name
      ) e
    ), '[]'::json)
  );
end;
$$;

/**
 * BR-027 and BR-157: S-29's owner columns. The amount of each listed membership's
 * payment in the caller's gym, as decimal text (BR-003); a voided payment has none.
 */
create function fin_roster_prices(p_memberships uuid[])
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff staff := assert_owner();
begin
  return coalesce((
    select json_agg(json_build_object('membership_id', pay.membership_id,
                                      'amount', pay.amount::text))
    from payments pay
    where pay.gym_id = v_staff.gym_id
      and pay.voided_at is null
      and pay.membership_id = any (coalesce(p_memberships, '{}'))
  ), '[]'::json);
end;
$$;

-- Signed-in staff only; each function checks the role itself.
revoke execute on function
  trainer_roster(),
  fin_roster_prices(uuid[])
  from public, anon;
