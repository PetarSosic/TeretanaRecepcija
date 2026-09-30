-- D-90: the reports read a period as a range of instants measured once, instead of
-- asking gym_local_date() for every row, so the date indexes serve them and a row costs
-- no function call and no gym lookup. `ts >= gym_day_start(g, from) and
-- ts < gym_day_start(g, to + 1)` holds for exactly the rows whose local date lies in
-- [from, to] (BR-001), so every answer is the same as before. fin_shifts also computes
-- each shift's totals once instead of once per column, and fin_summary asks
-- membership_status() only about memberships that can be active today.
--
-- Two indexes cover what the reports and jobs filter on and no index had: bar movements
-- by gym and time, and memberships by gym and end date (Ističe, the morning reminders,
-- the active-member count). Group and personal sessions per trainer (S-18) get one too.

create index stock_movements_gym_time_idx on stock_movements (gym_id, created_at);
create index memberships_gym_end_idx on memberships (gym_id, end_date);
create index visits_trainer_time_idx on visits (trainer_id, checked_in_at)
  where trainer_id is not null;

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
  -- A year at a time is plenty for S-15 and keeps the answer small (doc 08 §9).
  if p_to - p_from > 400 then
    raise exception 'E_VALIDATION';
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

create or replace function fin_trainer_stats(p_month date)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff staff := assert_owner();
  v_from  date := date_trunc('month', p_month)::date;
  v_to    date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_tz      text := (select timezone from gyms where id = v_staff.gym_id);
  -- D-90: the period as instants, measured once; see gym_day_start().
  v_start   timestamptz := gym_day_start(v_staff.gym_id, v_from);
  v_end     timestamptz := gym_day_start(v_staff.gym_id, v_to + 1);
begin
  return coalesce((
    select json_agg(row_to_json(t) order by t.trainer_name)
    from (
      select tr.id as trainer_id,
             tr.full_name as trainer_name,
             tr.is_active,
             (select count(distinct m.member_id)::int
              from payments pay
              join memberships m on m.id = pay.membership_id
              where pay.gym_id = v_staff.gym_id and pay.voided_at is null
                and pay.paid_on between v_from and v_to
                and m.trainer_id = tr.id) as clients,
             (select count(*)::int from (
                select distinct (v.checked_in_at at time zone v_tz)::date, v.class_slot_id
                from visits v
                where v.gym_id = v_staff.gym_id and v.visit_type = 'group'
                  and v.trainer_id = tr.id
                  and v.checked_in_at >= v_start and v.checked_in_at < v_end
              ) sessions) as group_sessions,
             (select count(*)::int from visits v
              where v.gym_id = v_staff.gym_id and v.visit_type = 'personal'
                and v.trainer_id = tr.id
                and v.checked_in_at >= v_start and v.checked_in_at < v_end
             ) as personal_sessions,
             coalesce(revenue.total, 0)::text as revenue,
             coalesce(revenue.trainer_total, 0)::text as trainer_total,
             coalesce(revenue.gym_total, 0)::text as gym_total,
             coalesce(revenue.undefined_count, 0) as undefined_count,
             coalesce(paid.total, 0)::text as paid_out,
             (coalesce(revenue.trainer_total, 0) - coalesce(paid.total, 0))::text as difference
      from trainers tr
      left join lateral (
        select sum(pay.amount) as total,
               sum(case when (share).is_defined then (share).trainer_share end) as trainer_total,
               sum(case when (share).is_defined then (share).gym_share end) as gym_total,
               count(*) filter (where not (share).is_defined)::int as undefined_count
        from (
          select pay.amount, membership_shares(m.id, pay.amount) as share
          from payments pay
          join memberships m on m.id = pay.membership_id
          where pay.gym_id = v_staff.gym_id and pay.voided_at is null
            and pay.paid_on between v_from and v_to
            and m.trainer_id = tr.id
        ) pay
      ) revenue on true
      left join lateral (
        select sum(e.amount) as total
        from expenses e join expense_categories c on c.id = e.category_id
        where e.gym_id = v_staff.gym_id and e.voided_at is null
          and e.trainer_id = tr.id and c.is_salary
          and e.spent_on between v_from and v_to
      ) paid on true
      where tr.gym_id = v_staff.gym_id
    ) t), '[]'::json);
end;
$$;

create or replace function fin_storage(p_from date, p_to date)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff staff := assert_owner();
  v_tz      text := (select timezone from gyms where id = v_staff.gym_id);
  -- D-90: the period as instants, measured once; see gym_day_start().
  v_start   timestamptz := gym_day_start(v_staff.gym_id, p_from);
  v_end     timestamptz := gym_day_start(v_staff.gym_id, p_to + 1);
begin
  return json_build_object(
    'products', coalesce((
      select json_agg(row_to_json(t) order by t.name)
      from (
        select p.id as product_id,
               p.name,
               product_stock(p.id) as stock,
               round(product_stock(p.id) * p.current_purchase_price, 2)::text as stock_value,
               coalesce(sold.quantity, 0) as sold_quantity,
               coalesce(sold.revenue, 0)::text as revenue,
               coalesce(sold.cost, 0)::text as cost,
               (coalesce(sold.revenue, 0) - coalesce(sold.cost, 0))::text as profit
        from products p
        left join lateral (
          select sum(quantity)::int as quantity,
                 sum(quantity * unit_price) as revenue,
                 sum(quantity * unit_cost) as cost
          from stock_movements sm
          where sm.product_id = p.id and sm.type = 'out' and sm.voided_at is null
            and sm.created_at >= v_start and sm.created_at < v_end
        ) sold on true
        where p.gym_id = v_staff.gym_id
      ) t), '[]'::json),
    'daily', coalesce((
      select json_agg(row_to_json(t) order by t.day desc, t.name)
      from (
        select (sm.created_at at time zone v_tz)::date as day,
               p.name,
               sum(sm.quantity)::int as quantity,
               sum(sm.quantity * sm.unit_price)::text as revenue
        from stock_movements sm join products p on p.id = sm.product_id
        where sm.gym_id = v_staff.gym_id and sm.type = 'out' and sm.voided_at is null
          and sm.created_at >= v_start and sm.created_at < v_end
        group by 1, 2
      ) t), '[]'::json),
    'stock_ins', coalesce((
      select json_agg(row_to_json(t) order by t.created_at desc)
      from (
        select sm.id,
               sm.created_at,
               p.name,
               sm.quantity,
               sm.unit_cost::text as unit_cost,
               round(sm.quantity * sm.unit_cost, 2)::text as total,
               sm.paid_from_till,
               s.full_name as created_by_name,
               sm.voided_at,
               sm.void_reason
        from stock_movements sm
        join products p on p.id = sm.product_id
        join staff s on s.id = sm.created_by
        where sm.gym_id = v_staff.gym_id and sm.type = 'in'
          and sm.created_at >= v_start and sm.created_at < v_end
      ) t), '[]'::json)
  );
end;
$$;

create or replace function fin_chart(p_year integer, p_month integer default null)
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
  v_tz         text;
  v_start      timestamptz;
  v_end        timestamptz;
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
  -- D-90: the period as instants, measured once; see gym_day_start().
  select timezone into v_tz from gyms where id = v_staff.gym_id;
  v_start := gym_day_start(v_staff.gym_id, v_from);
  v_end   := gym_day_start(v_staff.gym_id, v_to + 1);

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
      select date_trunc(v_unit, (created_at at time zone v_tz)::date::timestamp)::date,
             quantity * unit_price
      from stock_movements
      where gym_id = v_staff.gym_id and type = 'out' and voided_at is null
        and created_at >= v_start and created_at < v_end
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

create or replace function fin_summary(p_from date, p_to date)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff    staff := assert_finance_period(p_from, p_to);
  v_manager  boolean := v_staff.role = 'manager';
  v_payments numeric(10,2);
  v_sales    numeric(10,2);
  v_expenses numeric(10,2);
  v_bar      numeric(10,2);
  v_today    date := gym_today(v_staff.gym_id);
  -- D-90: the period as instants, measured once; see gym_day_start().
  v_start   timestamptz := gym_day_start(v_staff.gym_id, p_from);
  v_end     timestamptz := gym_day_start(v_staff.gym_id, p_to + 1);
begin
  select coalesce(sum(amount), 0) into v_payments
  from payments
  where gym_id = v_staff.gym_id and voided_at is null and paid_on between p_from and p_to;

  select coalesce(sum(quantity * unit_price), 0),
         coalesce(sum(quantity * (unit_price - unit_cost)), 0)
  into v_sales, v_bar
  from stock_movements
  where gym_id = v_staff.gym_id and type = 'out' and voided_at is null
    and created_at >= v_start and created_at < v_end;

  -- D-77: salaries never reach a manager, not even inside a total.
  select coalesce(sum(e.amount), 0) into v_expenses
  from expenses e
  join expense_categories c on c.id = e.category_id
  where e.gym_id = v_staff.gym_id and e.voided_at is null
    and e.spent_on between p_from and p_to
    and (not v_manager or not c.is_salary);

  -- BR-157 and D-77: no profit, bar profit or member count for a manager.
  if v_manager then
    return json_build_object(
      'income', (v_payments + v_sales)::text,
      'expenses', v_expenses::text
    );
  end if;

  return json_build_object(
    'income', (v_payments + v_sales)::text,
    'expenses', v_expenses::text,
    'profit', (v_payments + v_sales - v_expenses)::text,
    'bar_profit', v_bar::text,
    'active_members', (
      select count(*) from members m
      where m.gym_id = v_staff.gym_id and not m.is_anonymized
        and exists (
          select 1 from memberships ms
          where ms.member_id = m.id
            -- D-90: only a membership that can be active today is asked about; any
            -- other is voided, upcoming or expired by membership_status() itself.
            and ms.voided_at is null
            and ms.start_date <= v_today and ms.end_date >= v_today
            and membership_status(ms.id, v_today) = 'active')
    )
  );
end;
$$;

create or replace function fin_income_breakdown(p_from date, p_to date)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff   staff := assert_finance_period(p_from, p_to);
  v_manager boolean := v_staff.role = 'manager';
  -- D-90: the period as instants, measured once; see gym_day_start().
  v_start   timestamptz := gym_day_start(v_staff.gym_id, p_from);
  v_end     timestamptz := gym_day_start(v_staff.gym_id, p_to + 1);
begin
  return json_build_object(
    'by_plan', coalesce((
      select json_agg(json_build_object('name', t.name, 'total', t.total::text,
                                        'count', t.count)
                      order by t.total desc)
      from (
        select coalesce(p.name, 'Zamjenska kartica') as name,
               sum(pay.amount) as total,
               count(*)::int as count
        from payments pay
        left join plans p on p.id = pay.plan_id
        where pay.gym_id = v_staff.gym_id and pay.voided_at is null
          and pay.paid_on between p_from and p_to
        group by coalesce(p.name, 'Zamjenska kartica')
        union all
        select 'Magacin', sum(quantity * unit_price), count(*)::int
        from stock_movements
        where gym_id = v_staff.gym_id and type = 'out' and voided_at is null
          and created_at >= v_start and created_at < v_end
        having count(*) > 0
      ) t), '[]'::json),
    'by_method', coalesce((
      select json_agg(json_build_object('name', t.name, 'total', t.total::text,
                                        'count', t.count)
                      order by t.total desc)
      from (
        select method::text as name, sum(total) as total, sum(count)::int as count
        from (
          select method, sum(amount) as total, count(*) as count
          from payments
          where gym_id = v_staff.gym_id and voided_at is null
            and paid_on between p_from and p_to
          group by method
          union all
          select method, sum(quantity * unit_price), count(*)
          from stock_movements
          where gym_id = v_staff.gym_id and type = 'out' and voided_at is null
            and created_at >= v_start and created_at < v_end
          group by method
        ) parts
        group by method
      ) t), '[]'::json),
    'by_category', coalesce((
      select json_agg(json_build_object('name', t.name, 'total', t.total::text,
                                        'count', t.count)
                      order by t.total desc)
      from (
        select c.name, sum(e.amount) as total, count(*)::int as count
        from expenses e join expense_categories c on c.id = e.category_id
        where e.gym_id = v_staff.gym_id and e.voided_at is null
          and e.spent_on between p_from and p_to
          and (not v_manager or not c.is_salary)
        group by c.name
      ) t), '[]'::json)
  );
end;
$$;

create or replace function fin_shifts(p_from date, p_to date)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff   staff := assert_finance_period(p_from, p_to);
  v_manager boolean := v_staff.role = 'manager';
  -- D-90: the period as instants, measured once; see gym_day_start().
  v_start   timestamptz := gym_day_start(v_staff.gym_id, p_from);
  v_end     timestamptz := gym_day_start(v_staff.gym_id, p_to + 1);
begin
  return coalesce((
    select json_agg(
             case
               when v_manager then
                 (row_to_json(t)::jsonb
                  - array['report_path', 'email_status', 'email_attempts', 'emailed_at'])::json
               else row_to_json(t)
             end
             order by t.started_at desc)
    from (
      select sh.id,
             s.full_name as staff_name,
             sh.started_at,
             sh.closed_at,
             sh.close_type,
             (select full_name from staff where id = sh.closed_by) as closed_by_name,
             sh.counted_cash::text as counted_cash,
             sh.report_path,
             sh.email_status,
             sh.email_attempts,
             sh.emailed_at,
             (tot.totals ->> 'cash_income') as cash_income,
             (tot.totals ->> 'card_income') as card_income,
             (tot.totals ->> 'till_expenses') as till_expenses,
             (tot.totals ->> 'expected_cash') as expected_cash,
             (tot.totals ->> 'difference') as difference
      from shifts sh join staff s on s.id = sh.staff_id
      -- D-90: the totals once per shift, not once per column. OFFSET 0 keeps the
      -- planner from folding the call back into each column.
      cross join lateral (select shift_totals(sh.id) as totals offset 0) tot
      where sh.gym_id = v_staff.gym_id
        and sh.started_at >= v_start and sh.started_at < v_end
    ) t), '[]'::json);
end;
$$;
