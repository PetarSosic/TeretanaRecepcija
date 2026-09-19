-- M-09: Magacin. E17, E18, D-55 (no free deliveries), voids that return stock and void
-- the stock-in expense, the negative-stock block, and BR-144 (no value or profit, no
-- history beyond today, for anyone but the owner).
select plan(40);

-- Fixtures --------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('99999999-1111-0000-0000-00000000a001', null),
  ('99999999-1111-0000-0000-00000000a002', null),
  ('99999999-1111-0000-0000-00000000a003', null);
insert into gyms (id, name, timezone)
values ('99999999-1111-0000-0000-00000000b001', 'pgTAP Magacin', 'Europe/Podgorica');
insert into gym_settings (gym_id) values ('99999999-1111-0000-0000-00000000b001');
insert into staff (id, gym_id, user_id, role, full_name, username) values
  ('99999999-1111-0000-0000-00000000c001', '99999999-1111-0000-0000-00000000b001',
   '99999999-1111-0000-0000-00000000a001', 'receptionist', 'pgTAP Ana', 'pgtap.mag.ana'),
  ('99999999-1111-0000-0000-00000000c002', '99999999-1111-0000-0000-00000000b001',
   '99999999-1111-0000-0000-00000000a002', 'owner', 'pgTAP Vlasnik', 'pgtap.mag.vlasnik'),
  ('99999999-1111-0000-0000-00000000c003', '99999999-1111-0000-0000-00000000b001',
   '99999999-1111-0000-0000-00000000a003', 'manager', 'pgTAP Menadzer', 'pgtap.mag.menadzer');

-- BR-130: the system category the stock-in expense uses.
insert into expense_categories (gym_id, name, is_system)
values ('99999999-1111-0000-0000-00000000b001', 'pgTAP Roba za prodaju', true);

-- BR-140: Voda (0.30 / 1.50), and a second product that carries yesterday's history.
insert into products (id, gym_id, name, current_purchase_price, sale_price) values
  ('99999999-1111-0000-0000-00000000e001', '99999999-1111-0000-0000-00000000b001', 'pgTAP Voda', 0.30, 1.50),
  ('99999999-1111-0000-0000-00000000e002', '99999999-1111-0000-0000-00000000b001', 'pgTAP Pločica', 1.00, 2.50);

-- Yesterday: a closed shift with a stock-in and a sale of Pločica.
insert into shifts (id, gym_id, staff_id, started_at, closed_at, close_type, closed_by)
values ('99999999-1111-0000-0000-00000000d000', '99999999-1111-0000-0000-00000000b001',
        '99999999-1111-0000-0000-00000000c001', now() - interval '1 day',
        now() - interval '20 hours', 'manual', '99999999-1111-0000-0000-00000000c001');
insert into stock_movements (id, gym_id, product_id, type, quantity, unit_cost, unit_price,
                             method, created_by, shift_id, created_at) values
  ('99999999-1111-0000-0000-000000040001', '99999999-1111-0000-0000-00000000b001',
   '99999999-1111-0000-0000-00000000e002', 'in', 10, 1.00, null, null,
   '99999999-1111-0000-0000-00000000c001', '99999999-1111-0000-0000-00000000d000',
   now() - interval '23 hours'),
  ('99999999-1111-0000-0000-000000040002', '99999999-1111-0000-0000-00000000b001',
   '99999999-1111-0000-0000-00000000e002', 'out', 2, 1.00, 2.50, 'cash',
   '99999999-1111-0000-0000-00000000c001', '99999999-1111-0000-0000-00000000d000',
   now() - interval '22 hours');

-- Helper: the detail an RPC raises, to read the stock level E17 names.
create function pg_temp.error_detail(p_sql text) returns text language plpgsql as $$
declare v_detail text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return sqlerrm || '|' || coalesce(v_detail, '');
end $$;

-- Ana, before any shift is open --------------------------------------------------------
set local request.jwt.claims = '{"sub": "99999999-1111-0000-0000-00000000a001"}';
set local role authenticated;

select throws_ok(
  $$select stock_in('99999999-1111-0000-0000-00000000e001', 5, 0.30, true)$$,
  'P0001', 'E_NO_OPEN_SHIFT', 'BR-141 and BR-092: "Iz kase" needs an open shift');

-- The owner receives 3 bottles outside the till (no shift needed, AS-17).
reset role;
set local request.jwt.claims = '{"sub": "99999999-1111-0000-0000-00000000a002"}';
set local role authenticated;
select lives_ok(
  $$select stock_in('99999999-1111-0000-0000-00000000e001', 3, 0.30, false)$$,
  'BR-141: a stock-in "Van kase" needs no shift');
select is(
  (select coalesce(method::text, 'null') || '|' || paid_from_till::text || '|' || amount
   from expenses where description = 'Nabavka: pgTAP Voda × 3'),
  'null|false|0.90', 'AS-17: "Van kase" is stored with method null, not from the till');

reset role;
insert into shifts (id, gym_id, staff_id)
values ('99999999-1111-0000-0000-00000000d001', '99999999-1111-0000-0000-00000000b001',
        '99999999-1111-0000-0000-00000000c001');
set local request.jwt.claims = '{"sub": "99999999-1111-0000-0000-00000000a001"}';
set local role authenticated;

-- E17 ------------------------------------------------------------------------------------
select is(
  pg_temp.error_detail($$select stock_sale('99999999-1111-0000-0000-00000000e001', 5, 'cash')$$),
  'E_STOCK_INSUFFICIENT|3',
  'E17: selling 5 with 3 in stock is blocked, and the error names the stock (3)');
select is((select stock from storage_products() where name = 'pgTAP Voda'), 3,
  'E17: nothing was sold');

-- D-55: no free deliveries ----------------------------------------------------------------
select throws_ok(
  $$select stock_in('99999999-1111-0000-0000-00000000e001', 5, 0, false)$$,
  'P0001', 'E_STOCK_COST_INVALID', 'D-55: a purchase price of €0 is refused');
select throws_ok(
  $$select stock_in('99999999-1111-0000-0000-00000000e001', 5, -1, true)$$,
  'P0001', 'E_STOCK_COST_INVALID', 'D-55: a negative purchase price is refused');
reset role;
select is(
  (select count(*)::int from stock_movements where product_id = '99999999-1111-0000-0000-00000000e001'),
  1, 'D-55: the refused stock-ins created no movement');
select is(
  (select count(*)::int from expenses where gym_id = '99999999-1111-0000-0000-00000000b001'),
  1, 'D-55: and no expense');
set local role authenticated;
select lives_ok(
  $$select stock_in('99999999-1111-0000-0000-00000000e001', 1, 0.01, false)$$,
  'D-55: €0.01 is accepted');

-- E18 --------------------------------------------------------------------------------------
select lives_ok(
  $$select stock_in('99999999-1111-0000-0000-00000000e001', 24, 0.35, true)$$,
  'E18: 24 × €0.35 "Iz kase"');
select is((select stock from storage_products() where name = 'pgTAP Voda'), 28,
  'E18: the stock rises by 24 (3 + 1 + 24)');
select is((select current_purchase_price from storage_products() where name = 'pgTAP Voda'),
  0.35::numeric, 'E18 and AS-6: the entered price becomes the purchase price');
select is(
  (select method::text || '|' || paid_from_till::text || '|' || amount || '|'
          || (shift_id = '99999999-1111-0000-0000-00000000d001')::text
   from expenses where description = 'Nabavka: pgTAP Voda × 24'),
  'cash|true|8.40|true', 'E18: an €8.40 cash expense from the till, on the open shift');
select is(
  (select sum(amount) from expenses
   where shift_id = '99999999-1111-0000-0000-00000000d001' and paid_from_till and voided_at is null),
  8.40::numeric, 'E18 and BR-115: the till expenses of the shift are €8.40 (expected cash −8.40)');

-- BR-142: a sale ------------------------------------------------------------------------------
select is(
  (select unit_price || '|' || unit_cost || '|' || method::text
   from stock_sale('99999999-1111-0000-0000-00000000e001', 2, 'cash')),
  '1.50|0.35|cash', 'BR-142: the sale price, and today''s purchase price as its cost');
select is((select stock from storage_products() where name = 'pgTAP Voda'), 26,
  'BR-143: the stock drops by 2');
select throws_ok(
  $$select stock_sale('99999999-1111-0000-0000-00000000e001', 1, null)$$,
  'P0001', 'E_VALIDATION', 'BR-142: a method is required');

-- BR-094 and BR-095 on sales ----------------------------------------------------------------------
select is(
  (correct_sale((select id from stock_movements where type = 'out'
                   and shift_id = '99999999-1111-0000-0000-00000000d001'), 'card')).method,
  'card'::payment_method, 'BR-094: the method of an open-shift sale is corrected');
select throws_ok(
  $$select correct_sale('99999999-1111-0000-0000-000000040002', 'card')$$,
  'P0001', 'E_RECORD_NOT_EDITABLE', 'AS-14: not a sale from a closed shift');
select throws_ok(
  $$select void_stock_movement('99999999-1111-0000-0000-000000040002', 'kasno')$$,
  'P0001', 'E_RECORD_NOT_EDITABLE', 'AS-14: nor voided');
select lives_ok(
  $$select void_stock_movement((select id from stock_movements where type = 'out'
      and shift_id = '99999999-1111-0000-0000-00000000d001'), 'Pogrešan proizvod')$$,
  'BR-095 and AS-15: an open-shift sale is voided');
select is((select stock from storage_products() where name = 'pgTAP Voda'), 28,
  'BR-095: the voided sale returns its quantity to stock');

-- Stock-in voids are the owner's (P-43) -------------------------------------------------------------
select throws_ok(
  $$select void_stock_movement((select stock_movement_id from expenses
      where description = 'Nabavka: pgTAP Voda × 24'), 'Pogrešno')$$,
  'P0001', 'E_FORBIDDEN', 'P-43: a receptionist cannot void a stock-in');
select throws_ok(
  $$select void_expense((select id from expenses where description = 'Nabavka: pgTAP Voda × 24'),
      'Samo trošak')$$,
  'P0001', 'E_RECORD_NOT_EDITABLE', 'BR-095: the stock-in expense is never voided on its own');
select lives_ok(
  $$select stock_sale('99999999-1111-0000-0000-00000000e001', 27, 'cash')$$,
  'Set-up: 27 of the 28 bottles are sold');

-- BR-144: what Ana sees ------------------------------------------------------------------------------
select is(
  (select count(*)::int from stock_movements
   where product_id = '99999999-1111-0000-0000-00000000e002'),
  0, 'BR-144: a receptionist sees no movements from before today');
select is(
  (select string_agg(key, ',' order by key)
   from storage_products() s, jsonb_object_keys(to_jsonb(s)) as key
   where s.name = 'pgTAP Voda'),
  'current_purchase_price,id,name,sale_price,stock',
  'BR-144: the storage list carries stock and prices, never stock value or profit');
select is((select stock from storage_products() where name = 'pgTAP Pločica'), 8,
  'BR-143: but the stock level still counts every day''s movements');
select throws_ok(
  $$insert into stock_movements (gym_id, product_id, type, quantity, unit_cost, created_by)
    values ('99999999-1111-0000-0000-00000000b001', '99999999-1111-0000-0000-00000000e001',
            'in', 100, 0.30, '99999999-1111-0000-0000-00000000c001')$$,
  '42501', null, 'Doc 04 §2: no direct writes to stock_movements');

-- The manager: the same limits ------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub": "99999999-1111-0000-0000-00000000a003"}';
set local role authenticated;
select is(
  (select count(*)::int from stock_movements
   where product_id = '99999999-1111-0000-0000-00000000e002'),
  0, 'BR-144: nor does a manager');
select throws_ok(
  $$select void_stock_movement((select stock_movement_id from expenses
      where description = 'Nabavka: pgTAP Voda × 24'), 'Pogrešno')$$,
  'P0001', 'E_FORBIDDEN', 'P-43: a manager cannot void a stock-in either');

-- The owner --------------------------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub": "99999999-1111-0000-0000-00000000a002"}';
set local role authenticated;
select is(
  (select count(*)::int from stock_movements
   where product_id = '99999999-1111-0000-0000-00000000e002'),
  2, 'BR-144: the owner sees the history');
select throws_ok(
  $$select void_stock_movement((select stock_movement_id from expenses
      where description = 'Nabavka: pgTAP Voda × 24'), 'Pogrešno')$$,
  'P0001', 'E_STOCK_NEGATIVE',
  'BR-095: voiding the stock-in of goods already sold would make stock negative');
select lives_ok(
  $$select void_stock_movement((select id from stock_movements where type = 'out'
      and quantity = 27), 'Test prodaje')$$,
  'Set-up: the owner voids the big sale, so the bottles are back');
select lives_ok(
  $$select void_stock_movement((select stock_movement_id from expenses
      where description = 'Nabavka: pgTAP Voda × 24'), 'Pogrešna isporuka')$$,
  'BR-095: now the owner voids the stock-in');
select ok(
  (select voided_at is not null and void_reason = 'Pogrešna isporuka' from expenses
   where description = 'Nabavka: pgTAP Voda × 24'),
  'BR-095: its automatic expense is voided with it');
select is((select stock from storage_products() where name = 'pgTAP Voda'), 4,
  'BR-143: and the 24 bottles leave the stock');
select is(
  (select sum(amount) from expenses
   where shift_id = '99999999-1111-0000-0000-00000000d001' and paid_from_till and voided_at is null),
  null, 'BR-115: the voided expense no longer lowers expected cash');
select is(
  (select count(*)::int from audit_log
   where gym_id = '99999999-1111-0000-0000-00000000b001' and action = 'void'),
  4, 'BR-096: every void is audited (two sales, a stock-in and its expense)');

reset role;
select * from finish();
