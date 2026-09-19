-- M-12 and BR-003: money crosses to the browser as text, never as a JSON number.
--
-- `json_build_object` turns a numeric into a JSON number, which JavaScript parses into a
-- double the moment the response is read — exactly what BR-003 forbids, and what
-- `lib/format.ts` refuses to accept. Every money field of the finance reports is cast to
-- text here; the counts and the identifiers stay as they were.

create or replace function fin_summary(p_from date, p_to date)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff    staff := assert_owner();
  v_payments numeric(10,2);
  v_sales    numeric(10,2);
  v_expenses numeric(10,2);
  v_bar      numeric(10,2);
begin
  select coalesce(sum(amount), 0) into v_payments
  from payments
  where gym_id = v_staff.gym_id and voided_at is null and paid_on between p_from and p_to;

  select coalesce(sum(quantity * unit_price), 0),
         coalesce(sum(quantity * (unit_price - unit_cost)), 0)
  into v_sales, v_bar
  from stock_movements
  where gym_id = v_staff.gym_id and type = 'out' and voided_at is null
    and gym_local_date(gym_id, created_at) between p_from and p_to;

  select coalesce(sum(amount), 0) into v_expenses
  from expenses
  where gym_id = v_staff.gym_id and voided_at is null and spent_on between p_from and p_to;

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
            and membership_status(ms.id, gym_today(v_staff.gym_id)) = 'active')
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
  v_staff staff := assert_owner();
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
          and gym_local_date(gym_id, created_at) between p_from and p_to
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
            and gym_local_date(gym_id, created_at) between p_from and p_to
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
        group by c.name
      ) t), '[]'::json)
  );
end;
$$;

create or replace function fin_monthly(p_months integer default 12)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff staff := assert_owner();
  v_first date;
begin
  if p_months < 1 or p_months > 36 then
    raise exception 'E_VALIDATION';
  end if;
  v_first := date_trunc('month', gym_today(v_staff.gym_id)
                                 - make_interval(months => p_months - 1))::date;

  return coalesce((
    select json_agg(json_build_object('month', t.month, 'income', t.income::text,
                                      'expenses', t.expenses::text)
                    order by t.month)
    from (
      select to_char(months.month, 'YYYY-MM') as month,
             coalesce((
               select sum(amount) from payments
               where gym_id = v_staff.gym_id and voided_at is null
                 and paid_on >= months.month
                 and paid_on < months.month + interval '1 month'), 0)
             + coalesce((
               select sum(quantity * unit_price) from stock_movements
               where gym_id = v_staff.gym_id and type = 'out' and voided_at is null
                 and gym_local_date(gym_id, created_at) >= months.month
                 and gym_local_date(gym_id, created_at)
                     < months.month + interval '1 month'), 0) as income,
             coalesce((
               select sum(amount) from expenses
               where gym_id = v_staff.gym_id and voided_at is null
                 and spent_on >= months.month
                 and spent_on < months.month + interval '1 month'), 0) as expenses
      from generate_series(v_first, gym_today(v_staff.gym_id), interval '1 month')
           as months(month)
    ) t), '[]'::json);
end;
$$;

create or replace function fin_expenses(
  p_from       date,
  p_to         date,
  p_category   uuid default null,
  p_method     text default null,
  p_created_by uuid default null
)
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
    select json_agg(row_to_json(t) order by t.spent_on desc, t.created_at desc)
    from (
      select e.id,
             e.spent_on,
             c.name as category_name,
             c.is_salary,
             e.description,
             e.supplier,
             e.invoice_number,
             e.method,
             e.paid_from_till,
             e.vat_included,
             e.amount::text as amount,
             tr.full_name as trainer_name,
             s.full_name as created_by_name,
             e.stock_movement_id,
             e.shift_id,
             e.created_at,
             e.voided_at,
             e.void_reason
      from expenses e
      join expense_categories c on c.id = e.category_id
      join staff s on s.id = e.created_by
      left join trainers tr on tr.id = e.trainer_id
      where e.gym_id = v_staff.gym_id
        and e.spent_on between p_from and p_to
        and (p_category is null or e.category_id = p_category)
        and (p_method is null
             or (p_method = 'none' and e.method is null)
             or e.method::text = p_method)
        and (p_created_by is null or e.created_by = p_created_by)
    ) t), '[]'::json);
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
                select distinct gym_local_date(v.gym_id, v.checked_in_at), v.class_slot_id
                from visits v
                where v.gym_id = v_staff.gym_id and v.visit_type = 'group'
                  and v.trainer_id = tr.id
                  and gym_local_date(v.gym_id, v.checked_in_at) between v_from and v_to
              ) sessions) as group_sessions,
             (select count(*)::int from visits v
              where v.gym_id = v_staff.gym_id and v.visit_type = 'personal'
                and v.trainer_id = tr.id
                and gym_local_date(v.gym_id, v.checked_in_at) between v_from and v_to
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

create or replace function fin_trainer_payments(p_trainer uuid, p_month date)
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
begin
  return coalesce((
    select json_agg(row_to_json(t) order by t.paid_on, t.member_name)
    from (
      select pay.id as payment_id,
             pay.paid_on,
             pay.amount::text as amount,
             pay.method,
             mem.member_number,
             mem.first_name || ' ' || mem.last_name as member_name,
             p.name as plan_name,
             m.is_backdated,
             (membership_shares(m.id, pay.amount)).trainer_share::text as trainer_share,
             (membership_shares(m.id, pay.amount)).gym_share::text as gym_share,
             (membership_shares(m.id, pay.amount)).is_defined as is_defined,
             (membership_shares(m.id, pay.amount)).warning as warning
      from payments pay
      join memberships m on m.id = pay.membership_id
      join members mem on mem.id = m.member_id
      join plans p on p.id = m.plan_id
      where pay.gym_id = v_staff.gym_id and pay.voided_at is null
        and pay.paid_on between v_from and v_to
        and m.trainer_id = p_trainer
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
            and gym_local_date(sm.gym_id, sm.created_at) between p_from and p_to
        ) sold on true
        where p.gym_id = v_staff.gym_id
      ) t), '[]'::json),
    'daily', coalesce((
      select json_agg(row_to_json(t) order by t.day desc, t.name)
      from (
        select gym_local_date(sm.gym_id, sm.created_at) as day,
               p.name,
               sum(sm.quantity)::int as quantity,
               sum(sm.quantity * sm.unit_price)::text as revenue
        from stock_movements sm join products p on p.id = sm.product_id
        where sm.gym_id = v_staff.gym_id and sm.type = 'out' and sm.voided_at is null
          and gym_local_date(sm.gym_id, sm.created_at) between p_from and p_to
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
          and gym_local_date(sm.gym_id, sm.created_at) between p_from and p_to
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
  v_staff staff := assert_owner();
begin
  return coalesce((
    select json_agg(row_to_json(t) order by t.started_at desc)
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
             (shift_totals(sh.id) ->> 'cash_income') as cash_income,
             (shift_totals(sh.id) ->> 'card_income') as card_income,
             (shift_totals(sh.id) ->> 'till_expenses') as till_expenses,
             (shift_totals(sh.id) ->> 'expected_cash') as expected_cash,
             (shift_totals(sh.id) ->> 'difference') as difference
      from shifts sh join staff s on s.id = sh.staff_id
      where sh.gym_id = v_staff.gym_id
        and gym_local_date(sh.gym_id, sh.started_at) between p_from and p_to
    ) t), '[]'::json);
end;
$$;
