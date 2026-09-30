-- D-93: fixed monthly expenses and salaries (BR-136). The owner describes a cost once —
-- rent, internet, a receptionist's salary — and it is posted as an ordinary expense on
-- the 1st of every month, so S-17, voids, the statement (D-92) and a manager's view
-- (D-80) all treat it like any other expense. A posted month is never posted again, not
-- even after it was voided; changing a fixed expense changes only the months to come.

create table recurring_expenses (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references gyms(id),
  category_id uuid not null references expense_categories(id),
  description text not null check (char_length(description) between 2 and 200),
  amount      numeric(10,2) not null check (amount > 0 and amount <= 100000),
  method      payment_method,                          -- null = "Van kase" (AS-17)
  starts_on   date not null check (extract(day from starts_on) = 1),
  is_active   boolean not null default true,
  created_by  uuid not null references staff(id),
  created_at  timestamptz not null default now()
);
create index recurring_expenses_gym_idx on recurring_expenses (gym_id);

-- BR-096: every change to a fixed expense is audited.
create trigger recurring_expenses_audit
  after insert or update on recurring_expenses
  for each row execute function audit_row();

alter table recurring_expenses enable row level security;

-- BR-136 and D-80: fixed expenses, salaries among them, are the owner's and the admin's.
create policy recurring_expenses_select on recurring_expenses
  for select to authenticated
  using (
    gym_id = (select my_gym())
    and (select my_role()) = any (array['owner'::app_role, 'admin'::app_role])
  );

revoke all on recurring_expenses from anon, authenticated;
grant select on recurring_expenses to authenticated;

-- The month an expense was posted for. The index makes "at most once a month" hold for
-- voided postings too, so a month the owner voided is not posted again.
alter table expenses
  add column recurring_expense_id uuid references recurring_expenses(id);
create unique index expenses_recurring_month_idx
  on expenses (recurring_expense_id, spent_on)
  where recurring_expense_id is not null;
alter table expenses
  add constraint expenses_recurring_not_from_till
  check (recurring_expense_id is null or not paid_from_till);

/**
 * BR-136: post this month's fixed expenses of one gym: one expense on the 1st of the
 * gym's month (BR-001) for every active fixed expense that has started, unless that
 * month is already posted. Returns how many were posted. `p_today` stands in for the
 * gym's today in tests. Only the job and upsert_recurring_expense call it.
 */
create function post_recurring_expenses(p_gym uuid, p_today date default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := coalesce(p_today, gym_today(p_gym));
  v_month date := v_today - (extract(day from v_today)::int - 1);
  v_count integer;
begin
  insert into expenses (gym_id, spent_on, category_id, description, amount, method,
                        paid_from_till, recurring_expense_id, created_by)
  select r.gym_id, v_month, r.category_id, r.description, r.amount, r.method,
         false, r.id, r.created_by
  from recurring_expenses r
  where r.gym_id = p_gym and r.is_active and r.starts_on <= v_month
  on conflict (recurring_expense_id, spent_on) where recurring_expense_id is not null
  do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function post_recurring_expenses(uuid, date)
  from public, anon, authenticated;

/** BR-162 (D-93): the daily job; posts the month's fixed expenses of every gym. */
create function job_recurring_expenses()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gym   uuid;
  v_total integer := 0;
begin
  for v_gym in select distinct gym_id from recurring_expenses where is_active loop
    v_total := v_total + post_recurring_expenses(v_gym);
  end loop;
  return v_total;
end;
$$;

revoke execute on function job_recurring_expenses() from public, anon, authenticated;

/**
 * BR-136 (owner): add a fixed expense (`p_id` null) or change one. The category is an
 * active one other than "Roba za prodaju" (goods come in through Nova roba, D-92). The
 * first month is this month or a later one, and moves only while nothing was posted, so
 * nothing is ever posted for the past. A change touches only the months to come. The
 * month that has already begun is posted at once.
 */
create function upsert_recurring_expense(
  p_id          uuid,
  p_category    uuid,
  p_description text,
  p_amount      numeric,
  p_method      payment_method,
  p_starts_on   date,
  p_is_active   boolean
)
returns recurring_expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff       staff := assert_owner();
  v_today       date;
  v_month       date;
  v_category    expense_categories;
  v_description text := btrim(coalesce(p_description, ''));
  v_old         recurring_expenses;
  v_row         recurring_expenses;
begin
  v_today := gym_today(v_staff.gym_id);
  v_month := v_today - (extract(day from v_today)::int - 1);

  select * into v_category from expense_categories
  where id = p_category and gym_id = v_staff.gym_id and is_active;
  if not found then
    raise exception 'E_VALIDATION';
  end if;
  if v_category.is_system then
    raise exception 'E_CATEGORY_NOT_ALLOWED';
  end if;
  if char_length(v_description) not between 2 and 200
     or p_amount is null or p_amount < 0.01 or p_amount > 100000
     or p_starts_on is null or extract(day from p_starts_on) <> 1
     or p_is_active is null then
    raise exception 'E_VALIDATION';
  end if;

  if p_id is null then
    if p_starts_on < v_month then
      raise exception 'E_VALIDATION';
    end if;
    insert into recurring_expenses (gym_id, category_id, description, amount, method,
                                    starts_on, is_active, created_by)
    values (v_staff.gym_id, p_category, v_description, round(p_amount, 2), p_method,
            p_starts_on, p_is_active, v_staff.id)
    returning * into v_row;
  else
    select * into v_old from recurring_expenses
    where id = p_id and gym_id = v_staff.gym_id
    for update;
    if not found then
      raise exception 'E_FORBIDDEN';
    end if;
    if p_starts_on <> v_old.starts_on
       and (p_starts_on < v_month
            or exists (select 1 from expenses where recurring_expense_id = p_id)) then
      raise exception 'E_VALIDATION';
    end if;
    update recurring_expenses
    set category_id = p_category,
        description = v_description,
        amount      = round(p_amount, 2),
        method      = p_method,
        starts_on   = p_starts_on,
        is_active   = p_is_active
    where id = p_id
    returning * into v_row;
  end if;

  perform post_recurring_expenses(v_staff.gym_id);
  return v_row;
end;
$$;

revoke execute on function
  upsert_recurring_expense(uuid, uuid, text, numeric, payment_method, date, boolean)
  from public, anon;

/**
 * S-30 (owner): every fixed expense with its category, the last month posted and not
 * voided, and whether anything was posted at all (which fixes its first month); plus
 * what the active ones cost a month, salaries apart from the rest.
 */
create function fin_recurring_expenses()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_staff staff := assert_owner();
begin
  return (
    with items as (
      select r.id,
             r.description,
             r.category_id,
             c.name as category_name,
             c.is_salary,
             r.amount,
             r.method,
             r.starts_on,
             r.is_active,
             (select max(e.spent_on) from expenses e
              where e.recurring_expense_id = r.id and e.voided_at is null) as last_posted,
             exists (select 1 from expenses e where e.recurring_expense_id = r.id)
               as has_postings
      from recurring_expenses r
      join expense_categories c on c.id = r.category_id
      where r.gym_id = v_staff.gym_id
    )
    select json_build_object(
      'items', coalesce((
        select json_agg(json_build_object(
                 'id', i.id,
                 'description', i.description,
                 'category_id', i.category_id,
                 'category_name', i.category_name,
                 'is_salary', i.is_salary,
                 'amount', i.amount::text,
                 'method', i.method,
                 'starts_on', i.starts_on,
                 'is_active', i.is_active,
                 'last_posted', i.last_posted,
                 'has_postings', i.has_postings)
               order by i.is_salary desc, i.description)
        from items i), '[]'::json),
      'salary_total', (select coalesce(sum(amount), 0)::numeric(12,2)::text
                       from items where is_active and is_salary),
      'other_total', (select coalesce(sum(amount), 0)::numeric(12,2)::text
                      from items where is_active and not is_salary),
      'total', (select coalesce(sum(amount), 0)::numeric(12,2)::text
                from items where is_active)
    )
  );
end;
$$;

revoke execute on function fin_recurring_expenses() from public, anon;

-- S-17: fin_expenses from 0035, now naming the fixed expense a row was posted from, so
-- the list can mark it `Fiksni` (D-93). Nothing else changes.
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
             e.recurring_expense_id,
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

-- BR-162 (D-93): 00:05 in Podgorica both in summer (22:05 UTC) and in winter (23:05
-- UTC); the other run of the two finds the month already posted.
select cron.schedule('kp-fitness-recurring-expenses', '5 22,23 * * *',
                     'select public.job_recurring_expenses()');
