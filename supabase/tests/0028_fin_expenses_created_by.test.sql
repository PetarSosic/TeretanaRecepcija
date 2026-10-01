-- D-96: S-12 shows a manager today's expenses as S-17 does (D-80) through fin_expenses,
-- whose rows now say who entered them, so [Poništi] stays on the manager's own (BR-135).
select plan(6);

-- Fixtures --------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('28282828-0000-0000-0000-00000000a001', null),
  ('28282828-0000-0000-0000-00000000a002', null),
  ('28282828-0000-0000-0000-00000000a003', null);
insert into gyms (id, name, timezone)
values ('28282828-0000-0000-0000-00000000b001', 'pgTAP Troskovi danas', 'Europe/Podgorica');
insert into gym_settings (gym_id) values ('28282828-0000-0000-0000-00000000b001');
insert into staff (id, gym_id, user_id, role, full_name, username) values
  ('28282828-0000-0000-0000-00000000c001', '28282828-0000-0000-0000-00000000b001',
   '28282828-0000-0000-0000-00000000a001', 'receptionist', 'pgTAP Ana', 'pgtap.td.ana'),
  ('28282828-0000-0000-0000-00000000c002', '28282828-0000-0000-0000-00000000b001',
   '28282828-0000-0000-0000-00000000a002', 'owner', 'pgTAP Vlasnik', 'pgtap.td.vlasnik'),
  ('28282828-0000-0000-0000-00000000c003', '28282828-0000-0000-0000-00000000b001',
   '28282828-0000-0000-0000-00000000a003', 'manager', 'pgTAP Menadzer', 'pgtap.td.menadzer');
insert into expense_categories (id, gym_id, name, is_salary) values
  ('28282828-0000-0000-0000-00000000d001', '28282828-0000-0000-0000-00000000b001', 'pgTAP Struja', false),
  ('28282828-0000-0000-0000-00000000d002', '28282828-0000-0000-0000-00000000b001', 'pgTAP Plate', true);
insert into expenses (id, gym_id, spent_on, category_id, description, amount, method, created_by)
values
  ('28282828-0000-0000-0000-00000000e001', '28282828-0000-0000-0000-00000000b001',
   gym_today('28282828-0000-0000-0000-00000000b001'), '28282828-0000-0000-0000-00000000d001',
   'pgTAP struja vlasnika', 40, 'card', '28282828-0000-0000-0000-00000000c002'),
  ('28282828-0000-0000-0000-00000000e002', '28282828-0000-0000-0000-00000000b001',
   gym_today('28282828-0000-0000-0000-00000000b001'), '28282828-0000-0000-0000-00000000d001',
   'pgTAP struja menadzera', 15, 'cash', '28282828-0000-0000-0000-00000000c003'),
  ('28282828-0000-0000-0000-00000000e003', '28282828-0000-0000-0000-00000000b001',
   gym_today('28282828-0000-0000-0000-00000000b001'), '28282828-0000-0000-0000-00000000d002',
   'pgTAP plata', 500, 'cash', '28282828-0000-0000-0000-00000000c002');

-- The manager: every expense of today but the salary, with who entered it ---------------
set local request.jwt.claims = '{"sub": "28282828-0000-0000-0000-00000000a003"}';
set local role authenticated;
select is(
  (select json_array_length(fin_expenses(gym_today('28282828-0000-0000-0000-00000000b001'),
                                         gym_today('28282828-0000-0000-0000-00000000b001')))),
  2, 'D-96: the manager gets both expenses of today that are not a salary (D-80)');
select is(
  (select string_agg((r ->> 'description') || '|' || (r ->> 'created_by'), ', '
                     order by r ->> 'description')
   from json_array_elements(fin_expenses(gym_today('28282828-0000-0000-0000-00000000b001'),
                                         gym_today('28282828-0000-0000-0000-00000000b001'))) r),
  'pgTAP struja menadzera|28282828-0000-0000-0000-00000000c003, '
  || 'pgTAP struja vlasnika|28282828-0000-0000-0000-00000000c002',
  'D-96: each row says who entered it, so only the manager''s own can be voided (BR-135)');
select is(
  (select count(*)::int from expenses where gym_id = '28282828-0000-0000-0000-00000000b001'),
  1, 'BR-134: the manager''s direct read of the table is unchanged: only their own of today');

-- The owner sees the salary too; the receptionist gets nothing from fin_expenses ----------
reset role;
set local request.jwt.claims = '{"sub": "28282828-0000-0000-0000-00000000a002"}';
set local role authenticated;
select is(
  (select json_array_length(fin_expenses(gym_today('28282828-0000-0000-0000-00000000b001'),
                                         gym_today('28282828-0000-0000-0000-00000000b001')))),
  3, 'BR-134: the owner sees every expense of today, the salary included');

reset role;
set local request.jwt.claims = '{"sub": "28282828-0000-0000-0000-00000000a001"}';
set local role authenticated;
select throws_ok(
  $$select fin_expenses(gym_today('28282828-0000-0000-0000-00000000b001'),
                        gym_today('28282828-0000-0000-0000-00000000b001'))$$,
  'P0001', 'E_FORBIDDEN', 'BR-134: a receptionist cannot read the expenses of others');
select is(
  (select count(*)::int from expenses where gym_id = '28282828-0000-0000-0000-00000000b001'),
  0, 'BR-134: and sees none of them in the table');

select * from finish();
