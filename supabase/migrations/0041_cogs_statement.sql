-- D-92: buying goods is not the cost of the month it was paid in. A stock-in's automatic
-- expense (BR-141) is money spent on stock, shown in the cash flow (BR-158) and held in
-- the stock value (BR-159); only the purchase price of what was sold, the cost of goods
-- sold, reaches profit (BR-151 to BR-153). Every other expense is an operating expense.
--
-- The owner's S-16 gains the income statement and the cash flow (fin_statement), and
-- fin_summary, fin_chart and fin_storage follow the same definitions, so Profit is one
-- number wherever it is shown. A manager's finance (D-80) is unchanged: income and
-- non-salary expenses as paid, never the cost of goods sold, profit or stock value
-- (BR-144, BR-157). Goods enter only through Nova roba, so the "Roba za prodaju"
-- category is refused on a hand-entered expense (BR-132, BR-133).

/**
 * BR-159: each product's stock level and value at the end of `p_date`, the gym's day.
 * The price is the one a sale would have taken then (AS-6): the current purchase price
 * on the gym's today, and for an earlier day the price of the last stock-in before that
 * day ended, or the current price when there was none. Only other functions call it.
 */
create function product_stock_at(p_gym uuid, p_date date)
returns table (product_id uuid, stock integer, price numeric, value numeric)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select gym_day_start(p_gym, p_date + 1) as day_end,
           p_date >= gym_today(p_gym) as is_today
  )
  select p.id,
         st.stock,
         pr.price,
         round(st.stock * pr.price, 2)
  from products p
  cross join bounds b
  cross join lateral (
    select coalesce(sum(case when m.type = 'in' then m.quantity else -m.quantity end), 0)::int
             as stock
    from stock_movements m
    where m.product_id = p.id and m.voided_at is null and m.created_at < b.day_end
  ) st
  cross join lateral (
    select case
             when b.is_today then p.current_purchase_price
             else coalesce((
               select m.unit_cost from stock_movements m
               where m.product_id = p.id and m.type = 'in' and m.voided_at is null
                 and m.created_at < b.day_end
               order by m.created_at desc
               limit 1), p.current_purchase_price)
           end as price
  ) pr
  where p.gym_id = p_gym;
$$;

revoke execute on function product_stock_at(uuid, date) from public, anon, authenticated;

/**
 * S-16 (D-92): the owner's income statement and cash flow for a period, the way the
 * gym owner asked to read a month.
 *
 * - Income (BR-150) by group: Članarine (gym plans and day passes), Treninzi (group,
 *   G+T and personal plans), Prodaja iz magacina, Ostalo (card replacements).
 * - Cost of goods sold (BR-153), gross profit, operating expenses by category (BR-151,
 *   every expense but a stock-in's) and profit (BR-152).
 * - Cash flow (BR-158): what came in, what was paid for new goods, what was paid for
 *   everything else.
 * - Stock value at the end of the period, or today for a period that reaches it (BR-159).
 */
create function fin_statement(p_from date, p_to date)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff       staff := assert_owner();
  v_today       date;
  v_start       timestamptz;
  v_end         timestamptz;
  v_memberships numeric(12,2);
  v_training    numeric(12,2);
  v_other       numeric(12,2);
  v_storage     numeric(12,2);
  v_cogs        numeric(12,2);
  v_income      numeric(12,2);
  v_operating   numeric(12,2);
  v_goods_paid  numeric(12,2);
  v_stock_date  date;
  v_stock_value numeric(12,2);
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'E_VALIDATION';
  end if;
  v_today := gym_today(v_staff.gym_id);
  -- D-90: the period as instants, measured once; see gym_day_start().
  v_start := gym_day_start(v_staff.gym_id, p_from);
  v_end   := gym_day_start(v_staff.gym_id, p_to + 1);

  select coalesce(sum(amount) filter (where grp = 'memberships'), 0),
         coalesce(sum(amount) filter (where grp = 'training'), 0),
         coalesce(sum(amount) filter (where grp = 'other'), 0)
  into v_memberships, v_training, v_other
  from (
    select pay.amount,
           case
             when pay.kind = 'day_pass' then 'memberships'
             when pay.kind = 'membership' and pl.kind = 'gym' then 'memberships'
             when pay.kind = 'membership' and pl.kind in ('group', 'combo', 'personal')
               then 'training'
             else 'other'
           end as grp
    from payments pay
    left join plans pl on pl.id = pay.plan_id
    where pay.gym_id = v_staff.gym_id and pay.voided_at is null
      and pay.paid_on between p_from and p_to
  ) grouped;

  select coalesce(sum(quantity * unit_price), 0),
         coalesce(sum(quantity * unit_cost), 0)
  into v_storage, v_cogs
  from stock_movements
  where gym_id = v_staff.gym_id and type = 'out' and voided_at is null
    and created_at >= v_start and created_at < v_end;

  select coalesce(sum(amount) filter (where stock_movement_id is null), 0),
         coalesce(sum(amount) filter (where stock_movement_id is not null), 0)
  into v_operating, v_goods_paid
  from expenses
  where gym_id = v_staff.gym_id and voided_at is null
    and spent_on between p_from and p_to;

  v_income := v_memberships + v_training + v_storage + v_other;
  v_stock_date := least(p_to, v_today);
  select coalesce(sum(value), 0) into v_stock_value
  from product_stock_at(v_staff.gym_id, v_stock_date);

  return json_build_object(
    'income', json_build_object(
      'memberships', v_memberships::text,
      'training', v_training::text,
      'storage', v_storage::text,
      'other', v_other::text,
      'total', v_income::text
    ),
    'cogs', v_cogs::text,
    'gross_profit', (v_income - v_cogs)::text,
    'operating', coalesce((
      select json_agg(json_build_object('name', t.name, 'total', t.total::text)
                      order by t.total desc, t.name)
      from (
        select c.name, sum(e.amount) as total
        from expenses e join expense_categories c on c.id = e.category_id
        where e.gym_id = v_staff.gym_id and e.voided_at is null
          and e.spent_on between p_from and p_to
          and e.stock_movement_id is null
        group by c.name
      ) t), '[]'::json),
    'operating_total', v_operating::text,
    'profit', (v_income - v_cogs - v_operating)::text,
    'cash_flow', json_build_object(
      'received', v_income::text,
      'goods_paid', v_goods_paid::text,
      'other_paid', v_operating::text,
      'net_change', (v_income - v_goods_paid - v_operating)::text
    ),
    'stock_value', v_stock_value::text,
    'stock_value_date', to_char(v_stock_date, 'YYYY-MM-DD')
  );
end;
$$;

revoke execute on function fin_statement(date, date) from public, anon;

-- S-16 cards. D-92: for the owner, Troškovi are the cost of goods sold plus the operating
-- expenses and Profit is BR-152, the same numbers fin_statement shows. The manager's
-- branch (D-80) is unchanged: expenses as paid, stock-ins included, salaries left out.
create or replace function fin_summary(p_from date, p_to date)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff     staff := assert_finance_period(p_from, p_to);
  v_manager   boolean := v_staff.role = 'manager';
  v_payments  numeric(10,2);
  v_sales     numeric(10,2);
  v_cogs      numeric(10,2);
  v_expenses  numeric(10,2);
  v_operating numeric(10,2);
  v_today     date := gym_today(v_staff.gym_id);
  -- D-90: the period as instants, measured once; see gym_day_start().
  v_start   timestamptz := gym_day_start(v_staff.gym_id, p_from);
  v_end     timestamptz := gym_day_start(v_staff.gym_id, p_to + 1);
begin
  select coalesce(sum(amount), 0) into v_payments
  from payments
  where gym_id = v_staff.gym_id and voided_at is null and paid_on between p_from and p_to;

  select coalesce(sum(quantity * unit_price), 0),
         coalesce(sum(quantity * unit_cost), 0)
  into v_sales, v_cogs
  from stock_movements
  where gym_id = v_staff.gym_id and type = 'out' and voided_at is null
    and created_at >= v_start and created_at < v_end;

  -- D-77: salaries never reach a manager, not even inside a total.
  select coalesce(sum(e.amount), 0),
         coalesce(sum(e.amount) filter (where e.stock_movement_id is null), 0)
  into v_expenses, v_operating
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
    -- BR-151 and BR-153 (D-92): what the period cost, not what it paid for stock.
    'expenses', (v_cogs + v_operating)::text,
    'profit', (v_payments + v_sales - v_cogs - v_operating)::text,
    'bar_profit', (v_sales - v_cogs)::text,
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

-- D-68 chart. D-92: a slot's expenses are its operating expenses by the day spent plus
-- the cost of the goods sold that day, so its profit is BR-152, as on the cards.
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
      -- BR-151 (D-92): operating expenses by the day they were spent; a stock-in's
      -- expense is not one.
      select date_trunc(v_unit, spent_on::timestamp)::date as slot, amount
      from expenses
      where gym_id = v_staff.gym_id and voided_at is null
        and spent_on between v_from and v_to
        and stock_movement_id is null
      union all
      -- BR-153 (D-92): the cost of the goods sold, on the day they were sold.
      select date_trunc(v_unit, (created_at at time zone v_tz)::date::timestamp)::date,
             quantity * unit_cost
      from stock_movements
      where gym_id = v_staff.gym_id and type = 'out' and voided_at is null
        and created_at >= v_start and created_at < v_end
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

-- S-20. D-92: per product the purchase and sale price, what came in and what was sold in
-- the period with its cost, gross profit and margin, and the stock and its value at the
-- end of the period (BR-159), with a totals row.
create or replace function fin_storage(p_from date, p_to date)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff      staff := assert_owner();
  v_tz         text := (select timezone from gyms where id = v_staff.gym_id);
  -- D-90: the period as instants, measured once; see gym_day_start().
  v_start      timestamptz := gym_day_start(v_staff.gym_id, p_from);
  v_end        timestamptz := gym_day_start(v_staff.gym_id, p_to + 1);
  v_stock_date date := least(p_to, gym_today(v_staff.gym_id));
begin
  return (
    with per_product as (
      select p.id as product_id,
             p.name,
             p.current_purchase_price as purchase_price,
             p.sale_price,
             coalesce(came.quantity, 0) as in_quantity,
             coalesce(came.amount, 0) as in_amount,
             coalesce(sold.quantity, 0) as sold_quantity,
             coalesce(sold.revenue, 0) as revenue,
             coalesce(sold.cost, 0) as cost,
             at_end.stock,
             at_end.value as stock_value
      from products p
      join product_stock_at(v_staff.gym_id, v_stock_date) at_end
        on at_end.product_id = p.id
      left join lateral (
        select sum(quantity)::int as quantity,
               sum(quantity * unit_cost) as amount
        from stock_movements sm
        where sm.product_id = p.id and sm.type = 'in' and sm.voided_at is null
          and sm.created_at >= v_start and sm.created_at < v_end
      ) came on true
      left join lateral (
        select sum(quantity)::int as quantity,
               sum(quantity * unit_price) as revenue,
               sum(quantity * unit_cost) as cost
        from stock_movements sm
        where sm.product_id = p.id and sm.type = 'out' and sm.voided_at is null
          and sm.created_at >= v_start and sm.created_at < v_end
      ) sold on true
      where p.gym_id = v_staff.gym_id
    )
    select json_build_object(
      'stock_date', to_char(v_stock_date, 'YYYY-MM-DD'),
      'products', coalesce((
        select json_agg(json_build_object(
                 'product_id', r.product_id,
                 'name', r.name,
                 'purchase_price', r.purchase_price::text,
                 'sale_price', r.sale_price::text,
                 'in_quantity', r.in_quantity,
                 'in_amount', r.in_amount::numeric(12,2)::text,
                 'sold_quantity', r.sold_quantity,
                 'revenue', r.revenue::numeric(12,2)::text,
                 'cost', r.cost::numeric(12,2)::text,
                 'profit', (r.revenue - r.cost)::numeric(12,2)::text,
                 'margin_pct', case when r.revenue > 0
                                    then round((r.revenue - r.cost) * 100 / r.revenue, 1)::text
                               end,
                 'stock', r.stock,
                 'stock_value', r.stock_value::numeric(12,2)::text)
               order by r.name)
        from per_product r), '[]'::json),
      'totals', (
        select json_build_object(
                 'in_quantity', coalesce(sum(r.in_quantity), 0)::int,
                 'in_amount', coalesce(sum(r.in_amount), 0)::numeric(12,2)::text,
                 'sold_quantity', coalesce(sum(r.sold_quantity), 0)::int,
                 'revenue', coalesce(sum(r.revenue), 0)::numeric(12,2)::text,
                 'cost', coalesce(sum(r.cost), 0)::numeric(12,2)::text,
                 'profit', coalesce(sum(r.revenue - r.cost), 0)::numeric(12,2)::text,
                 'margin_pct', case when sum(r.revenue) > 0
                                    then round(sum(r.revenue - r.cost) * 100
                                               / sum(r.revenue), 1)::text
                               end,
                 'stock', coalesce(sum(r.stock), 0)::int,
                 'stock_value', coalesce(sum(r.stock_value), 0)::numeric(12,2)::text)
        from per_product r),
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
    )
  );
end;
$$;

/**
 * BR-133: the owner's expense form. Everything the desk form (BR-132) fixes is open here:
 * any date up to today, any active category, any method including "Van kase", and the
 * optional supplier, invoice and VAT fields. Ticking "paid from till" pulls the record
 * back into today's open shift, because that is money that left the drawer.
 * D-92: not "Roba za prodaju" — goods come in through Nova roba (BR-141), or they would
 * be paid for without ever reaching the stock or its value.
 */
create or replace function record_expense(
  p_category    uuid,
  p_description text,
  p_amount      numeric,
  p_spent_on    date,
  p_method      payment_method default null,
  p_from_till   boolean default false,
  p_supplier    text default null,
  p_invoice     text default null,
  p_vat         boolean default null,
  p_trainer     uuid default null
)
returns expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff    staff := assert_owner();
  v_today    date := gym_today(v_staff.gym_id);
  v_category expense_categories;
  v_shift    uuid;
  v_spent    date := p_spent_on;
  v_method   payment_method := p_method;
  v_expense  expenses;
begin
  select * into v_category from expense_categories
  where id = p_category and gym_id = v_staff.gym_id and is_active;
  if not found then
    raise exception 'E_VALIDATION';
  end if;
  if v_category.is_system then
    raise exception 'E_CATEGORY_NOT_ALLOWED';
  end if;
  if char_length(coalesce(p_description, '')) not between 2 and 200
     or p_amount is null or p_amount < 0.01 or p_amount > 100000
     or v_spent is null or v_spent > v_today then
    raise exception 'E_VALIDATION';
  end if;
  -- BR-133: a trainer may be named only on a salary category, and must be this gym's.
  if p_trainer is not null then
    if not v_category.is_salary
       or not exists (select 1 from trainers where id = p_trainer and gym_id = v_staff.gym_id) then
      raise exception 'E_VALIDATION';
    end if;
  end if;

  if p_from_till then
    v_spent := v_today;
    v_method := 'cash';
    v_shift := (require_open_shift(v_staff.gym_id)).id;
  end if;

  insert into expenses (
    gym_id, spent_on, category_id, description, amount, method, paid_from_till,
    supplier, invoice_number, vat_included, trainer_id, created_by, shift_id
  ) values (
    v_staff.gym_id, v_spent, p_category, p_description, round(p_amount, 2), v_method,
    coalesce(p_from_till, false), nullif(p_supplier, ''), nullif(p_invoice, ''), p_vat,
    p_trainer, v_staff.id, v_shift
  )
  returning * into v_expense;
  return v_expense;
end;
$$;

/**
 * BR-132: any role records a small expense paid in cash from the till, today, on the open
 * shift, in an active category that is not a salary category (D-37). D-92: nor "Roba za
 * prodaju", which only Nova roba writes (BR-141).
 */
create or replace function record_desk_expense(p_category uuid, p_description text, p_amount numeric)
returns expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff       staff := current_staff();
  v_shift       shifts := require_open_shift(v_staff.gym_id);
  v_description text := btrim(coalesce(p_description, ''));
  v_expense     expenses;
begin
  if not exists (
    select 1 from expense_categories
    where id = p_category and gym_id = v_staff.gym_id and is_active and not is_salary
      and not is_system
  ) then
    raise exception 'E_CATEGORY_NOT_ALLOWED';
  end if;
  if char_length(v_description) not between 2 and 200
     or p_amount is null or p_amount < 0.01 or p_amount > 10000 then
    raise exception 'E_VALIDATION';
  end if;

  insert into expenses (gym_id, spent_on, category_id, description, amount, method,
                        paid_from_till, created_by, shift_id)
  values (v_staff.gym_id, gym_today(v_staff.gym_id), p_category, v_description,
          round(p_amount, 2), 'cash', true, v_staff.id, v_shift.id)
  returning * into v_expense;
  return v_expense;
end;
$$;
