-- D-68: the S-16 chart shows one calendar year month by month, or one month day by day.
--
-- The owner asked on 24.09.2026 for the chart to open on the current year rather than a
-- rolling twelve months (US-17.1 AC3), with a filter that reaches back to earlier years
-- and down to a single month. `fin_chart` replaces `fin_monthly`, which nothing calls
-- any more. BR-150/151 define the money exactly as `fin_summary` does, so the chart's
-- totals for a month equal the S-16 cards for the same month; BR-003: money is text.

drop function fin_monthly(integer);

create function fin_chart(p_year integer, p_month integer default null)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff      staff := assert_owner();
  v_today      date := gym_today(v_staff.gym_id);
  -- BR-001: "future" is measured against the gym's today, never the server's.
  v_unit       text := case when p_month is null then 'month' else 'day' end;
  v_from       date;
  v_to         date;
  v_first_year integer;
begin
  if p_year is null or p_year < 2000 or p_year > extract(year from v_today)
     or (p_month is not null and (p_month < 1 or p_month > 12)) then
    raise exception 'E_VALIDATION';
  end if;

  v_from := make_date(p_year, coalesce(p_month, 1), 1);
  -- A month that has not started yet has nothing to show.
  if v_from > v_today then
    raise exception 'E_VALIDATION';
  end if;
  v_to := case
            when p_month is null then make_date(p_year, 12, 31)
            else (v_from + interval '1 month' - interval '1 day')::date
          end;

  -- The year selector reaches back to the first year that holds any money. BR-095:
  -- voided rows count nowhere, so they do not stretch the selector either.
  v_first_year := extract(year from least(
    (select min(paid_on) from payments
     where gym_id = v_staff.gym_id and voided_at is null),
    (select min(spent_on) from expenses
     where gym_id = v_staff.gym_id and voided_at is null),
    (select gym_local_date(v_staff.gym_id, min(created_at)) from stock_movements
     where gym_id = v_staff.gym_id and type = 'out' and voided_at is null),
    v_today))::integer;

  return (
    with slots as (
      select slot::date as slot
      from generate_series(v_from, v_to, ('1 ' || v_unit)::interval) as slot
    ),
    income as (
      -- BR-150: membership and other payments by payment date (D-27), plus bar sales.
      select date_trunc(v_unit, paid_on::timestamp)::date as slot, amount
      from payments
      where gym_id = v_staff.gym_id and voided_at is null
        and paid_on between v_from and v_to
      union all
      select date_trunc(v_unit, gym_local_date(gym_id, created_at)::timestamp)::date,
             quantity * unit_price
      from stock_movements
      where gym_id = v_staff.gym_id and type = 'out' and voided_at is null
        and gym_local_date(gym_id, created_at) between v_from and v_to
    ),
    spent as (
      -- BR-151: every expense by the day it was spent.
      select date_trunc(v_unit, spent_on::timestamp)::date as slot, amount
      from expenses
      where gym_id = v_staff.gym_id and voided_at is null
        and spent_on between v_from and v_to
    ),
    points as (
      select s.slot,
             coalesce(i.total, 0)::numeric(12,2) as income,
             coalesce(e.total, 0)::numeric(12,2) as expenses
      from slots s
      left join (select slot, sum(amount) as total from income group by slot) i
        using (slot)
      left join (select slot, sum(amount) as total from spent group by slot) e
        using (slot)
    )
    select json_build_object(
      'year', p_year,
      'month', p_month,
      'first_year', v_first_year,
      -- A slot after today is null, not zero: the chart leaves it empty instead of
      -- drawing a month that has not happened as a month without income.
      'points', json_agg(json_build_object(
                  'date', to_char(p.slot, 'YYYY-MM-DD'),
                  'income', case when p.slot > v_today then null else p.income::text end,
                  'expenses', case when p.slot > v_today then null else p.expenses::text end)
                order by p.slot),
      'income', sum(p.income)::numeric(12,2)::text,
      'expenses', sum(p.expenses)::numeric(12,2)::text,
      'profit', (sum(p.income) - sum(p.expenses))::numeric(12,2)::text)
    from points p
  );
end;
$$;

-- BR-157: finance is the owner's; the admin reaches it through assert_owner (D-58).
revoke execute on function fin_chart(integer, integer) from public, anon;
