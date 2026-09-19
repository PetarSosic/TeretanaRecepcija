-- M-10: closing a shift. E15 (expected cash and the difference), D-54 (a manager reads
-- only the four totals of the open shift in their own gym), BR-114 close rules, BR-134 in
-- the receptionist's own summary, and the report data kept away from staff.
select plan(30);

-- Fixtures --------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-00000000a001', null),
  ('aaaaaaaa-0000-0000-0000-00000000a002', null),
  ('aaaaaaaa-0000-0000-0000-00000000a003', null),
  ('aaaaaaaa-0000-0000-0000-00000000a004', null),
  ('aaaaaaaa-0000-0000-0000-00000000a005', null);
insert into gyms (id, name, timezone) values
  ('aaaaaaaa-0000-0000-0000-00000000b001', 'pgTAP Smjena', 'Europe/Podgorica'),
  ('aaaaaaaa-0000-0000-0000-00000000b002', 'pgTAP Druga teretana', 'Europe/Podgorica');
insert into gym_settings (gym_id) values
  ('aaaaaaaa-0000-0000-0000-00000000b001'), ('aaaaaaaa-0000-0000-0000-00000000b002');
insert into staff (id, gym_id, user_id, role, full_name, username) values
  ('aaaaaaaa-0000-0000-0000-00000000c001', 'aaaaaaaa-0000-0000-0000-00000000b001',
   'aaaaaaaa-0000-0000-0000-00000000a001', 'receptionist', 'pgTAP Ana', 'pgtap.sz.ana'),
  ('aaaaaaaa-0000-0000-0000-00000000c002', 'aaaaaaaa-0000-0000-0000-00000000b001',
   'aaaaaaaa-0000-0000-0000-00000000a002', 'owner', 'pgTAP Vlasnik', 'pgtap.sz.vlasnik'),
  ('aaaaaaaa-0000-0000-0000-00000000c003', 'aaaaaaaa-0000-0000-0000-00000000b001',
   'aaaaaaaa-0000-0000-0000-00000000a003', 'manager', 'pgTAP Menadzer', 'pgtap.sz.menadzer'),
  ('aaaaaaaa-0000-0000-0000-00000000c004', 'aaaaaaaa-0000-0000-0000-00000000b001',
   'aaaaaaaa-0000-0000-0000-00000000a004', 'receptionist', 'pgTAP Bojana', 'pgtap.sz.bojana'),
  ('aaaaaaaa-0000-0000-0000-00000000c005', 'aaaaaaaa-0000-0000-0000-00000000b002',
   'aaaaaaaa-0000-0000-0000-00000000a005', 'manager', 'pgTAP Tudji menadzer', 'pgtap.sz.tudji');

insert into shifts (id, gym_id, staff_id, started_at)
values ('aaaaaaaa-0000-0000-0000-00000000d001', 'aaaaaaaa-0000-0000-0000-00000000b001',
        'aaaaaaaa-0000-0000-0000-00000000c001', now() - interval '6 hours');

insert into plans (id, gym_id, name, kind, price) values
  ('aaaaaaaa-0000-0000-0000-00000000f006', 'aaaaaaaa-0000-0000-0000-00000000b001',
   'pgTAP Dnevna', 'day_pass', 10);
insert into expense_categories (id, gym_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000010001', 'aaaaaaaa-0000-0000-0000-00000000b001', 'pgTAP Potrošni');
insert into products (id, gym_id, name, current_purchase_price, sale_price) values
  ('aaaaaaaa-0000-0000-0000-00000000e001', 'aaaaaaaa-0000-0000-0000-00000000b001', 'pgTAP Voda', 0.30, 1.50);
insert into members (id, gym_id, member_number, first_name, last_name, phone, email,
                     date_of_birth, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000020001', 'aaaaaaaa-0000-0000-0000-00000000b001', 1,
   'Đurđa', 'Čučković', '+38267000151', 'e15@pgtap.invalid', '1990-01-01',
   'aaaaaaaa-0000-0000-0000-00000000c002');

-- E15: cash payments €237.00 (200 + 37), a card payment that is not cash, and a voided
-- cash payment that counts for nothing.
insert into payments (gym_id, kind, plan_id, member_id, quantity, amount, method, paid_on,
                      created_by, shift_id, voided_at, voided_by, void_reason) values
  ('aaaaaaaa-0000-0000-0000-00000000b001', 'day_pass', 'aaaaaaaa-0000-0000-0000-00000000f006', null,
   20, 200, 'cash', current_date, 'aaaaaaaa-0000-0000-0000-00000000c001',
   'aaaaaaaa-0000-0000-0000-00000000d001', null, null, null),
  ('aaaaaaaa-0000-0000-0000-00000000b001', 'card_replacement', null, 'aaaaaaaa-0000-0000-0000-000000020001',
   1, 37, 'cash', current_date, 'aaaaaaaa-0000-0000-0000-00000000c001',
   'aaaaaaaa-0000-0000-0000-00000000d001', null, null, null),
  ('aaaaaaaa-0000-0000-0000-00000000b001', 'day_pass', 'aaaaaaaa-0000-0000-0000-00000000f006', null,
   5, 50, 'card', current_date, 'aaaaaaaa-0000-0000-0000-00000000c001',
   'aaaaaaaa-0000-0000-0000-00000000d001', null, null, null),
  ('aaaaaaaa-0000-0000-0000-00000000b001', 'day_pass', 'aaaaaaaa-0000-0000-0000-00000000f006', null,
   10, 100, 'cash', current_date, 'aaaaaaaa-0000-0000-0000-00000000c001',
   'aaaaaaaa-0000-0000-0000-00000000d001', now(), 'aaaaaaaa-0000-0000-0000-00000000c001', 'Greška');
-- E15: cash bar sales €4.50 (3 × 1.50), and one card sale.
insert into stock_movements (gym_id, product_id, type, quantity, unit_cost, unit_price, method,
                             created_by, shift_id) values
  ('aaaaaaaa-0000-0000-0000-00000000b001', 'aaaaaaaa-0000-0000-0000-00000000e001', 'out', 3,
   0.30, 1.50, 'cash', 'aaaaaaaa-0000-0000-0000-00000000c001', 'aaaaaaaa-0000-0000-0000-00000000d001'),
  ('aaaaaaaa-0000-0000-0000-00000000b001', 'aaaaaaaa-0000-0000-0000-00000000e001', 'out', 1,
   0.30, 1.50, 'card', 'aaaaaaaa-0000-0000-0000-00000000c001', 'aaaaaaaa-0000-0000-0000-00000000d001');
-- E15: till expenses €13.50: €10.00 by Ana and €3.50 by the owner; a voided one is ignored.
insert into expenses (gym_id, spent_on, category_id, description, amount, method,
                      paid_from_till, created_by, shift_id, voided_at, voided_by, void_reason) values
  ('aaaaaaaa-0000-0000-0000-00000000b001', current_date, 'aaaaaaaa-0000-0000-0000-000000010001',
   'Sredstvo za čišćenje', 10, 'cash', true, 'aaaaaaaa-0000-0000-0000-00000000c001',
   'aaaaaaaa-0000-0000-0000-00000000d001', null, null, null),
  ('aaaaaaaa-0000-0000-0000-00000000b001', current_date, 'aaaaaaaa-0000-0000-0000-000000010001',
   'Papirni ubrusi', 3.50, 'cash', true, 'aaaaaaaa-0000-0000-0000-00000000c002',
   'aaaaaaaa-0000-0000-0000-00000000d001', null, null, null),
  ('aaaaaaaa-0000-0000-0000-00000000b001', current_date, 'aaaaaaaa-0000-0000-0000-000000010001',
   'Duplo', 5, 'cash', true, 'aaaaaaaa-0000-0000-0000-00000000c001',
   'aaaaaaaa-0000-0000-0000-00000000d001', now(), 'aaaaaaaa-0000-0000-0000-00000000c001', 'Duplo uneseno');
-- One member is still inside.
insert into visits (gym_id, member_id, visit_type, is_unpaid, checked_in_at, checked_in_by, shift_id)
values ('aaaaaaaa-0000-0000-0000-00000000b001', 'aaaaaaaa-0000-0000-0000-000000020001', 'gym', true,
        now() - interval '1 hour', 'aaaaaaaa-0000-0000-0000-00000000c001',
        'aaaaaaaa-0000-0000-0000-00000000d001');

-- The manager, while the shift is open (D-54) ---------------------------------------------
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-00000000a003"}';
set local role authenticated;
select is(
  (select string_agg(key, ',' order by key)
   from json_object_keys(shift_summary('aaaaaaaa-0000-0000-0000-00000000d001')) as key),
  'card_income,cash_income,expected_cash,till_expenses',
  'D-54: a manager receives the four totals and nothing else');
select is((shift_summary('aaaaaaaa-0000-0000-0000-00000000d001') ->> 'cash_income')::numeric,
  241.50, 'BR-115: cash income is cash payments plus cash sales (237.00 + 4.50)');
select is((shift_summary('aaaaaaaa-0000-0000-0000-00000000d001') ->> 'card_income')::numeric,
  51.50, 'BR-115: card income is card payments plus card sales (50.00 + 1.50)');
select is((shift_summary('aaaaaaaa-0000-0000-0000-00000000d001') ->> 'till_expenses')::numeric,
  13.50, 'BR-115 and E15: till expenses €13.50, the voided one excluded');
select is((shift_summary('aaaaaaaa-0000-0000-0000-00000000d001') ->> 'expected_cash')::numeric,
  228.00, 'E15: expected cash is €228.00');
select throws_ok(
  $$select close_shift('aaaaaaaa-0000-0000-0000-00000000d001', 100)$$,
  'P0001', 'E_FORBIDDEN', 'BR-114 and P-11: a manager cannot close a shift');

-- A manager of another gym ---------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-00000000a005"}';
set local role authenticated;
select throws_ok(
  $$select shift_summary('aaaaaaaa-0000-0000-0000-00000000d001')$$,
  'P0001', 'E_FORBIDDEN', 'D-54: another gym''s shift is refused');

-- Bojana: not her shift ------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-00000000a004"}';
set local role authenticated;
select throws_ok(
  $$select shift_summary('aaaaaaaa-0000-0000-0000-00000000d001')$$,
  'P0001', 'E_FORBIDDEN', 'P-14: a receptionist reads only her own shift');
select throws_ok(
  $$select close_shift('aaaaaaaa-0000-0000-0000-00000000d001', 100)$$,
  'P0001', 'E_FORBIDDEN', 'BR-114: nor closes someone else''s');

-- Ana: her own shift ------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-00000000a001"}';
set local role authenticated;
select is(
  json_array_length(shift_summary('aaaaaaaa-0000-0000-0000-00000000d001') -> 'till_expenses'),
  1, 'BR-134: her summary lists only her own till expense');
select is(
  (shift_summary('aaaaaaaa-0000-0000-0000-00000000d001') -> 'totals' ->> 'till_expenses')::numeric,
  13.50, 'BR-115: while the totals still count every till expense');
select is(
  json_array_length(shift_summary('aaaaaaaa-0000-0000-0000-00000000d001') -> 'payments'),
  3, 'BR-117: the three payments that were not voided');
select is(
  (shift_summary('aaaaaaaa-0000-0000-0000-00000000d001') -> 'counts' ->> 'day_passes')::int,
  25, 'S-14: day passes counted by quantity (20 + 5)');
select is(
  (shift_summary('aaaaaaaa-0000-0000-0000-00000000d001') -> 'counts' ->> 'voided')::int,
  2, 'S-14: the voided payment and her voided expense');
select is(
  (shift_summary('aaaaaaaa-0000-0000-0000-00000000d001') ->> 'open_visits')::int,
  1, 'S-14: one member is still inside');
select throws_ok(
  $$select close_shift('aaaaaaaa-0000-0000-0000-00000000d001', null)$$,
  'P0001', 'E_VALIDATION', 'BR-114: the receptionist must enter the counted cash');
select throws_ok(
  $$select close_shift('aaaaaaaa-0000-0000-0000-00000000d001', -1)$$,
  'P0001', 'E_VALIDATION', 'BR-114: counted cash is not negative');
select is(
  (close_shift('aaaaaaaa-0000-0000-0000-00000000d001', 225)).close_type,
  'manual'::shift_close_type, 'BR-114: closed as manual');
select is(
  (shift_summary('aaaaaaaa-0000-0000-0000-00000000d001') -> 'totals' ->> 'difference')::numeric,
  -3.00, 'E15: counted €225.00 against €228.00 is a difference of −€3.00 (Manjak)');
select throws_ok(
  $$select close_shift('aaaaaaaa-0000-0000-0000-00000000d001', 225)$$,
  'P0001', 'E_RECORD_NOT_EDITABLE', 'BR-114: a closed shift is not closed twice');
select throws_ok(
  $$select shift_report_json('aaaaaaaa-0000-0000-0000-00000000d001')$$,
  '42501', null, 'The report data is the pipeline''s, not callable by staff');
select throws_ok(
  $$select record_shift_report('aaaaaaaa-0000-0000-0000-00000000d001', 'x', 'sent')$$,
  '42501', null, 'Nor may staff mark a report as sent');

-- The manager after the close (D-54) -----------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-00000000a003"}';
set local role authenticated;
select throws_ok(
  $$select shift_summary('aaaaaaaa-0000-0000-0000-00000000d001')$$,
  'P0001', 'E_FORBIDDEN', 'D-54: a closed shift is refused to a manager');

-- The owner --------------------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-00000000a002"}';
set local role authenticated;
select is(
  json_array_length(shift_summary('aaaaaaaa-0000-0000-0000-00000000d001') -> 'till_expenses'),
  2, 'BR-117: the owner sees every till expense of the shift');
select is(
  json_array_length(shift_summary('aaaaaaaa-0000-0000-0000-00000000d001') -> 'voided'),
  2, 'BR-117: voided records are listed with their reasons');
select is(
  (shift_summary('aaaaaaaa-0000-0000-0000-00000000d001') -> 'shift' ->> 'staff_name'),
  'pgTAP Ana', 'BR-117: the report names the receptionist');

reset role;
insert into shifts (id, gym_id, staff_id)
values ('aaaaaaaa-0000-0000-0000-00000000d002', 'aaaaaaaa-0000-0000-0000-00000000b001',
        'aaaaaaaa-0000-0000-0000-00000000c004');
set local role authenticated;
select lives_ok(
  $$select close_shift('aaaaaaaa-0000-0000-0000-00000000d002', null)$$,
  'BR-114 and P-12: the owner closes any open shift, counted cash optional');
select is(
  (shift_summary('aaaaaaaa-0000-0000-0000-00000000d002') -> 'totals' ->> 'difference'),
  null, 'BR-115: no difference is shown when the cash was not counted');

-- The pipeline (service role) ----------------------------------------------------------------------
reset role;
set local role service_role;
select is(
  (record_shift_report('aaaaaaaa-0000-0000-0000-00000000d001', 'b001/d001.pdf', 'failed')).email_attempts,
  1::smallint, 'BR-118: a failed send is recorded and counts as an attempt');
select is(
  (shift_report_json('aaaaaaaa-0000-0000-0000-00000000d001') -> 'shift' ->> 'email_status'),
  'failed', 'BR-118: the shift stays closed with email_status failed');

reset role;
select * from finish();
