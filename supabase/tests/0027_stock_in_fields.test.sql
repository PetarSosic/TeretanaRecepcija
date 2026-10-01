-- D-95 (BR-141, BR-133): S-13 [Nova roba] carries the owner's expense fields except the
-- category: description, payment date, method, "Iz kase", supplier, invoice and VAT.
-- The date dates the expense only; an earlier one is the owner's and the admin's.
select plan(23);

-- Fixtures --------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('27272727-0000-0000-0000-00000000a001', null),
  ('27272727-0000-0000-0000-00000000a002', null),
  ('27272727-0000-0000-0000-00000000a003', null);
insert into gyms (id, name, timezone)
values ('27272727-0000-0000-0000-00000000b001', 'pgTAP Nabavka', 'Europe/Podgorica');
insert into gym_settings (gym_id) values ('27272727-0000-0000-0000-00000000b001');
insert into staff (id, gym_id, user_id, role, full_name, username) values
  ('27272727-0000-0000-0000-00000000c001', '27272727-0000-0000-0000-00000000b001',
   '27272727-0000-0000-0000-00000000a001', 'receptionist', 'pgTAP Ana', 'pgtap.nab.ana'),
  ('27272727-0000-0000-0000-00000000c002', '27272727-0000-0000-0000-00000000b001',
   '27272727-0000-0000-0000-00000000a002', 'owner', 'pgTAP Vlasnik', 'pgtap.nab.vlasnik'),
  ('27272727-0000-0000-0000-00000000c003', '27272727-0000-0000-0000-00000000b001',
   '27272727-0000-0000-0000-00000000a003', 'manager', 'pgTAP Menadzer', 'pgtap.nab.menadzer');
insert into expense_categories (gym_id, name, is_system)
values ('27272727-0000-0000-0000-00000000b001', 'pgTAP Roba za prodaju', true);
insert into products (id, gym_id, name, current_purchase_price, sale_price) values
  ('27272727-0000-0000-0000-00000000e001', '27272727-0000-0000-0000-00000000b001', 'pgTAP Voda', 0.30, 1.50);
insert into shifts (id, gym_id, staff_id)
values ('27272727-0000-0000-0000-00000000d001', '27272727-0000-0000-0000-00000000b001',
        '27272727-0000-0000-0000-00000000c001');

-- The function ---------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_proc
   where proname = 'stock_in' and pronamespace = 'public'::regnamespace),
  1, 'D-95: one stock_in, so PostgREST never has two to choose from');
select ok(
  has_function_privilege('authenticated',
    'stock_in(uuid, integer, numeric, boolean, payment_method, date, text, text, text, boolean)', 'execute')
  and not has_function_privilege('anon',
    'stock_in(uuid, integer, numeric, boolean, payment_method, date, text, text, text, boolean)', 'execute'),
  'P-41: signed-in staff receive goods, anonymous callers cannot');

-- The owner: an earlier payment day, a card, the invoice fields ----------------------------
set local request.jwt.claims = '{"sub": "27272727-0000-0000-0000-00000000a002"}';
set local role authenticated;
select lives_ok(
  format($$select stock_in(p_product => '27272727-0000-0000-0000-00000000e001', p_qty => 24,
      p_unit_cost => 0.35, p_from_till => false, p_method => 'card', p_spent_on => %L::date,
      p_description => 'Faktura 12/2026 — voda', p_supplier => 'pgTAP Veletrgovina',
      p_invoice => 'F-12/2026', p_vat => true)$$,
    gym_today('27272727-0000-0000-0000-00000000b001') - 3),
  'D-95: the owner records goods paid three days ago by card');

reset role;
select is(
  (select e.spent_on from expenses e where e.gym_id = '27272727-0000-0000-0000-00000000b001'
     and e.invoice_number = 'F-12/2026'),
  gym_today('27272727-0000-0000-0000-00000000b001') - 3,
  'D-95: the expense is dated on the day it was paid');
select is(
  (select concat_ws('|', e.method, e.paid_from_till, e.supplier, e.vat_included,
                    e.description, e.amount, e.shift_id is null)
   from expenses e where e.gym_id = '27272727-0000-0000-0000-00000000b001'
     and e.invoice_number = 'F-12/2026'),
  'card|f|pgTAP Veletrgovina|t|Faktura 12/2026 — voda|8.40|t',
  'D-95: method, supplier, VAT and description are kept; 24 × 0.35; no shift for an earlier day');
select is(
  (select concat_ws('|', m.quantity, m.unit_cost, m.shift_id)
   from stock_movements m join expenses e on e.stock_movement_id = m.id
   where e.invoice_number = 'F-12/2026'),
  '24|0.35|27272727-0000-0000-0000-00000000d001',
  'D-95: the stock rises now, on the open shift, whatever the payment day');
select is(
  (select current_purchase_price from products where id = '27272727-0000-0000-0000-00000000e001'),
  0.35, 'AS-6: the price per unit becomes the purchase price');

-- Without a description it is written as before ---------------------------------------------
set local role authenticated;
select lives_ok(
  $$select stock_in(p_product => '27272727-0000-0000-0000-00000000e001', p_qty => 6,
      p_unit_cost => 0.30, p_from_till => false, p_method => 'cash', p_description => '  ')$$,
  'D-95: an empty description is allowed');
reset role;
select is(
  (select concat_ws('|', e.description, e.spent_on = gym_today(e.gym_id), e.method,
                    e.shift_id = '27272727-0000-0000-0000-00000000d001')
   from expenses e join stock_movements m on m.id = e.stock_movement_id
   where e.gym_id = '27272727-0000-0000-0000-00000000b001' and m.quantity = 6),
  'Nabavka: pgTAP Voda × 6|t|cash|t',
  'BR-141: the default description, today, cash outside the till, on the open shift');

-- "Iz kase" overrides the date and the method (BR-133) ------------------------------------
set local role authenticated;
select lives_ok(
  format($$select stock_in(p_product => '27272727-0000-0000-0000-00000000e001', p_qty => 7,
      p_unit_cost => 0.30, p_from_till => true, p_method => 'card', p_spent_on => %L::date)$$,
    gym_today('27272727-0000-0000-0000-00000000b001') - 2),
  'BR-133: from the till with another day and method');
reset role;
select is(
  (select concat_ws('|', e.spent_on = gym_today(e.gym_id), e.method, e.paid_from_till,
                    e.shift_id = '27272727-0000-0000-0000-00000000d001')
   from expenses e join stock_movements m on m.id = e.stock_movement_id
   where e.gym_id = '27272727-0000-0000-0000-00000000b001' and m.quantity = 7),
  't|cash|t|t', 'BR-133: from the till is today, cash, on the open shift');

-- Refusals --------------------------------------------------------------------------------
set local role authenticated;
select throws_ok(
  format($$select stock_in(p_product => '27272727-0000-0000-0000-00000000e001', p_qty => 1,
      p_unit_cost => 0.30, p_from_till => false, p_spent_on => %L::date)$$,
    gym_today('27272727-0000-0000-0000-00000000b001') + 1),
  'P0001', 'E_VALIDATION', 'D-95: a payment day after today is refused');
select throws_ok(
  $$select stock_in(p_product => '27272727-0000-0000-0000-00000000e001', p_qty => 1,
      p_unit_cost => 0.30, p_from_till => false, p_description => 'X')$$,
  'P0001', 'E_VALIDATION', 'BR-133: a description of one character is refused');
select throws_ok(
  format($$select stock_in(p_product => '27272727-0000-0000-0000-00000000e001', p_qty => 1,
      p_unit_cost => 0.30, p_from_till => false, p_supplier => %L)$$, repeat('a', 101)),
  'P0001', 'E_VALIDATION', 'BR-133: a supplier over 100 characters is refused');
select throws_ok(
  format($$select stock_in(p_product => '27272727-0000-0000-0000-00000000e001', p_qty => 1,
      p_unit_cost => 0.30, p_from_till => false, p_invoice => %L)$$, repeat('1', 51)),
  'P0001', 'E_VALIDATION', 'BR-133: an invoice number over 50 characters is refused');

reset role;
set local request.jwt.claims = '{"sub": "27272727-0000-0000-0000-00000000a001"}';
set local role authenticated;
select throws_ok(
  format($$select stock_in(p_product => '27272727-0000-0000-0000-00000000e001', p_qty => 1,
      p_unit_cost => 0.30, p_from_till => false, p_spent_on => %L::date)$$,
    gym_today('27272727-0000-0000-0000-00000000b001') - 1),
  'P0001', 'E_FORBIDDEN', 'D-95: a receptionist cannot give an earlier payment day');
select lives_ok(
  format($$select stock_in(p_product => '27272727-0000-0000-0000-00000000e001', p_qty => 9,
      p_unit_cost => 0.30, p_from_till => false, p_method => 'card', p_spent_on => %L::date,
      p_supplier => 'pgTAP Dostava', p_vat => false)$$,
    gym_today('27272727-0000-0000-0000-00000000b001')),
  'D-95: a receptionist records today''s goods with the same fields');

reset role;
set local request.jwt.claims = '{"sub": "27272727-0000-0000-0000-00000000a003"}';
set local role authenticated;
select throws_ok(
  format($$select stock_in(p_product => '27272727-0000-0000-0000-00000000e001', p_qty => 1,
      p_unit_cost => 0.30, p_from_till => false, p_spent_on => %L::date)$$,
    gym_today('27272727-0000-0000-0000-00000000b001') - 1),
  'P0001', 'E_FORBIDDEN', 'D-95: nor can a manager');

reset role;
select is(
  (select concat_ws('|', e.method, e.supplier, e.vat_included, e.created_by)
   from expenses e join stock_movements m on m.id = e.stock_movement_id
   where e.gym_id = '27272727-0000-0000-0000-00000000b001' and m.quantity = 9),
  'card|pgTAP Dostava|f|27272727-0000-0000-0000-00000000c001',
  'D-95: the receptionist''s method, supplier and VAT are kept');
select is(
  (select count(*)::int from stock_movements where gym_id = '27272727-0000-0000-0000-00000000b001'),
  4, 'D-95: the refused calls wrote no stock');
select is(
  (select count(*)::int from expenses where gym_id = '27272727-0000-0000-0000-00000000b001'),
  4, 'D-95: and no expense');

-- The four arguments of before keep their meaning ------------------------------------------
set local request.jwt.claims = '{"sub": "27272727-0000-0000-0000-00000000a002"}';
set local role authenticated;
select lives_ok(
  $$select stock_in('27272727-0000-0000-0000-00000000e001', 2, 0.30, false)$$,
  'D-95: the call with four arguments still works');
reset role;
select is(
  (select concat_ws('|', coalesce(e.method::text, 'none'), e.description,
                    e.spent_on = gym_today(e.gym_id), e.supplier is null)
   from expenses e join stock_movements m on m.id = e.stock_movement_id
   where e.gym_id = '27272727-0000-0000-0000-00000000b001' and m.quantity = 2),
  'none|Nabavka: pgTAP Voda × 2|t|t',
  'AS-17: without a method it is still Van kase, today, with the default description');

select * from finish();
