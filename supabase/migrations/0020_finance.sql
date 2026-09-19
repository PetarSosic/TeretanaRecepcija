-- M-12: the owner's finance reports (F-17, F-18, F-19, F-24) — doc 03 §14 and doc 07 §5.
-- Every function here is owner-only (BR-157): a manager or a receptionist calling one
-- gets E_FORBIDDEN, and none of the numbers reaches them by any other route either,
-- because the finance tables have no SELECT policy for those roles (doc 07 §6).

/** BR-157: the guard every fin_ function starts with. D-58 gives the admin the same reach. */
create function assert_owner()
returns staff
language sql
stable
security definer
set search_path = public
as $$
  select assert_staff_role(array['owner', 'admin']::app_role[]);
$$;

/**
 * BR-155: how one membership payment is split. The terms come from the snapshot taken at
 * the sale (BR-050, D-62), never from the plan as it stands today.
 *
 * `is_defined` is false when the arrangement is unknown — a personal membership with a
 * trainer whose fee is null (OQ-1, E12), or a group membership whose share percentage
 * was never set. Such a payment still counts as revenue (BR-156) but is left out of both
 * share totals, which is what "nije definisano" means on S-18.
 */
create type membership_share as (
  trainer_share numeric(10,2),
  gym_share     numeric(10,2),
  is_defined    boolean,
  warning       text
);

create function membership_shares(p_membership uuid, p_amount numeric)
returns membership_share
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kind    plan_kind;
  v_finance membership_finance;
  v_result  membership_share;
begin
  select p.kind into v_kind
  from memberships m join plans p on p.id = m.plan_id
  where m.id = p_membership;
  select * into v_finance from membership_finance where membership_id = p_membership;

  v_result.is_defined := false;
  if v_kind = 'personal' then
    -- E11: €120 with a fee of €80 leaves the trainer €40 and the gym €80.
    if v_finance.personal_gym_fee is null then
      return v_result;                                   -- E12: "nije definisano"
    end if;
    v_result.trainer_share := round(p_amount - v_finance.personal_gym_fee, 2);
    if v_result.trainer_share < 0 then
      v_result.trainer_share := 0;                       -- AS-7
      v_result.warning := 'Iznos manji od naknade teretani';
    end if;
  elsif v_kind in ('group', 'combo') then
    -- E9: €69 at 70% is €48.30. E10: (€99 − €50) at 100% is €49.00.
    if v_finance.trainer_share_pct is null then
      return v_result;
    end if;
    v_result.trainer_share := round(
      greatest(p_amount - coalesce(v_finance.gym_fixed_amount, 0), 0)
      * v_finance.trainer_share_pct / 100, 2);
  else
    return v_result;                                     -- no trainer, no split
  end if;

  v_result.gym_share := round(p_amount - v_result.trainer_share, 2);
  v_result.is_defined := true;
  return v_result;
end;
$$;

/**
 * BR-150 to BR-153 and US-17.1: the four cards of S-16. Income counts payments by the day
 * they were paid and bar sales by their local date, so a back-dated record lands in the
 * month it belongs to (BR-120). Bar purchase costs are already in the expenses through
 * the automatic stock-in expense, which is why bar profit is informational only (BR-152).
 */
create function fin_summary(p_from date, p_to date)
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
    'income', v_payments + v_sales,
    'expenses', v_expenses,
    'profit', v_payments + v_sales - v_expenses,
    'bar_profit', v_bar,
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

/**
 * US-17.1 AC2: where the money came from and where it went. Income is broken down by plan
 * and by method, expenses by category. Card replacements and bar sales have no plan, so
 * each gets a row of its own and the rows still add up to the income card.
 */
create function fin_income_breakdown(p_from date, p_to date)
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
      select json_agg(row_to_json(t) order by t.total desc)
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
      select json_agg(row_to_json(t) order by t.total desc)
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
      select json_agg(row_to_json(t) order by t.total desc)
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

/**
 * US-17.1 AC3: income against expenses for the last N whole months, newest last, for the
 * bar chart on S-16. Months with no records are still returned, so the chart keeps an
 * even spacing instead of skipping a quiet month.
 */
create function fin_monthly(p_months integer default 12)
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
    select json_agg(row_to_json(t) order by t.month)
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

/** US-17.1 AC3: the memberships that end within the next N days, soonest first. */
create function fin_expiring(p_days integer default 7)
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
    select json_agg(row_to_json(t) order by t.end_date, t.member_name)
    from (
      select m.id as membership_id,
             mem.id as member_id,
             mem.member_number,
             mem.first_name || ' ' || mem.last_name as member_name,
             mem.phone,
             p.name as plan_name,
             m.end_date
      from memberships m
      join members mem on mem.id = m.member_id
      join plans p on p.id = m.plan_id
      where m.gym_id = v_staff.gym_id
        and m.voided_at is null
        and not mem.is_anonymized
        and m.end_date between gym_today(v_staff.gym_id)
                           and gym_today(v_staff.gym_id) + p_days
        -- A membership already followed by another one is not expiring for the member.
        and not exists (
          select 1 from memberships later
          where later.member_id = m.member_id
            and later.voided_at is null
            and later.start_date > m.start_date
            and ((later.covers_gym and m.covers_gym)
              or (later.covers_group and m.covers_group)
              or (later.covers_personal and m.covers_personal)))
    ) t), '[]'::json);
end;
$$;

/** US-17.1 AC3 and BR-052: members with visits that no membership ever paid for. */
create function fin_unpaid_members()
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
    select json_agg(row_to_json(t) order by t.oldest)
    from (
      select mem.id as member_id,
             mem.member_number,
             mem.first_name || ' ' || mem.last_name as member_name,
             mem.phone,
             count(*)::int as unpaid_count,
             min(gym_local_date(v.gym_id, v.checked_in_at)) as oldest
      from visits v
      join members mem on mem.id = v.member_id
      where v.gym_id = v_staff.gym_id
        and v.is_unpaid and v.membership_id is null
        and not mem.is_anonymized
      group by mem.id, mem.member_number, mem.first_name, mem.last_name, mem.phone
    ) t), '[]'::json);
end;
$$;

/** US-18.1 and S-17: every expense of the period, with the filters the screen offers. */
create function fin_expenses(
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
             e.amount,
             tr.name as trainer_name,
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
        -- 'till' is the only value that is not a payment method: it means "Van kase".
        and (p_method is null
             or (p_method = 'none' and e.method is null)
             or e.method::text = p_method)
        and (p_created_by is null or e.created_by = p_created_by)
    ) t), '[]'::json);
end;
$$;

/**
 * BR-133: the owner's expense form. Everything the desk form (BR-132) fixes is open here:
 * any date up to today, any active category, any method including "Van kase", and the
 * optional supplier, invoice and VAT fields. Ticking "paid from till" pulls the record
 * back into today's open shift, because that is money that left the drawer.
 */
create function record_expense(
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
 * BR-156: one row per trainer for a month. "Klijenti" counts people, not payments, and
 * "Održani grupni treninzi" counts (date, slot) pairs, so two members at the same class
 * are one session. Shares that are "nije definisano" are counted in the revenue and left
 * out of both share totals, which is what makes E12 work.
 */
create function fin_trainer_stats(p_month date)
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
             tr.name as trainer_name,
             -- BR-154: a membership payment belongs to the membership's trainer.
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
             coalesce(revenue.total, 0) as revenue,
             coalesce(revenue.trainer_total, 0) as trainer_total,
             coalesce(revenue.gym_total, 0) as gym_total,
             coalesce(revenue.undefined_count, 0) as undefined_count,
             coalesce(paid.total, 0) as paid_out,
             coalesce(revenue.trainer_total, 0) - coalesce(paid.total, 0) as difference
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

/** S-18 detail: the payments behind one trainer's month, with each one's split. */
create function fin_trainer_payments(p_trainer uuid, p_month date)
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
             pay.amount,
             pay.method,
             mem.member_number,
             mem.first_name || ' ' || mem.last_name as member_name,
             p.name as plan_name,
             m.is_backdated,
             (membership_shares(m.id, pay.amount)).trainer_share,
             (membership_shares(m.id, pay.amount)).gym_share,
             (membership_shares(m.id, pay.amount)).is_defined,
             (membership_shares(m.id, pay.amount)).warning
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

/**
 * S-20: what the bar did over the period, per product, plus the daily sales and the
 * stock-ins that can still be voided. BR-153: the profit of a sale uses the purchase
 * price snapshotted onto that sale, not today's.
 */
create function fin_storage(p_from date, p_to date)
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
               round(product_stock(p.id) * p.current_purchase_price, 2) as stock_value,
               coalesce(sold.quantity, 0) as sold_quantity,
               coalesce(sold.revenue, 0) as revenue,
               coalesce(sold.cost, 0) as cost,
               coalesce(sold.revenue, 0) - coalesce(sold.cost, 0) as profit
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
               sum(sm.quantity * sm.unit_price) as revenue
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
               sm.unit_cost,
               round(sm.quantity * sm.unit_cost, 2) as total,
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

/** S-19: the shifts of the period with their BR-115 totals and the email outcome. */
create function fin_shifts(p_from date, p_to date)
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
             sh.counted_cash,
             sh.report_path,
             sh.email_status,
             sh.email_attempts,
             sh.emailed_at,
             (shift_totals(sh.id) ->> 'cash_income')::numeric as cash_income,
             (shift_totals(sh.id) ->> 'card_income')::numeric as card_income,
             (shift_totals(sh.id) ->> 'till_expenses')::numeric as till_expenses,
             (shift_totals(sh.id) ->> 'expected_cash')::numeric as expected_cash,
             (shift_totals(sh.id) ->> 'difference')::numeric as difference
      from shifts sh join staff s on s.id = sh.staff_id
      where sh.gym_id = v_staff.gym_id
        and gym_local_date(sh.gym_id, sh.started_at) between p_from and p_to
    ) t), '[]'::json);
end;
$$;

-- Function privileges -------------------------------------------------------------------
revoke execute on function
  assert_owner(),
  membership_shares(uuid, numeric),
  fin_summary(date, date),
  fin_income_breakdown(date, date),
  fin_monthly(integer),
  fin_expiring(integer),
  fin_unpaid_members(),
  fin_expenses(date, date, uuid, text, uuid),
  record_expense(uuid, text, numeric, date, payment_method, boolean, text, text, boolean, uuid),
  fin_trainer_stats(date),
  fin_trainer_payments(uuid, date),
  fin_storage(date, date),
  fin_shifts(date, date)
  from public, anon;
