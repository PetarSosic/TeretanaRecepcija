-- D-77: the manager sees income and expenses on Finansije (Pregled, Troškovi, Smjene),
-- for today, this week or this month only, never profit and never salaries.
-- D-78: a manager downloads no PDF, so the card print sheet becomes the owner's too.
--
-- The four report functions a manager may now call start with `assert_finance_period`
-- instead of `assert_owner`. The owner and the admin get exactly what they got before;
-- the bodies are those of 0023 with the manager's branches added.

/**
 * D-77: the guard of the finance reports a manager may read. The owner and the admin
 * pass for any range. A manager passes only for the three periods S-16 offers them —
 * Danas, Ova sedmica (Monday to Sunday) and Ovaj mjesec — measured against the gym's
 * today (BR-001), the same ranges `resolvePeriod` builds in features/finance/period.ts.
 * Any other range, an earlier month above all, raises E_FORBIDDEN.
 */
create function assert_finance_period(p_from date, p_to date)
returns staff
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff  staff := assert_staff_role(array['owner', 'admin', 'manager']::app_role[]);
  v_today  date;
  v_monday date;
  v_month  date;
begin
  if v_staff.role <> 'manager' then
    return v_staff;
  end if;

  v_today  := gym_today(v_staff.gym_id);
  v_monday := v_today - (extract(isodow from v_today)::integer - 1);
  v_month  := v_today - (extract(day from v_today)::integer - 1);

  if (p_from = v_today and p_to = v_today)
     or (p_from = v_monday and p_to = v_monday + 6)
     or (p_from = v_month and p_to = (v_month + interval '1 month')::date - 1) then
    return v_staff;
  end if;
  raise exception 'E_FORBIDDEN';
end;
$$;

-- BR-150 to BR-153. D-77: a manager gets income and non-salary expenses, nothing else.
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
            and membership_status(ms.id, gym_today(v_staff.gym_id)) = 'active')
    )
  );
end;
$$;

-- S-16 tables. D-77: a manager's expenses by category leave out the salary categories.
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
          and (not v_manager or not c.is_salary)
        group by c.name
      ) t), '[]'::json)
  );
end;
$$;

-- S-17. D-77: a manager reads every expense of the period except the salary ones.
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
  v_staff   staff := assert_finance_period(p_from, p_to);
  v_manager boolean := v_staff.role = 'manager';
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
        and (not v_manager or not c.is_salary)
        and (p_category is null or e.category_id = p_category)
        and (p_method is null
             or (p_method = 'none' and e.method is null)
             or e.method::text = p_method)
        and (p_created_by is null or e.created_by = p_created_by)
    ) t), '[]'::json);
end;
$$;

-- S-19. D-77 and D-78: a manager lists the shifts with their totals, but is never sent
-- the report's storage path or anything about its email (BR-118).
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

/**
 * BR-036 and D-78: the owner and the admin generate 1-100 unassigned cards in one
 * batch; a manager no longer prints cards. The body is 0009's.
 */
create or replace function generate_card_batch(p_qty integer)
returns card_batches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff    staff := assert_owner();
  v_batch    card_batches;
  v_made     integer := 0;
  v_attempts integer := 0;
begin
  if p_qty is null or p_qty < 1 or p_qty > 100 then
    raise exception 'E_VALIDATION';
  end if;

  insert into card_batches (gym_id, quantity, created_by)
  values (v_staff.gym_id, p_qty, v_staff.id)
  returning * into v_batch;

  while v_made < p_qty loop
    v_attempts := v_attempts + 1;
    if v_attempts > p_qty * 50 then
      -- Unreachable in practice; fail loudly rather than loop forever.
      raise exception 'E_VALIDATION';
    end if;
    insert into cards (gym_id, code, batch_id)
    values (v_staff.gym_id, random_card_code(), v_batch.id)
    on conflict (code) do nothing;
    if found then v_made := v_made + 1; end if;
  end loop;

  return v_batch;
end;
$$;

-- D-78: batches are a printing tool, and printing is now the owner's and the admin's.
drop policy card_batches_select on card_batches;
create policy card_batches_select on card_batches
  for select to authenticated
  using (gym_id = my_gym() and my_role() in ('owner', 'admin'));

-- Function privileges -------------------------------------------------------------------
revoke execute on function assert_finance_period(date, date) from public, anon;
