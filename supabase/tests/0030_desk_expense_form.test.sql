-- D-98: the desk's [Trošak] is the BR-133 form for every role. A manager or receptionist
-- picks the date and the method, "Van kase" included, and adds supplier, invoice and VAT;
-- salaries stay the owner's (D-37, D-80); their record joins the open shift so they can
-- void it (BR-135), and the shift's cash counts only what is paid from the till (BR-115).
select plan(22);

-- Fixtures --------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('94949494-0000-0000-0000-00000000a001', null),
  ('94949494-0000-0000-0000-00000000a002', null),
  ('94949494-0000-0000-0000-00000000a003', null);
insert into gyms (id, name, timezone)
values ('94949494-0000-0000-0000-00000000b001', 'pgTAP Trosak', 'Europe/Podgorica');
insert into gym_settings (gym_id) values ('94949494-0000-0000-0000-00000000b001');
insert into staff (id, gym_id, user_id, role, full_name, username) values
  ('94949494-0000-0000-0000-00000000c001', '94949494-0000-0000-0000-00000000b001',
   '94949494-0000-0000-0000-00000000a001', 'owner', 'pgTAP Vlasnik', 'pgtap.tro.vlasnik'),
  ('94949494-0000-0000-0000-00000000c002', '94949494-0000-0000-0000-00000000b001',
   '94949494-0000-0000-0000-00000000a002', 'manager', 'pgTAP Menadzer', 'pgtap.tro.menadzer'),
  ('94949494-0000-0000-0000-00000000c003', '94949494-0000-0000-0000-00000000b001',
   '94949494-0000-0000-0000-00000000a003', 'receptionist', 'pgTAP Ana', 'pgtap.tro.ana');
insert into expense_categories (id, gym_id, name, is_salary, is_system) values
  ('94949494-0000-0000-0000-000000060001', '94949494-0000-0000-0000-00000000b001', 'pgTAP Plate', true, false),
  ('94949494-0000-0000-0000-000000060002', '94949494-0000-0000-0000-00000000b001', 'pgTAP Voda', false, false),
  ('94949494-0000-0000-0000-000000060003', '94949494-0000-0000-0000-00000000b001', 'pgTAP Roba za prodaju', false, true);
insert into trainers (id, gym_id, full_name)
values ('94949494-0000-0000-0000-00000000d001', '94949494-0000-0000-0000-00000000b001', 'pgTAP Tamara');
insert into shifts (id, gym_id, staff_id)
values ('94949494-0000-0000-0000-00000000f001', '94949494-0000-0000-0000-00000000b001',
        '94949494-0000-0000-0000-00000000c003');

-- The gym's today (BR-001).
create temporary table dx as
  select gym_today('94949494-0000-0000-0000-00000000b001') as today;
grant select on dx to authenticated;

-- The receptionist ------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "94949494-0000-0000-0000-00000000a003"}';
set local role authenticated;

select lives_ok(
  $$select record_expense('94949494-0000-0000-0000-000000060002', 'pgTAP Voda kartica', 12.40,
      (select today from dx) - 1, 'card', false, 'pgTAP Dobavljac', 'R-17', true, null)$$,
  'D-98: a receptionist records yesterday''s card expense with supplier, invoice and VAT');
select lives_ok(
  $$select record_expense('94949494-0000-0000-0000-000000060002', 'pgTAP Voda van kase', 8,
      (select today from dx), null, false, null, null, null, null)$$,
  'D-98: and one paid outside the till');
select lives_ok(
  $$select record_expense('94949494-0000-0000-0000-000000060002', 'pgTAP Voda iz kase', 5,
      (select today from dx) - 3, 'card', true, null, null, null, null)$$,
  'BR-133: and one from the till, whatever date and method were sent');
select throws_ok(
  $$select record_expense('94949494-0000-0000-0000-000000060001', 'pgTAP Plata', 500,
      (select today from dx), 'cash', false, null, null, null, null)$$,
  'E_CATEGORY_NOT_ALLOWED', 'D-37: a receptionist records no salary');
select throws_ok(
  $$select record_expense('94949494-0000-0000-0000-000000060001', 'pgTAP Isplata', 500,
      (select today from dx), 'cash', false, null, null, null,
      '94949494-0000-0000-0000-00000000d001')$$,
  'E_CATEGORY_NOT_ALLOWED', 'D-37: nor a payout to a trainer');
select throws_ok(
  $$select record_expense('94949494-0000-0000-0000-000000060003', 'pgTAP Roba', 5,
      (select today from dx), 'cash', false, null, null, null, null)$$,
  'E_CATEGORY_NOT_ALLOWED', 'D-92: nor Roba za prodaju');
select throws_ok(
  $$select record_expense('94949494-0000-0000-0000-000000060002', 'pgTAP sjutra', 5,
      (select today from dx) + 1, 'cash', false, null, null, null, null)$$,
  'E_VALIDATION', 'BR-133: nor a date after today');
select throws_ok(
  $$select record_expense('94949494-0000-0000-0000-000000060002', 'pgTAP previse', 100000.01,
      (select today from dx), 'cash', false, null, null, null, null)$$,
  'E_VALIDATION', 'BR-133: nor more than 100,000');
select is(
  (shift_summary('94949494-0000-0000-0000-00000000f001') -> 'totals' ->> 'till_expenses')::numeric,
  5.00::numeric, 'BR-115: the shift''s till expenses count only what was paid from the till');
select lives_ok(
  $$select void_expense((select id from expenses where description = 'pgTAP Voda van kase'),
      'Pogresno uneseno')$$,
  'BR-135: she voids her own expense outside the till while the shift is open');

reset role;
select is(
  (select spent_on::text || '|' || method || '|' || paid_from_till || '|' || supplier || '|'
          || invoice_number || '|' || vat_included || '|'
          || (shift_id = '94949494-0000-0000-0000-00000000f001') || '|'
          || (created_by = '94949494-0000-0000-0000-00000000c003')
   from expenses where description = 'pgTAP Voda kartica'),
  ((select today from dx) - 1)::text || '|card|false|pgTAP Dobavljac|R-17|true|true|true',
  'D-98: dated yesterday, by card, outside the till, with its details, on her open shift');
select is(
  (select coalesce(method::text, 'null') || '|' || paid_from_till || '|'
          || (shift_id = '94949494-0000-0000-0000-00000000f001')
   from expenses where description = 'pgTAP Voda van kase'),
  'null|false|true', 'AS-17: "Van kase" is stored as no method');
select is(
  (select spent_on::text || '|' || method || '|' || paid_from_till || '|'
          || (shift_id = '94949494-0000-0000-0000-00000000f001')
   from expenses where description = 'pgTAP Voda iz kase'),
  (select today from dx)::text || '|cash|true|true',
  'BR-133: from the till means today, cash, on the open shift');

-- The manager -----------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "94949494-0000-0000-0000-00000000a002"}';
set local role authenticated;

select lives_ok(
  $$select record_expense('94949494-0000-0000-0000-000000060002', 'pgTAP Menadzer racun', 40,
      (select today from dx), 'card', false, null, null, null, null)$$,
  'D-98: a manager records on the same form');
select throws_ok(
  $$select record_expense('94949494-0000-0000-0000-000000060001', 'pgTAP Plata', 500,
      (select today from dx), 'card', false, null, null, null, null)$$,
  'E_CATEGORY_NOT_ALLOWED', 'D-80: and records no salary either');

reset role;
select is(
  (select shift_id from expenses where description = 'pgTAP Menadzer racun'),
  '94949494-0000-0000-0000-00000000f001'::uuid,
  'BR-092: the manager''s expense joins the open shift');

-- The owner -------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "94949494-0000-0000-0000-00000000a001"}';
set local role authenticated;

select lives_ok(
  $$select record_expense('94949494-0000-0000-0000-000000060001', 'pgTAP Plata Tamara', 500,
      (select today from dx) - 2, 'card', false, null, null, null,
      '94949494-0000-0000-0000-00000000d001')$$,
  'BR-133: the owner still records a payout');

reset role;
select is(
  (select coalesce(shift_id::text, 'null') || '|'
          || (trainer_id = '94949494-0000-0000-0000-00000000d001')
   from expenses where description = 'pgTAP Plata Tamara'),
  'null|true', 'BR-133: outside the till, the owner''s expense belongs to no shift');

-- No open shift ---------------------------------------------------------------------------
update shifts
set closed_at = now(), close_type = 'manual', closed_by = '94949494-0000-0000-0000-00000000c003'
where id = '94949494-0000-0000-0000-00000000f001';

set local request.jwt.claims = '{"sub": "94949494-0000-0000-0000-00000000a003"}';
set local role authenticated;
select throws_ok(
  $$select record_expense('94949494-0000-0000-0000-000000060002', 'pgTAP bez smjene', 5,
      (select today from dx), 'card', false, null, null, null, null)$$,
  'E_NO_OPEN_SHIFT', 'D-98: a receptionist needs an open shift, even outside the till');

reset role;
set local request.jwt.claims = '{"sub": "94949494-0000-0000-0000-00000000a002"}';
set local role authenticated;
select throws_ok(
  $$select record_expense('94949494-0000-0000-0000-000000060002', 'pgTAP bez smjene', 5,
      (select today from dx), 'card', false, null, null, null, null)$$,
  'E_NO_OPEN_SHIFT', 'D-98: so does a manager');

reset role;
set local request.jwt.claims = '{"sub": "94949494-0000-0000-0000-00000000a001"}';
set local role authenticated;
select lives_ok(
  $$select record_expense('94949494-0000-0000-0000-000000060002', 'pgTAP vlasnik bez smjene', 5,
      (select today from dx), 'card', false, null, null, null, null)$$,
  'BR-133: the owner does not, outside the till');
select throws_ok(
  $$select record_expense('94949494-0000-0000-0000-000000060002', 'pgTAP vlasnik iz kase', 5,
      (select today from dx), 'cash', true, null, null, null, null)$$,
  'E_NO_OPEN_SHIFT', 'BR-133: but does from the till');

select * from finish();
