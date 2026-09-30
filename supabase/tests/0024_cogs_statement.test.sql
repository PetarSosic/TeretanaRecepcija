-- D-92: buying goods is not the month's cost. E25 is the gym owner's own September
-- example, E23 and E24 run through the desk RPCs today; BR-151 to BR-153 (cost of goods
-- sold, operating expenses, profit), BR-158 (cash flow), BR-159 (stock value at the end
-- of a period, at the price of that day), and BR-132, BR-133, BR-144 and BR-157 around
-- them.
select plan(49);

-- Fixtures --------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('92929292-0000-0000-0000-00000000a001', null),
  ('92929292-0000-0000-0000-00000000a002', null),
  ('92929292-0000-0000-0000-00000000a003', null);
insert into gyms (id, name, timezone)
values ('92929292-0000-0000-0000-00000000b001', 'pgTAP Bilans', 'Europe/Podgorica');
insert into gym_settings (gym_id) values ('92929292-0000-0000-0000-00000000b001');
insert into staff (id, gym_id, user_id, role, full_name, username) values
  ('92929292-0000-0000-0000-00000000c001', '92929292-0000-0000-0000-00000000b001',
   '92929292-0000-0000-0000-00000000a001', 'owner', 'pgTAP Vlasnik', 'pgtap.bil.vlasnik'),
  ('92929292-0000-0000-0000-00000000c002', '92929292-0000-0000-0000-00000000b001',
   '92929292-0000-0000-0000-00000000a002', 'manager', 'pgTAP Menadzer', 'pgtap.bil.menadzer'),
  ('92929292-0000-0000-0000-00000000c003', '92929292-0000-0000-0000-00000000b001',
   '92929292-0000-0000-0000-00000000a003', 'receptionist', 'pgTAP Ana', 'pgtap.bil.ana');

-- The fixture month is last month; its stock partly came in the month before it.
create temporary table bil as
  select t.today,
         date_trunc('month', t.today - interval '1 month')::date as first,
         (date_trunc('month', t.today) - interval '1 day')::date as last,
         date_trunc('month', t.today - interval '2 months')::date as before
  from (select gym_today('92929292-0000-0000-0000-00000000b001') as today) t;
-- The assertions below run as `authenticated`, which owns nothing of its own.
grant select on bil to authenticated;

insert into trainers (id, gym_id, full_name) values
  ('92929292-0000-0000-0000-00000000d001', '92929292-0000-0000-0000-00000000b001', 'pgTAP Tamara');
insert into plans (id, gym_id, name, kind, duration_value, duration_unit, price,
                   covers_gym, covers_group, covers_personal, requires_trainer) values
  ('92929292-0000-0000-0000-00000000e001', '92929292-0000-0000-0000-00000000b001',
   'pgTAP Mjesečna', 'gym', 1, 'month', 50, true, false, false, false),
  ('92929292-0000-0000-0000-00000000e002', '92929292-0000-0000-0000-00000000b001',
   'pgTAP Grupni', 'group', 1, 'month', 69, false, true, false, true),
  ('92929292-0000-0000-0000-00000000e003', '92929292-0000-0000-0000-00000000b001',
   'pgTAP Dnevna', 'day_pass', null, null, 10, false, false, false, false);
insert into members (id, gym_id, member_number, first_name, last_name, phone, email,
                     date_of_birth, created_by) values
  ('92929292-0000-0000-0000-000000010001', '92929292-0000-0000-0000-00000000b001', 1,
   'Đurđa', 'Bilans', '+38267000921', 'b1@pgtap.invalid', '1990-01-01',
   '92929292-0000-0000-0000-00000000c001'),
  ('92929292-0000-0000-0000-000000010002', '92929292-0000-0000-0000-00000000b001', 2,
   'Željko', 'Bilans', '+38267000922', 'b2@pgtap.invalid', '1990-01-01',
   '92929292-0000-0000-0000-00000000c001');

insert into expense_categories (id, gym_id, name, is_salary, is_system) values
  ('92929292-0000-0000-0000-000000060001', '92929292-0000-0000-0000-00000000b001', 'pgTAP Plate', true, false),
  ('92929292-0000-0000-0000-000000060002', '92929292-0000-0000-0000-00000000b001', 'pgTAP Zakup', false, false),
  ('92929292-0000-0000-0000-000000060003', '92929292-0000-0000-0000-00000000b001', 'pgTAP Struja', false, false),
  ('92929292-0000-0000-0000-000000060004', '92929292-0000-0000-0000-00000000b001', 'pgTAP Marketing', false, false),
  ('92929292-0000-0000-0000-000000060005', '92929292-0000-0000-0000-00000000b001', 'pgTAP Ostalo', false, false),
  ('92929292-0000-0000-0000-000000060006', '92929292-0000-0000-0000-00000000b001', 'pgTAP Roba za prodaju', false, true);

insert into products (id, gym_id, name, current_purchase_price, sale_price) values
  ('92929292-0000-0000-0000-000000070001', '92929292-0000-0000-0000-00000000b001', 'pgTAP Pločica', 10, 18),
  ('92929292-0000-0000-0000-000000070002', '92929292-0000-0000-0000-00000000b001', 'pgTAP Izotonik', 2, 4),
  ('92929292-0000-0000-0000-000000070003', '92929292-0000-0000-0000-00000000b001', 'pgTAP Whey', 28, 41),
  ('92929292-0000-0000-0000-000000070004', '92929292-0000-0000-0000-00000000b001', 'pgTAP Kreatin', 10, 15),
  ('92929292-0000-0000-0000-000000070005', '92929292-0000-0000-0000-00000000b001', 'pgTAP Pogrešna roba', 3, 5);

-- The fixture month's closed shift, which its payments and sales belong to.
insert into shifts (id, gym_id, staff_id, started_at, closed_at, close_type) values
  ('92929292-0000-0000-0000-00000000f001', '92929292-0000-0000-0000-00000000b001',
   '92929292-0000-0000-0000-00000000c003',
   ((select first from bil) + 4 + time '08:00') at time zone 'Europe/Podgorica',
   ((select first from bil) + 4 + time '20:00') at time zone 'Europe/Podgorica',
   'manual');

-- E25, income: Članarine €8,500 (a gym membership and five day passes), Treninzi
-- €2,000 (a group membership).
insert into memberships (id, gym_id, member_id, plan_id, trainer_id, start_date, end_date,
                         start_reason, covers_gym, covers_group, covers_personal,
                         created_by, shift_id) values
  ('92929292-0000-0000-0000-000000020001', '92929292-0000-0000-0000-00000000b001',
   '92929292-0000-0000-0000-000000010001', '92929292-0000-0000-0000-00000000e001', null,
   (select first from bil) + 4, (select first from bil) + 34, 'pgTAP',
   true, false, false, '92929292-0000-0000-0000-00000000c001',
   '92929292-0000-0000-0000-00000000f001'),
  ('92929292-0000-0000-0000-000000020002', '92929292-0000-0000-0000-00000000b001',
   '92929292-0000-0000-0000-000000010002', '92929292-0000-0000-0000-00000000e002',
   '92929292-0000-0000-0000-00000000d001',
   (select first from bil) + 4, (select first from bil) + 34, 'pgTAP',
   false, true, false, '92929292-0000-0000-0000-00000000c001',
   '92929292-0000-0000-0000-00000000f001');
insert into payments (gym_id, kind, membership_id, member_id, plan_id, quantity, amount,
                      method, paid_on, created_by, shift_id) values
  ('92929292-0000-0000-0000-00000000b001', 'membership',
   '92929292-0000-0000-0000-000000020001', '92929292-0000-0000-0000-000000010001',
   '92929292-0000-0000-0000-00000000e001', 1, 8450, 'card', (select first from bil) + 4,
   '92929292-0000-0000-0000-00000000c001', '92929292-0000-0000-0000-00000000f001'),
  ('92929292-0000-0000-0000-00000000b001', 'day_pass', null, null,
   '92929292-0000-0000-0000-00000000e003', 5, 50, 'cash', (select first from bil) + 4,
   '92929292-0000-0000-0000-00000000c003', '92929292-0000-0000-0000-00000000f001'),
  ('92929292-0000-0000-0000-00000000b001', 'membership',
   '92929292-0000-0000-0000-000000020002', '92929292-0000-0000-0000-000000010002',
   '92929292-0000-0000-0000-00000000e002', 1, 2000, 'card', (select first from bil) + 4,
   '92929292-0000-0000-0000-00000000c001', '92929292-0000-0000-0000-00000000f001');

-- E25, goods. Before the month: 180 Pločica × €10 (€1,800, paid then). In the month:
-- 200 Pločica × €10 and 250 Izotonik × €2 bought (€2,500), 100 Pločica sold at €18 and
-- 50 Izotonik at €4 (€2,000 of sales costing €1,100). Left at the end: 280 × €10 and
-- 200 × €2, €3,200 of stock.
insert into stock_movements (id, gym_id, product_id, type, quantity, unit_cost, unit_price,
                             method, created_by, shift_id, created_at) values
  ('92929292-0000-0000-0000-000000040001', '92929292-0000-0000-0000-00000000b001',
   '92929292-0000-0000-0000-000000070001', 'in', 180, 10, null, null,
   '92929292-0000-0000-0000-00000000c001', null,
   ((select before from bil) + 2 + time '10:00') at time zone 'Europe/Podgorica'),
  ('92929292-0000-0000-0000-000000040002', '92929292-0000-0000-0000-00000000b001',
   '92929292-0000-0000-0000-000000070001', 'in', 200, 10, null, null,
   '92929292-0000-0000-0000-00000000c001', null,
   ((select first from bil) + 1 + time '10:00') at time zone 'Europe/Podgorica'),
  ('92929292-0000-0000-0000-000000040003', '92929292-0000-0000-0000-00000000b001',
   '92929292-0000-0000-0000-000000070002', 'in', 250, 2, null, null,
   '92929292-0000-0000-0000-00000000c001', null,
   ((select first from bil) + 1 + time '10:30') at time zone 'Europe/Podgorica'),
  ('92929292-0000-0000-0000-000000040004', '92929292-0000-0000-0000-00000000b001',
   '92929292-0000-0000-0000-000000070001', 'out', 100, 10, 18, 'cash',
   '92929292-0000-0000-0000-00000000c003', '92929292-0000-0000-0000-00000000f001',
   ((select first from bil) + 4 + time '12:00') at time zone 'Europe/Podgorica'),
  ('92929292-0000-0000-0000-000000040005', '92929292-0000-0000-0000-00000000b001',
   '92929292-0000-0000-0000-000000070002', 'out', 50, 2, 4, 'card',
   '92929292-0000-0000-0000-00000000c003', '92929292-0000-0000-0000-00000000f001',
   ((select first from bil) + 4 + time '13:00') at time zone 'Europe/Podgorica');
insert into expenses (gym_id, spent_on, category_id, description, amount, method,
                      stock_movement_id, created_by) values
  ('92929292-0000-0000-0000-00000000b001', (select before from bil) + 2,
   '92929292-0000-0000-0000-000000060006', 'Nabavka: pgTAP Pločica × 180', 1800, null,
   '92929292-0000-0000-0000-000000040001', '92929292-0000-0000-0000-00000000c001'),
  ('92929292-0000-0000-0000-00000000b001', (select first from bil) + 1,
   '92929292-0000-0000-0000-000000060006', 'Nabavka: pgTAP Pločica × 200', 2000, null,
   '92929292-0000-0000-0000-000000040002', '92929292-0000-0000-0000-00000000c001'),
  ('92929292-0000-0000-0000-00000000b001', (select first from bil) + 1,
   '92929292-0000-0000-0000-000000060006', 'Nabavka: pgTAP Izotonik × 250', 500, null,
   '92929292-0000-0000-0000-000000040003', '92929292-0000-0000-0000-00000000c001');

-- E25, operating expenses: €7,400 in five categories.
insert into expenses (gym_id, spent_on, category_id, description, amount, method,
                      created_by) values
  ('92929292-0000-0000-0000-00000000b001', (select first from bil) + 9,
   '92929292-0000-0000-0000-000000060001', 'pgTAP plate', 4000, 'card',
   '92929292-0000-0000-0000-00000000c001'),
  ('92929292-0000-0000-0000-00000000b001', (select first from bil),
   '92929292-0000-0000-0000-000000060002', 'pgTAP zakup', 2000, null,
   '92929292-0000-0000-0000-00000000c001'),
  ('92929292-0000-0000-0000-00000000b001', (select first from bil) + 14,
   '92929292-0000-0000-0000-000000060003', 'pgTAP struja', 500, 'card',
   '92929292-0000-0000-0000-00000000c001'),
  ('92929292-0000-0000-0000-00000000b001', (select first from bil) + 14,
   '92929292-0000-0000-0000-000000060004', 'pgTAP marketing', 300, 'card',
   '92929292-0000-0000-0000-00000000c001'),
  ('92929292-0000-0000-0000-00000000b001', (select first from bil) + 20,
   '92929292-0000-0000-0000-000000060005', 'pgTAP ostalo', 600, 'cash',
   '92929292-0000-0000-0000-00000000c001');

-- E25: the fixture month, as the owner reads it ------------------------------------------
set local request.jwt.claims = '{"sub": "92929292-0000-0000-0000-00000000a001"}';
-- The owner's statement, kept for the assertions; the claims make the caller the owner.
create temporary table e25 as
  select fin_statement((select first from bil), (select last from bil))::jsonb as s;
grant select on e25 to authenticated;
set local role authenticated;

select is((select (s -> 'income' ->> 'memberships')::numeric from e25), 8500.00,
  'E25 and BR-150: Članarine are the gym membership and the day passes');
select is((select (s -> 'income' ->> 'training')::numeric from e25), 2000.00,
  'E25: Treninzi are the group membership');
select is((select (s -> 'income' ->> 'storage')::numeric from e25), 2000.00,
  'E25: Prodaja iz magacina is what the sales brought in');
select is((select (s -> 'income' ->> 'other')::numeric from e25), 0.00,
  'E25: nothing else came in');
select is((select (s -> 'income' ->> 'total')::numeric from e25), 12500.00,
  'E25: Ukupni prihodi €12,500');
select is((select (s ->> 'cogs')::numeric from e25), 1100.00,
  'E25 and BR-153: the cost of goods sold is what the sold goods cost, not what was bought');
select is((select (s ->> 'gross_profit')::numeric from e25), 11400.00,
  'E25: Bruto dobit €11,400');
select is((select (s ->> 'operating_total')::numeric from e25), 7400.00,
  'E25 and BR-151: the operating expenses leave the stock-in expenses out');
select is((select jsonb_array_length(s -> 'operating') from e25), 5,
  'E25: one line per category, and none for Roba za prodaju');
select is(
  (select (o ->> 'total')::numeric from e25, jsonb_array_elements(s -> 'operating') o
   where o ->> 'name' = 'pgTAP Plate'),
  4000.00, 'E25: salaries are an operating expense of the owner''s statement');
select is((select (s ->> 'profit')::numeric from e25), 4000.00,
  'E25 and BR-152: profit is income minus the cost of goods sold minus operating expenses');
select is((select (s -> 'cash_flow' ->> 'received')::numeric from e25), 12500.00,
  'E25 and BR-158: Primljeno €12,500');
select is((select (s -> 'cash_flow' ->> 'goods_paid')::numeric from e25), 2500.00,
  'E25 and BR-158: Plaćena nova roba is every stock-in of the month, sold or not');
select is((select (s -> 'cash_flow' ->> 'other_paid')::numeric from e25), 7400.00,
  'E25 and BR-158: Ostala plaćanja €7,400');
select is((select (s -> 'cash_flow' ->> 'net_change')::numeric from e25), 2600.00,
  'E25 and BR-158: the money grew by €2,600');
select is((select (s ->> 'stock_value')::numeric from e25), 3200.00,
  'E25 and BR-159: €3,200 of goods were left at the end of the month');
select is((select s ->> 'stock_value_date' from e25),
  to_char((select last from bil), 'YYYY-MM-DD'),
  'BR-159: valued on the last day of the period');
select is(
  (fin_summary((select first from bil), (select last from bil)) ->> 'expenses')::numeric,
  8500.00, 'D-92: the owner''s Troškovi card is the cost of goods sold plus operating expenses');
select is(
  (fin_summary((select first from bil), (select last from bil)) ->> 'profit')::numeric,
  (select (s ->> 'profit')::numeric from e25),
  'BR-152: the Profit card is the statement''s profit');
select is(
  (fin_summary((select first from bil), (select last from bil)) ->> 'bar_profit')::numeric,
  900.00, 'BR-153: Zarada na magacinu is sales minus their cost');
select is(
  (fin_chart(extract(year from (select first from bil))::int,
             extract(month from (select first from bil))::int) ->> 'profit')::numeric,
  (select (s ->> 'profit')::numeric from e25),
  'BR-152: and so is the profit under the chart');
select is(
  (select value ->> 'expenses'
   from json_array_elements(fin_chart(extract(year from (select first from bil))::int,
                                      extract(month from (select first from bil))::int)
                            -> 'points')
   where value ->> 'date' = to_char((select first from bil) + 1, 'YYYY-MM-DD')),
  '0.00', 'BR-151: the day goods were bought costs nothing in the chart');
select throws_ok(
  $$select fin_statement((select last from bil), (select first from bil))$$,
  'P0001', 'E_VALIDATION', 'A period must not end before it starts');

-- Today: E23 and E24 through the desk RPCs ------------------------------------------------
reset role;
insert into shifts (id, gym_id, staff_id)
values ('92929292-0000-0000-0000-00000000f002', '92929292-0000-0000-0000-00000000b001',
        '92929292-0000-0000-0000-00000000c003');

set local request.jwt.claims = '{"sub": "92929292-0000-0000-0000-00000000a003"}';
set local role authenticated;
select lives_ok(
  $$select stock_in('92929292-0000-0000-0000-000000070003', 10, 28, true)$$,
  'E23: Ana receives 10 Whey at €28 from the till');
select is(
  (select unit_price || '|' || unit_cost
   from stock_sale('92929292-0000-0000-0000-000000070003', 1, 'cash')),
  '41.00|28.00', 'E23 and BR-142: the sale keeps its price €41 and its cost €28');
select is((select stock from storage_products() where name = 'pgTAP Whey'), 9,
  'E23 and BR-143: one Whey fewer in stock');
select throws_ok(
  $$select record_desk_expense('92929292-0000-0000-0000-000000060006', 'Roba', 10)$$,
  'P0001', 'E_CATEGORY_NOT_ALLOWED',
  'BR-132 (D-92): Roba za prodaju is not a desk expense; goods come in through Nova roba');
select throws_ok(
  $$select fin_statement((select today from bil), (select today from bil))$$,
  'P0001', 'E_FORBIDDEN', 'BR-157: a receptionist gets no statement');

reset role;
set local request.jwt.claims = '{"sub": "92929292-0000-0000-0000-00000000a001"}';
set local role authenticated;
select lives_ok(
  $$select stock_in('92929292-0000-0000-0000-000000070004', 100, 10, false)$$,
  'E24: the owner buys €1,000 of Kreatin outside the till');
select lives_ok(
  $$select stock_sale('92929292-0000-0000-0000-000000070004', 40, 'card')$$,
  'E24: 40 of them are sold');
-- BR-159: a later stock-in at another price does not reprice last month's stock.
select lives_ok(
  $$select stock_in('92929292-0000-0000-0000-000000070001', 10, 12, false)$$,
  'Set-up: ten more Pločica today, at €12');
select lives_ok(
  $$select void_stock_movement(
      (select id from stock_in('92929292-0000-0000-0000-000000070005', 5, 3, false)),
      'Pogrešan unos')$$,
  'Set-up: a mistaken stock-in, voided at once');
select throws_ok(
  $$select record_expense('92929292-0000-0000-0000-000000060006', 'Roba', 10,
                          (select today from bil))$$,
  'P0001', 'E_CATEGORY_NOT_ALLOWED', 'BR-133 (D-92): nor an owner expense');

reset role;
create temporary table today_storage as
  select fin_storage((select today from bil), (select today from bil))::jsonb as r;
grant select on today_storage to authenticated;
set local role authenticated;

select is(
  (select p ->> 'revenue' || '|' || (p ->> 'cost') || '|' || (p ->> 'profit') || '|'
          || (p ->> 'margin_pct') || '|' || (p ->> 'stock') || '|' || (p ->> 'stock_value')
   from today_storage, jsonb_array_elements(r -> 'products') p
   where p ->> 'name' = 'pgTAP Whey'),
  '41.00|28.00|13.00|31.7|9|252.00',
  'E23: revenue €41, cost €28, gross profit €13 (31.7 %), 9 left worth €252');
select is(
  (select p ->> 'in_quantity' || '|' || (p ->> 'in_amount') || '|' || (p ->> 'cost')
          || '|' || (p ->> 'stock_value')
   from today_storage, jsonb_array_elements(r -> 'products') p
   where p ->> 'name' = 'pgTAP Kreatin'),
  '100|1000.00|400.00|600.00',
  'E24: €1,000 bought, €400 of it sold as cost, €600 still in stock');
select is(
  (select r -> 'totals' ->> 'cost' from today_storage), '428.00',
  'S-20: the totals row adds up the products');
select is(
  (select p ->> 'stock' || '|' || (p ->> 'stock_value')
   from today_storage, jsonb_array_elements(r -> 'products') p
   where p ->> 'name' = 'pgTAP Pogrešna roba'),
  '0|0.00', 'BR-095: a voided stock-in adds no stock and no value');

reset role;
create temporary table today_statement as
  select fin_statement((select today from bil), (select today from bil))::jsonb as s;
grant select on today_statement to authenticated;
set local role authenticated;
select is((select (s ->> 'cogs')::numeric from today_statement), 428.00,
  'BR-153: today''s cost of goods sold is the Whey and the Kreatin sold');
select is((select (s -> 'cash_flow' ->> 'goods_paid')::numeric from today_statement), 1400.00,
  'BR-158: today €280 + €1,000 + €120 was paid for goods; the voided stock-in is not');
select is((select (s ->> 'operating_total')::numeric from today_statement), 0.00,
  'BR-151: and nothing of that is an operating expense');
select is((select (s ->> 'stock_value')::numeric from today_statement), 4732.00,
  'BR-159: today the stock is valued at today''s purchase prices (Pločica at €12)');
select is(
  (fin_statement((select first from bil), (select last from bil)) ->> 'stock_value')::numeric,
  3200.00, 'BR-159: last month''s stock keeps the price of last month');

-- BR-095: a voided sale takes back its income and its cost.
select lives_ok(
  $$select void_stock_movement(
      (select id from stock_movements where product_id = '92929292-0000-0000-0000-000000070003'
         and type = 'out'), 'Vraćeno')$$,
  'Set-up: the Whey sale is voided');
select is(
  (fin_statement((select today from bil), (select today from bil)) ->> 'cogs')::numeric,
  400.00, 'BR-095: the voided sale no longer costs anything');
select is(
  (fin_statement((select today from bil), (select today from bil)) -> 'income' ->> 'storage')::numeric,
  600.00, 'BR-095: nor brings anything in');

-- The manager: nothing of D-92 (BR-144, BR-157, D-80) --------------------------------------
reset role;
set local request.jwt.claims = '{"sub": "92929292-0000-0000-0000-00000000a002"}';
set local role authenticated;
select throws_ok(
  $$select fin_statement((select today from bil), (select today from bil))$$,
  'P0001', 'E_FORBIDDEN', 'BR-157: a manager gets no statement');
select is(
  (fin_summary((select today from bil), (select today from bil)) ->> 'expenses')::numeric,
  1400.00, 'D-80: a manager''s Troškovi stay what was paid, stock-ins included');
select is(
  (select array_agg(key order by key)
   from json_object_keys(fin_summary((select today from bil), (select today from bil))) key),
  array['expenses', 'income'], 'BR-157: and still nothing else');
select throws_ok(
  $$select * from product_stock_at('92929292-0000-0000-0000-00000000b001', current_date)$$,
  '42501', null, 'BR-144: the stock value helper cannot be called from outside');

reset role;
select * from finish();
