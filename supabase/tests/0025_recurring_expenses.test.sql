-- D-93: fixed monthly expenses and salaries (BR-136). Posted on the 1st of the gym's
-- month, at most once a month even after a void, never for the past; a change touches
-- only the months to come; the owner's alone (BR-157, D-80); the daily job (BR-162).
select plan(39);

-- Fixtures --------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('93939393-0000-0000-0000-00000000a001', null),
  ('93939393-0000-0000-0000-00000000a002', null),
  ('93939393-0000-0000-0000-00000000a003', null);
insert into gyms (id, name, timezone)
values ('93939393-0000-0000-0000-00000000b001', 'pgTAP Fiksni', 'Europe/Podgorica');
insert into gym_settings (gym_id) values ('93939393-0000-0000-0000-00000000b001');
insert into staff (id, gym_id, user_id, role, full_name, username) values
  ('93939393-0000-0000-0000-00000000c001', '93939393-0000-0000-0000-00000000b001',
   '93939393-0000-0000-0000-00000000a001', 'owner', 'pgTAP Vlasnik', 'pgtap.fix.vlasnik'),
  ('93939393-0000-0000-0000-00000000c002', '93939393-0000-0000-0000-00000000b001',
   '93939393-0000-0000-0000-00000000a002', 'manager', 'pgTAP Menadzer', 'pgtap.fix.menadzer'),
  ('93939393-0000-0000-0000-00000000c003', '93939393-0000-0000-0000-00000000b001',
   '93939393-0000-0000-0000-00000000a003', 'receptionist', 'pgTAP Ana', 'pgtap.fix.ana');
insert into expense_categories (id, gym_id, name, is_salary, is_system) values
  ('93939393-0000-0000-0000-000000060001', '93939393-0000-0000-0000-00000000b001', 'pgTAP Plate', true, false),
  ('93939393-0000-0000-0000-000000060002', '93939393-0000-0000-0000-00000000b001', 'pgTAP Kirija', false, false),
  ('93939393-0000-0000-0000-000000060003', '93939393-0000-0000-0000-00000000b001', 'pgTAP Internet', false, false),
  ('93939393-0000-0000-0000-000000060004', '93939393-0000-0000-0000-00000000b001', 'pgTAP Roba za prodaju', false, true);

-- The gym's month, the next two, and the end of this one (BR-001).
create temporary table rm as
  select t.today,
         t.first,
         (t.first + interval '1 month')::date as next,
         (t.first + interval '2 months')::date as after_next,
         (t.first + interval '1 month')::date - 1 as last
  from (select gym_today('93939393-0000-0000-0000-00000000b001') as today,
               date_trunc('month', gym_today('93939393-0000-0000-0000-00000000b001'))::date
                 as first) t;
grant select on rm to authenticated;

-- The owner adds them -------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "93939393-0000-0000-0000-00000000a001"}';
set local role authenticated;

select lives_ok(
  $$select upsert_recurring_expense(null, '93939393-0000-0000-0000-000000060002',
      'pgTAP Kirija', 500, null, (select first from rm), true)$$,
  'BR-136: the owner adds the rent from this month');
select is(
  (select e.spent_on::text || '|' || e.amount || '|' || coalesce(e.method::text, 'null') || '|'
          || e.paid_from_till || '|' || coalesce(e.shift_id::text, 'null') || '|'
          || (e.created_by = '93939393-0000-0000-0000-00000000c001')
   from expenses e join recurring_expenses r on r.id = e.recurring_expense_id
   where r.description = 'pgTAP Kirija'),
  (select first from rm)::text || '|500.00|null|false|null|true',
  'BR-136: this month is posted at once, on the 1st, outside the till, with no shift, by the owner');
select lives_ok(
  $$select upsert_recurring_expense(null, '93939393-0000-0000-0000-000000060001',
      'pgTAP Plata – Ana', 800, 'card', (select first from rm), true)$$,
  'BR-136: and a receptionist''s salary, paid by card');
select lives_ok(
  $$select upsert_recurring_expense(null, '93939393-0000-0000-0000-000000060003',
      'pgTAP Internet', 30, null, (select next from rm), true)$$,
  'BR-136: and the internet from next month');
select is(
  (select count(*)::int from expenses e join recurring_expenses r on r.id = e.recurring_expense_id
   where r.description = 'pgTAP Internet'),
  0, 'BR-136: a month that has not begun is not posted');

select is(
  (fin_statement((select first from rm), (select today from rm)) ->> 'operating_total')::numeric,
  1300.00, 'D-92: the posted rent and salary are this month''s operating expenses');
select is(
  (fin_statement((select first from rm), (select today from rm)) -> 'cash_flow' ->> 'other_paid')::numeric,
  1300.00, 'BR-158: and money paid');
select is(
  (select count(*)::int from json_array_elements(
     fin_expenses((select first from rm), (select today from rm))) row
   where row ->> 'recurring_expense_id' is not null),
  2, 'S-17: fin_expenses names the fixed expense each posted row came from');

-- BR-136: the rules of the form ----------------------------------------------------------
select throws_ok(
  $$select upsert_recurring_expense(null, '93939393-0000-0000-0000-000000060002',
      'pgTAP Stara kirija', 500, null, ((select first from rm) - interval '1 month')::date, true)$$,
  'P0001', 'E_VALIDATION', 'BR-136: nothing starts in a month that has passed');
select throws_ok(
  $$select upsert_recurring_expense(null, '93939393-0000-0000-0000-000000060002',
      'pgTAP Kirija 2', 500, null, (select next from rm) + 1, true)$$,
  'P0001', 'E_VALIDATION', 'BR-136: a first month starts on its 1st');
select throws_ok(
  $$select upsert_recurring_expense(null, '93939393-0000-0000-0000-000000060004',
      'pgTAP Roba', 100, null, (select next from rm), true)$$,
  'P0001', 'E_CATEGORY_NOT_ALLOWED', 'BR-136 (D-92): goods are not a fixed expense');
select throws_ok(
  $$select upsert_recurring_expense(null, '93939393-0000-0000-0000-000000060002',
      'pgTAP Kirija 3', 0, null, (select next from rm), true)$$,
  'P0001', 'E_VALIDATION', 'BR-136: an amount is at least €0.01');
select throws_ok(
  $$select upsert_recurring_expense(
      (select id from recurring_expenses where description = 'pgTAP Plata – Ana'),
      '93939393-0000-0000-0000-000000060001', 'pgTAP Plata – Ana', 800, 'card',
      (select next from rm), true)$$,
  'P0001', 'E_VALIDATION', 'BR-136: the first month is fixed once something was posted');
select throws_ok(
  $$insert into recurring_expenses (gym_id, category_id, description, amount, starts_on,
                                    created_by)
    values ('93939393-0000-0000-0000-00000000b001', '93939393-0000-0000-0000-000000060002',
            'pgTAP direktno', 1, (select next from rm), '93939393-0000-0000-0000-00000000c001')$$,
  '42501', null, 'Doc 04 §2: no direct writes to recurring_expenses');

-- A voided month stays voided ----------------------------------------------------------
select lives_ok(
  $$select void_expense(
      (select e.id from expenses e join recurring_expenses r on r.id = e.recurring_expense_id
       where r.description = 'pgTAP Kirija'), 'Kirija plaćena unaprijed')$$,
  'BR-135: the owner voids this month''s rent');
reset role;
select is(post_recurring_expenses('93939393-0000-0000-0000-00000000b001'), 0,
  'BR-136: running again posts nothing, and does not bring the voided month back');
select is(job_recurring_expenses(), 0, 'BR-162: nor does the daily job');

-- The next month --------------------------------------------------------------------------
select is(post_recurring_expenses('93939393-0000-0000-0000-00000000b001', (select next from rm)),
  3, 'BR-136: next month the rent, the salary and the internet are posted');
select is(post_recurring_expenses('93939393-0000-0000-0000-00000000b001', (select next from rm) + 14),
  0, 'BR-136: once a month, whatever day the job runs');
select is(
  (select string_agg(r.description || ' ' || e.spent_on, ', ' order by r.description)
   from expenses e join recurring_expenses r on r.id = e.recurring_expense_id
   where e.spent_on = (select next from rm)),
  'pgTAP Internet ' || (select next from rm) || ', pgTAP Kirija ' || (select next from rm)
    || ', pgTAP Plata – Ana ' || (select next from rm),
  'BR-136: each on the 1st of that month');

-- A change touches only the months to come ------------------------------------------------
set local role authenticated;
select lives_ok(
  $$select upsert_recurring_expense(
      (select id from recurring_expenses where description = 'pgTAP Plata – Ana'),
      '93939393-0000-0000-0000-000000060001', 'pgTAP Plata – Ana', 900, 'card',
      (select first from rm), true)$$,
  'BR-136: the salary rises to €900');
select lives_ok(
  $$select upsert_recurring_expense(
      (select id from recurring_expenses where description = 'pgTAP Kirija'),
      '93939393-0000-0000-0000-000000060002', 'pgTAP Kirija', 500, null,
      (select first from rm), false)$$,
  'BR-136: and the rent stops');
select is(
  (select e.amount from expenses e join recurring_expenses r on r.id = e.recurring_expense_id
   where r.description = 'pgTAP Plata – Ana' and e.spent_on = (select first from rm)),
  800.00::numeric, 'BR-136: this month''s posted salary keeps its €800');
reset role;
select is(post_recurring_expenses('93939393-0000-0000-0000-00000000b001', (select after_next from rm)),
  2, 'BR-136: in two months only the salary and the internet are posted');
select is(
  (select e.amount from expenses e join recurring_expenses r on r.id = e.recurring_expense_id
   where r.description = 'pgTAP Plata – Ana' and e.spent_on = (select after_next from rm)),
  900.00::numeric, 'BR-136: at the new amount');

-- S-30 ----------------------------------------------------------------------------------------
set local role authenticated;
select is(
  (select fin_recurring_expenses() ->> 'salary_total'), '900.00',
  'S-30: the active salaries cost €900 a month');
select is(
  (select fin_recurring_expenses() ->> 'other_total'), '30.00',
  'S-30: the other active fixed expenses €30; the stopped rent is not counted');
select is(
  (select fin_recurring_expenses() ->> 'total'), '930.00', 'S-30: €930 in all');
select is(
  (select i ->> 'last_posted'
   from json_array_elements(fin_recurring_expenses() -> 'items') i
   where i ->> 'description' = 'pgTAP Kirija'),
  (select next from rm)::text,
  'S-30: the last posted month leaves out the voided one');
select is(
  (select (i ->> 'has_postings')::boolean
   from json_array_elements(fin_recurring_expenses() -> 'items') i
   where i ->> 'description' = 'pgTAP Internet'),
  true, 'S-30: and says the internet''s first month is fixed now');
select ok(
  (select count(*) from audit_log
   where gym_id = '93939393-0000-0000-0000-00000000b001' and table_name = 'recurring_expenses')
  >= 5, 'BR-096: every fixed expense added and changed is audited');

-- Nobody else ----------------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub": "93939393-0000-0000-0000-00000000a002"}';
set local role authenticated;
select throws_ok(
  $$select upsert_recurring_expense(null, '93939393-0000-0000-0000-000000060003',
      'pgTAP Menadzer', 10, null, (select next from rm), true)$$,
  'P0001', 'E_FORBIDDEN', 'BR-136: a manager adds no fixed expense');
select throws_ok(
  $$select fin_recurring_expenses()$$,
  'P0001', 'E_FORBIDDEN', 'BR-157: nor sees them');
select is((select count(*)::int from recurring_expenses), 0,
  'BR-157: not even through the table');
select is(
  (select string_agg(row ->> 'description', ', ' order by row ->> 'description')
   from json_array_elements(fin_expenses((select first from rm), (select last from rm))) row),
  'pgTAP Kirija', 'D-80: a manager lists the posted rent but never the posted salary');

reset role;
set local request.jwt.claims = '{"sub": "93939393-0000-0000-0000-00000000a003"}';
set local role authenticated;
select throws_ok(
  $$select upsert_recurring_expense(null, '93939393-0000-0000-0000-000000060003',
      'pgTAP Ana', 10, null, (select next from rm), true)$$,
  'P0001', 'E_FORBIDDEN', 'BR-136: nor does a receptionist');
select is((select count(*)::int from recurring_expenses), 0,
  'BR-157: who sees none of them either');
select throws_ok(
  $$select post_recurring_expenses('93939393-0000-0000-0000-00000000b001')$$,
  '42501', null, 'BR-136: posting is the job''s, never a caller''s');

reset role;
select is(
  (select schedule from cron.job where jobname = 'kp-fitness-recurring-expenses'),
  '5 22,23 * * *', 'BR-162: the job runs at 00:05 in Podgorica, summer and winter');

select * from finish();
