-- D-94: a period longer than 400 days on S-15 now has its own message. visit_stats
-- refused it with the general E_VALIDATION, so the screen said "Provjerite unesene
-- podatke." although nothing was typed wrong (SUSPECT-01, §7.4 of the test plan). It now
-- raises E_PERIOD_TOO_LONG; the limit itself, the answer and the privileges are unchanged.

create or replace function visit_stats(p_from date, p_to date)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff staff := assert_staff_role(
    array['owner', 'admin', 'manager']::app_role[]);
  v_tz    text;
  v_start timestamptz;
  v_end   timestamptz;
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'E_VALIDATION';
  end if;
  -- A year at a time is plenty for S-15 and keeps the answer small (doc 08 §9); D-94:
  -- the screen names the limit instead of asking to check the input.
  if p_to - p_from > 400 then
    raise exception 'E_PERIOD_TOO_LONG';
  end if;

  -- D-90: the period as instants, measured once, so the index on (gym_id, checked_in_at)
  -- serves every count below and no row calls gym_local_date().
  select timezone into v_tz from gyms where id = v_staff.gym_id;
  v_start := gym_day_start(v_staff.gym_id, p_from);
  v_end   := gym_day_start(v_staff.gym_id, p_to + 1);

  return json_build_object(
    'total', (
      select count(*) from visits v
      where v.gym_id = v_staff.gym_id
        and v.checked_in_at >= v_start and v.checked_in_at < v_end),
    'days', coalesce((
      select json_agg(json_build_object('day', d.day::date, 'count', coalesce(c.count, 0))
                      order by d.day)
      from generate_series(p_from, p_to, interval '1 day') as d(day)
      left join (
        select (v.checked_in_at at time zone v_tz)::date as day, count(*)::int as count
        from visits v
        where v.gym_id = v_staff.gym_id
          and v.checked_in_at >= v_start and v.checked_in_at < v_end
        group by 1
      ) c on c.day = d.day::date
    ), '[]'::json),
    'hours', coalesce((
      select json_agg(json_build_object('hour', h.hour, 'count', coalesce(c.count, 0))
                      order by h.hour)
      from generate_series(6, 23) as h(hour)
      left join (
        select extract(hour from (v.checked_in_at at time zone g.timezone))::int as hour,
               count(*)::int as count
        from visits v join gyms g on g.id = v.gym_id
        where v.gym_id = v_staff.gym_id
          and v.checked_in_at >= v_start and v.checked_in_at < v_end
        group by 1
      ) c on c.hour = h.hour
    ), '[]'::json),
    'types', coalesce((
      select json_agg(json_build_object('type', t.visit_type, 'count', t.count)
                      order by t.count desc)
      from (
        select v.visit_type::text as visit_type, count(*)::int as count
        from visits v
        where v.gym_id = v_staff.gym_id
          and v.checked_in_at >= v_start and v.checked_in_at < v_end
        group by v.visit_type
      ) t
    ), '[]'::json),
    -- BR-082: an automatic check-out is not a measurement of anything.
    'average_seconds', (
      select round(avg(extract(epoch from v.checked_out_at - v.checked_in_at)))::int
      from visits v
      where v.gym_id = v_staff.gym_id
        and v.checked_out_at is not null
        and not v.auto_checkout
        and v.checked_in_at >= v_start and v.checked_in_at < v_end),
    'measured_visits', (
      select count(*) from visits v
      where v.gym_id = v_staff.gym_id
        and v.checked_out_at is not null
        and not v.auto_checkout
        and v.checked_in_at >= v_start and v.checked_in_at < v_end),
    'top_members', coalesce((
      select json_agg(row_to_json(t) order by t.count desc, t.member_name)
      from (
        select m.id as member_id,
               m.member_number,
               m.first_name || ' ' || m.last_name as member_name,
               count(*)::int as count
        from visits v join members m on m.id = v.member_id
        where v.gym_id = v_staff.gym_id
          and not m.is_anonymized
          and v.checked_in_at >= v_start and v.checked_in_at < v_end
        group by m.id, m.member_number, m.first_name, m.last_name
        order by count(*) desc, m.first_name, m.last_name
        limit 10
      ) t
    ), '[]'::json)
  );
end;
$$;
