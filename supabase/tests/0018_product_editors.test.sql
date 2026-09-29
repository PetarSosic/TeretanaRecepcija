-- D-76: every role but the receptionist adds and edits products on S-13 Magacin
-- (P-42, BR-140). The receptionist still sees, sells and receives them (P-40, P-41).
select plan(8);

-- Fixtures --------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('76767676-0000-0000-0000-00000000a001', null),
  ('76767676-0000-0000-0000-00000000a002', null),
  ('76767676-0000-0000-0000-00000000a003', null),
  ('76767676-0000-0000-0000-00000000a004', null),
  ('76767676-0000-0000-0000-00000000a005', null);
insert into gyms (id, name, timezone) values
  ('76767676-0000-0000-0000-00000000b001', 'pgTAP Magacin', 'Europe/Podgorica'),
  ('76767676-0000-0000-0000-00000000b002', 'pgTAP Druga', 'Europe/Podgorica');
insert into gym_settings (gym_id) values
  ('76767676-0000-0000-0000-00000000b001'),
  ('76767676-0000-0000-0000-00000000b002');
insert into staff (id, gym_id, user_id, role, full_name, email, username) values
  ('76767676-0000-0000-0000-00000000c001', '76767676-0000-0000-0000-00000000b001',
   '76767676-0000-0000-0000-00000000a001', 'admin', 'pgTAP Administrator',
   'pgtap.pe.admin@example.com', null),
  ('76767676-0000-0000-0000-00000000c002', '76767676-0000-0000-0000-00000000b001',
   '76767676-0000-0000-0000-00000000a002', 'owner', 'pgTAP Vlasnik', null, 'pgtap.pe.vlasnik'),
  ('76767676-0000-0000-0000-00000000c003', '76767676-0000-0000-0000-00000000b001',
   '76767676-0000-0000-0000-00000000a003', 'manager', 'pgTAP Menadžer', null, 'pgtap.pe.menadzer'),
  ('76767676-0000-0000-0000-00000000c004', '76767676-0000-0000-0000-00000000b001',
   '76767676-0000-0000-0000-00000000a004', 'receptionist', 'pgTAP Recepcija', null, 'pgtap.pe.recepcija'),
  ('76767676-0000-0000-0000-00000000c005', '76767676-0000-0000-0000-00000000b002',
   '76767676-0000-0000-0000-00000000a005', 'manager', 'pgTAP Drugi Menadžer', null, 'pgtap.pe.drugi');
insert into products (id, gym_id, name, current_purchase_price, sale_price) values
  ('76767676-0000-0000-0000-00000000e001', '76767676-0000-0000-0000-00000000b001',
   'pgTAP Voda', 0.35, 1.50);

set local role authenticated;

-- The manager adds and edits -----------------------------------------------------------
set local request.jwt.claims = '{"sub": "76767676-0000-0000-0000-00000000a003"}';
select lives_ok(
  $$select upsert_product(null, 'pgTAP Izotonik', 0.60::numeric, 2.00::numeric, true)$$,
  'P-42 (D-76): the manager adds a product');
select lives_ok(
  $$select upsert_product('76767676-0000-0000-0000-00000000e001', 'pgTAP Voda 0,5',
                          0.40::numeric, 1.70::numeric, false)$$,
  'P-42 (D-76): the manager renames it, changes both prices and deactivates it');
select is(
  (select name || '|' || current_purchase_price || '|' || sale_price || '|' || is_active
   from products where id = '76767676-0000-0000-0000-00000000e001'),
  'pgTAP Voda 0,5|0.40|1.70|false', 'P-42: the change is saved');
select ok(
  (select count(*) = 0 from storage_products() where id = '76767676-0000-0000-0000-00000000e001'),
  'S-13: a deactivated product leaves the list of products to sell');
select lives_ok(
  $$select upsert_product('76767676-0000-0000-0000-00000000e001', 'pgTAP Voda 0,5',
                          0.40::numeric, 1.70::numeric, true)$$,
  'S-13 (D-76): and is activated again from Magacin');

-- The receptionist does not, and nobody edits another gym's product --------------------
set local request.jwt.claims = '{"sub": "76767676-0000-0000-0000-00000000a004"}';
select throws_ok(
  $$select upsert_product(null, 'pgTAP Čokoladica', 0.50::numeric, 1.00::numeric, true)$$,
  'P0001', 'E_FORBIDDEN', 'P-42: a receptionist cannot add a product');
select throws_ok(
  $$select upsert_product('76767676-0000-0000-0000-00000000e001', 'pgTAP Voda',
                          0.35::numeric, 1.00::numeric, true)$$,
  'P0001', 'E_FORBIDDEN', 'P-42: nor change its price');

set local request.jwt.claims = '{"sub": "76767676-0000-0000-0000-00000000a005"}';
select throws_ok(
  $$select upsert_product('76767676-0000-0000-0000-00000000e001', 'pgTAP Tuđa',
                          0.35::numeric, 1.00::numeric, true)$$,
  'P0001', 'E_FORBIDDEN', 'BR-140: a manager of another gym cannot touch it');

select * from finish();
