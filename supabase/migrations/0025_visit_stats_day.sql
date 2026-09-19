-- M-13: `generate_series` over dates yields timestamptz, so the day behind each bar
-- came back as a timestamp with an offset instead of the plain `yyyy-mm-dd` BR-002
-- formats. The cast is the whole change; the rest of the function is untouched.

/**
 * US-20.1: everything S-15 draws, for one period of local dates (BR-001).
 *
 * `days` and `hours` are returned complete — every day of the period and every hour from
 * 06 to 23 — so the two bar charts keep an even spacing instead of collapsing around the
 * quiet stretches. BR-082's automatic check-outs are counted as visits but left out of
 * the average duration, because a visit that was closed at 23:00 by the nightly job says
 * nothing about how long the member actually stayed.
 */
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
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'E_VALIDATION';
  end if;
  -- A year at a time is plenty for S-15 and keeps the answer small (doc 08 §9).
  if p_to - p_from > 400 then
    raise exception 'E_VALIDATION';
  end if;

  return json_build_object(
    'total', (
      select count(*) from visits v
      where v.gym_id = v_staff.gym_id
        and gym_local_date(v.gym_id, v.checked_in_at) between p_from and p_to),
    'days', coalesce((
      select json_agg(json_build_object('day', d.day::date, 'count', coalesce(c.count, 0))
                      order by d.day)
      from generate_series(p_from, p_to, interval '1 day') as d(day)
      left join (
        select gym_local_date(v.gym_id, v.checked_in_at) as day, count(*)::int as count
        from visits v
        where v.gym_id = v_staff.gym_id
          and gym_local_date(v.gym_id, v.checked_in_at) between p_from and p_to
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
          and gym_local_date(v.gym_id, v.checked_in_at) between p_from and p_to
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
          and gym_local_date(v.gym_id, v.checked_in_at) between p_from and p_to
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
        and gym_local_date(v.gym_id, v.checked_in_at) between p_from and p_to),
    'measured_visits', (
      select count(*) from visits v
      where v.gym_id = v_staff.gym_id
        and v.checked_out_at is not null
        and not v.auto_checkout
        and gym_local_date(v.gym_id, v.checked_in_at) between p_from and p_to),
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
          and gym_local_date(v.gym_id, v.checked_in_at) between p_from and p_to
        group by m.id, m.member_number, m.first_name, m.last_name
        order by count(*) desc, m.first_name, m.last_name
        limit 10
      ) t
    ), '[]'::json)
  );
end;
$$;

revoke execute on function visit_stats(date, date) from public, anon;
