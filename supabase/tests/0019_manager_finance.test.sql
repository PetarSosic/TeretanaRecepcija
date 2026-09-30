-- D-80: the manager reads income and expenses for today, this week or this month only,
-- never profit and never salaries; S-19 without the report or its email (BR-118).
-- D-81: the manager prints no cards. The owner's reports are unchanged (BR-157).
select plan(31);

-- Fixtures --------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('77777777-0000-0000-0000-00000000a001', null),
  ('77777777-0000-0000-0000-00000000a002', null),
  ('77777777-0000-0000-0000-00000000a003', null);
insert into gyms (id, name, timezone) values
  ('77777777-0000-0000-0000-00000000b001', 'pgTAP Menadzer finansije', 'Europe/Podgorica');
insert into gym_settings (gym_id) values ('77777777-0000-0000-0000-00000000b001');
insert into staff (id, gym_id, user_id, role, full_name, username) values
  ('77777777-0000-0000-0000-00000000c001', '77777777-0000-0000-0000-00000000b001',
   '77777777-0000-0000-0000-00000000a001', 'owner', 'pgTAP Vlasnik', 'pgtap.mf.vlasnik'),
  ('77777777-0000-0000-0000-00000000c002', '77777777-0000-0000-0000-00000000b001',
   '77777777-0000-0000-0000-00000000a002', 'manager', 'pgTAP Menadzer', 'pgtap.mf.menadzer'),
  ('77777777-0000-0000-0000-00000000c003', '77777777-0000-0000-0000-00000000b001',
   '77777777-0000-0000-0000-00000000a003', 'receptionist', 'pgTAP Ana', 'pgtap.mf.ana');

-- The three periods a manager may ask for (D-80), and last month, which they may not.
create temporary table mf as
  select t.today,
         t.today - (extract(isodow from t.today)::int - 1) as monday,
         t.today - (extract(day from t.today)::int - 1) as month_first,
         (t.today - (extract(day from t.today)::int - 1) + interval '1 month')::date - 1
           as month_last,
         (t.today - (extract(day from t.today)::int - 1) - interval '1 month')::date
           as prev_first,
         t.today - extract(day from t.today)::int as prev_last
  from (select gym_today('77777777-0000-0000-0000-00000000b001') as today) t;
-- The assertions below run as `authenticated`, which owns nothing of its own.
grant select on mf to authenticated;

insert into trainers (id, gym_id, full_name) values
  ('77777777-0000-0000-0000-00000000d001', '77777777-0000-0000-0000-00000000b001', 'pgTAP Tamara');
insert into plans (id, gym_id, name, kind, duration_value, duration_unit, price,
                   covers_gym, covers_group, covers_personal, requires_trainer) values
  ('77777777-0000-0000-0000-00000000e001', '77777777-0000-0000-0000-00000000b001',
   'pgTAP Dnevna', 'day_pass', null, null, 15, false, false, false, false);

-- Today's closed shift, whose report went out on the second attempt (BR-118).
insert into shifts (id, gym_id, staff_id, started_at, closed_at, close_type, report_path,
                    email_status, email_attempts, emailed_at) values
  ('77777777-0000-0000-0000-00000000f001', '77777777-0000-0000-0000-00000000b001',
   '77777777-0000-0000-0000-00000000c003', now(), now(), 'manual',
   'pgtap/shift.pdf', 'sent', 2, now());

-- BR-150: €15 of income today.
insert into payments (gym_id, kind, plan_id, amount, method, paid_on, created_by, shift_id)
values ('77777777-0000-0000-0000-00000000b001', 'day_pass',
        '77777777-0000-0000-0000-00000000e001', 15, 'cash', (select today from mf),
        '77777777-0000-0000-0000-00000000c003', '77777777-0000-0000-0000-00000000f001');

-- BR-151: €40 of electricity and a €25 payout to Tamara, both today.
insert into expense_categories (id, gym_id, name, is_salary) values
  ('77777777-0000-0000-0000-000000060001', '77777777-0000-0000-0000-00000000b001', 'pgTAP Struja', false),
  ('77777777-0000-0000-0000-000000060002', '77777777-0000-0000-0000-00000000b001', 'pgTAP Plate', true);
insert into expenses (gym_id, spent_on, category_id, description, amount, method,
                      trainer_id, created_by) values
  ('77777777-0000-0000-0000-00000000b001', (select today from mf),
   '77777777-0000-0000-0000-000000060001', 'pgTAP struja', 40, 'card', null,
   '77777777-0000-0000-0000-00000000c001'),
  ('77777777-0000-0000-0000-00000000b001', (select today from mf),
   '77777777-0000-0000-0000-000000060002', 'pgTAP isplata', 25, 'cash',
   '77777777-0000-0000-0000-00000000d001', '77777777-0000-0000-0000-00000000c001');

insert into card_batches (id, gym_id, quantity, created_by) values
  ('77777777-0000-0000-0000-000000070001', '77777777-0000-0000-0000-00000000b001', 1,
   '77777777-0000-0000-0000-00000000c001');

-- The owner: nothing changes (BR-150 to BR-153) --------------------------------------
set local request.jwt.claims = '{"sub": "77777777-0000-0000-0000-00000000a001"}';
set local role authenticated;

select is(
  (fin_summary((select today from mf), (select today from mf)) ->> 'expenses')::numeric,
  65.00::numeric, 'BR-151: the owner''s expenses include the payout');
select ok(
  (fin_summary((select today from mf), (select today from mf)))::jsonb ?& array['profit', 'bar_profit', 'active_members'],
  'BR-152, BR-153: the owner still gets profit, bar profit and active members');
select is(
  fin_shifts((select today from mf), (select today from mf)) -> 0 ->> 'report_path',
  'pgtap/shift.pdf', 'BR-118: the owner still gets the report of each shift');
select lives_ok(
  $$select fin_summary((select prev_first from mf), (select prev_last from mf))$$,
  'The owner may still ask for any period');

-- The manager: income and non-salary expenses, three periods only (D-80) ---------------
reset role;
set local request.jwt.claims = '{"sub": "77777777-0000-0000-0000-00000000a002"}';
set local role authenticated;

select is(
  (fin_summary((select today from mf), (select today from mf)) ->> 'income')::numeric,
  15.00::numeric, 'D-80: a manager gets today''s income');
select is(
  (fin_summary((select today from mf), (select today from mf)) ->> 'expenses')::numeric,
  40.00::numeric, 'D-80: and today''s expenses without the salary payout');
select is(
  (select array_agg(key order by key)
   from json_object_keys(fin_summary((select today from mf), (select today from mf))) key),
  array['expenses', 'income'],
  'BR-157 (D-80): and nothing else, no profit, bar profit or member count');
select lives_ok(
  $$select fin_summary((select monday from mf), (select monday from mf) + 6)$$,
  'D-80: a manager may ask for this week');
select lives_ok(
  $$select fin_summary((select month_first from mf), (select month_last from mf))$$,
  'D-80: and for this month');
select is(
  (fin_summary((select month_first from mf), (select month_last from mf)) ->> 'expenses')::numeric,
  40.00::numeric, 'D-80: this month''s expenses leave the payout out too');

select is(
  (select count(*)::int
   from json_array_elements(
          fin_income_breakdown((select today from mf), (select today from mf)) -> 'by_category') c
   where c ->> 'name' = 'pgTAP Plate'),
  0, 'D-80: the category table has no salary row for a manager');
select is(
  (select (c ->> 'total')::numeric
   from json_array_elements(
          fin_income_breakdown((select today from mf), (select today from mf)) -> 'by_category') c
   where c ->> 'name' = 'pgTAP Struja'),
  40.00::numeric, 'D-80: but keeps the ordinary categories');

select is(
  json_array_length(fin_expenses((select today from mf), (select today from mf))),
  1, 'D-80: S-17 lists one expense for a manager');
select is(
  fin_expenses((select today from mf), (select today from mf)) -> 0 ->> 'category_name',
  'pgTAP Struja', 'D-80: and it is not the payout');
select is(
  json_array_length(fin_expenses((select today from mf), (select today from mf),
                                 '77777777-0000-0000-0000-000000060002')),
  0, 'D-80: filtering on the salary category finds nothing');

select is(
  json_array_length(fin_shifts((select today from mf), (select today from mf))),
  1, 'D-80: a manager lists today''s shifts');
select is(
  fin_shifts((select today from mf), (select today from mf)) -> 0 ->> 'staff_name',
  'pgTAP Ana', 'D-80: with who worked them');
select ok(
  not ((fin_shifts((select today from mf), (select today from mf)) -> 0)::jsonb
       ?| array['report_path', 'email_status', 'email_attempts', 'emailed_at']),
  'D-80, BR-118: but never the report path or anything about its email');

-- Any other period is refused ----------------------------------------------------------
select throws_ok(
  $$select fin_summary((select prev_first from mf), (select prev_last from mf))$$,
  'E_FORBIDDEN', 'D-80: last month is refused');
select throws_ok(
  $$select fin_summary((select today from mf) - 400, (select today from mf))$$,
  'E_FORBIDDEN', 'D-80: so is a long range');
select throws_ok(
  $$select fin_income_breakdown((select prev_first from mf), (select prev_last from mf))$$,
  'E_FORBIDDEN', 'D-80: by fin_income_breakdown too');
select throws_ok(
  $$select fin_expenses((select prev_first from mf), (select prev_last from mf))$$,
  'E_FORBIDDEN', 'D-80: by fin_expenses too');
select throws_ok(
  $$select fin_shifts((select prev_first from mf), (select prev_last from mf))$$,
  'E_FORBIDDEN', 'D-80: and by fin_shifts');

-- The rest of finance stays the owner's (BR-157) ----------------------------------------
select throws_ok(
  $$select fin_chart(extract(year from (select today from mf))::int)$$,
  'E_FORBIDDEN', 'BR-157: no chart for a manager (D-80)');
select throws_ok(
  $$select fin_trainer_stats((select month_first from mf))$$,
  'E_FORBIDDEN', 'BR-156: no trainer statistics');
select throws_ok(
  $$select fin_storage((select today from mf), (select today from mf))$$,
  'E_FORBIDDEN', 'BR-144: no storage report');
select throws_ok(
  $$select fin_expiring(7)$$,
  'E_FORBIDDEN', 'D-80: no expiring list');
select throws_ok(
  $$select fin_unpaid_members()$$,
  'E_FORBIDDEN', 'D-80: no unpaid list');

-- D-81: no card printing ---------------------------------------------------------------
select throws_ok(
  $$select generate_card_batch(1)$$,
  'E_FORBIDDEN', 'P-64 (D-81): a manager generates no card batch');
select is(
  (select count(*)::int from card_batches), 0,
  'D-81: and reads no batch to print');

-- The receptionist gets nothing ----------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub": "77777777-0000-0000-0000-00000000a003"}';
set local role authenticated;
select throws_ok(
  $$select fin_summary((select today from mf), (select today from mf))$$,
  'E_FORBIDDEN', 'BR-157: a receptionist gets nothing, even for today');

reset role;
select * from finish();
